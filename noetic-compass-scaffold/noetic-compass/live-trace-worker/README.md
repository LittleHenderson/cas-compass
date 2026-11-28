# Atlas live-trace worker

Private FastAPI service that runs the model (Pythia-160M at v0.1) and the
probe pipeline, and streams trace events as Server-Sent Events for the
Atlas Viewer cockpit.

This worker lives **behind** the noetic-compass-api proxy. Browsers never
hit it directly. The flow:

```
Atlas Viewer UI
  → noetic-compass-api    (validates user / license / API key)
  → live-trace-worker     (runs Pythia + probes, streams SSE)
  → noetic-compass-api    (passes SSE through)
  → Atlas Viewer UI       (animates the cockpit in real time)
```

## Milestone status

- **M1 — scaffold + fake trace.** Merged. Routes, schemas, Dockerfile,
  fake event stream emitting schema-valid events.
- **M2 (this PR) — real Pythia + probes.** Adds `runtime/pythia_runner.run_pythia`
  driving Pythia-160M one token at a time, `runtime/probe_runner.capture_probes`
  registering forward hooks on each layer's MLP, and a real-vs-fake
  dispatcher (`runtime/event_stream.stream_trace`). Demo-mode fallback
  remains for CI / local dev (`LIVE_TRACE_DEMO_MODE=1`, missing torch, or
  failed load). `manifest.is_real_model` flips to true ONLY when weights
  are actually loaded. Acceptance gate in `M2_ACCEPTANCE.md`.
- **M3 — api proxy.** Add `POST /api/atlas/live/session` +
  `GET .../events` to `noetic-compass-api/routes/atlas_live.py`.
  Auth: invite-code allowlist + per-IP rate limit + short-lived stream token.
- **M4 — UI toggle.** Wire LIVE/REPLAY mode toggle in the Atlas Viewer
  cockpit. REPLAY stays the default + fallback.
- **v0.2 — adapters.** OLMo / Qwen adapters once Pythia path is stable.

## Local development

The worker is **fail-closed by default**: every non-health endpoint requires
`ATLAS_LIVE_WORKER_TOKEN` (at least 16 characters; RunPod production startup
requires at least 24 characters) sent via `X-Atlas-Worker-Token`.

For **loopback-only local development in fake/demo mode** without a token, you
must explicitly opt in with BOTH `ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1` and
`LIVE_TRACE_USE_FAKE=1` while bound to a loopback address (`127.0.0.1`,
`localhost`, or `::1`). Tokenless startup is always rejected in real-model mode
(`LIVE_TRACE_USE_FAKE=0`) or on non-loopback hosts (`0.0.0.0`).

```bash
cd noetic-compass-scaffold/noetic-compass/live-trace-worker
python -m venv .venv
. .venv/Scripts/activate      # Windows
# . .venv/bin/activate        # macOS/Linux
pip install -r requirements.txt

# Option A (recommended): run with a shared worker token
ATLAS_LIVE_WORKER_TOKEN="local-dev-worker-token-0123456789" \
  LIVE_TRACE_USE_FAKE=1 \
  uvicorn app.main:app --host 127.0.0.1 --port 8080

# Option B (loopback-only fake-mode dev without a token)
ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1 \
  LIVE_TRACE_USE_FAKE=1 \
  uvicorn app.main:app --host 127.0.0.1 --port 8080
```

Then (passing `-H "X-Atlas-Worker-Token: $ATLAS_LIVE_WORKER_TOKEN"` when using Option A):

```bash
# Health (reports auth_configured and ready)
curl http://127.0.0.1:8080/health

# Start a session
curl -X POST http://127.0.0.1:8080/sessions \
  -H 'Content-Type: application/json' \
  -H "X-Atlas-Worker-Token: ${ATLAS_LIVE_WORKER_TOKEN}" \
  -d '{"prompt":"I noticed a warm coffee cup on the table.","seed":42}'

# Subscribe to the single-use SSE stream (replace <id> with the returned session_id)
curl -N -H "X-Atlas-Worker-Token: ${ATLAS_LIVE_WORKER_TOKEN}" \
  http://127.0.0.1:8080/sessions/<id>/events

# Or get the full event list as JSON (test/debug helper)
curl -X POST http://127.0.0.1:8080/sessions/dump \
  -H 'Content-Type: application/json' \
  -H "X-Atlas-Worker-Token: ${ATLAS_LIVE_WORKER_TOKEN}" \
  -d '{"prompt":"I noticed a warm coffee cup.","seed":42}'
```

## Tests

```bash
cd noetic-compass-scaffold/noetic-compass/live-trace-worker
pytest
```

## RunPod deploy

The `Dockerfile` is the preferred production artifact. For the current
always-on alpha pod, there is also a restart-safe RunPod bootstrap path in
`scripts/`:

```bash
cd /workspace/atlas-live-worker-current
cp scripts/runpod_start_atlas_live_worker.sh /root/start-atlas-live-worker.sh
cp scripts/runpod_start_atlas_live_worker.sh /workspace/start-atlas-live-worker.sh
cp scripts/runpod_pre_start.sh /pre_start.sh
chmod +x /root/start-atlas-live-worker.sh /workspace/start-atlas-live-worker.sh /pre_start.sh
/root/start-atlas-live-worker.sh
```

Why this path exists:

- RunPod's template starts `/start.sh` as PID 1, not systemd.
- `/start.sh` automatically runs `/pre_start.sh` when present.
- Long-running Python from `/workspace` can hang if the FUSE mount stalls.
- The startup script syncs source into `/root/atlas-live-worker-run`, runs
  from `/root/atlas-live-worker-venv`, forces `LIVE_TRACE_USE_FAKE=0`, and
  verifies `/health/realmode` before the API is allowed to claim real weights.

Verification:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/health/realmode
curl https://api.caslabai.com/atlas/live/health/realmode
```

The real-mode endpoint must show:

```json
{
  "verdict": "REAL_PYTHIA_WEIGHTS_LOADED",
  "is_real_model": true,
  "fake_runtime_env": false,
  "model_loaded": true,
  "load_error": null
}
```

If it does not, the cockpit must say the model is not connected or not
verified. It must not claim "actual weights."

## Distributed fleet worker daemon

The API fleet executor can now be driven by this worker process:

```bash
python scripts/run_fleet_worker.py \
  --api-base-url https://api.caslabai.com \
  --audit-id <cas-dist-id> \
  --worker-id probe-worker-001 \
  --model-id <exact-open-weight-model-id> \
  --tenant-id "$CAS_FLEET_TENANT_ID" \
  --service-credential "$CAS_FLEET_SERVICE_CREDENTIAL" \
  -- python scripts/run_open_weight_probe_shard.py
```

In account mode, an owner/admin/operator first issues that worker-scoped secret with
`POST /api/cas-harness/audit/distributed/session/{audit_id}/fleet/service-credentials`.
The request names this exact `worker_id` and only the capabilities the daemon needs:
`register_worker`, `heartbeat`, `lease_job`, and `submit_receipt`. The response returns
`api_credential` once; store it as `CAS_FLEET_SERVICE_CREDENTIAL`, keep the matching
tenant in `CAS_FLEET_TENANT_ID`, and never place either in browser code. Every daemon
callback carries a fresh timestamp and one-time nonce. Customer Bearer tokens are not
valid worker credentials when `NC_FLEET_SERVICE_AUTH_ENABLED=true`. The old
`--bearer-token` option exists only for the default-dark/legacy posture.

The current customer Blueprint pins `NC_FLEET_SERVICE_AUTH_ENABLED=false`, so
the account-mode credential issuance and fleet daemon path above are presently
`unavailable`. The customer origin is the correct future target, but do not run
or claim this path until a protected customer-Blueprint change enables it and a
hosted credential/lease/receipt proof passes.

The command after `--` is the real probe executor. It receives the assigned
layer/shard job through environment variables such as `CAS_FLEET_LAYER_START`,
`CAS_FLEET_LAYER_END`, `CAS_FLEET_ASSIGNED_METHODS_JSON`, and
`CAS_FLEET_RESULT_PATH`. It must write:

```json
{
  "produced_outputs": ["layer_activation_summary"],
  "missing_outputs": ["cas_axis_readout"],
  "error_message": null
}
```

The daemon then writes a local Evidence Packet fragment and posts the
content-addressed `cas-fragment://.../sha256:<digest>` receipt back to the API.

For deployment smoke checks only, `--dry-run` can exercise the lease/receipt
control plane without claiming model inference:

```bash
python scripts/run_fleet_worker.py ... --dry-run
```

Do not use dry-run output as customer audit evidence. A real large-model audit
requires open weights, the actual probe command, assigned workers, receipts, a
merged Evidence Packet, and the final verifier decision layer.

The included open-weight shard command is strict about proof inputs:

```bash
CAS_FLEET_SCENARIO_PATH=/workspace/cas/scenarios/alpha_25.json \
CAS_FLEET_PROBE_WEIGHTS_PATH=/workspace/cas/probes/gpt-neox-20b_probe.json \
CAS_FLEET_COVER_MAP_PATH=/workspace/cas/covers/gpt-neox-20b_covers.json \
python scripts/run_fleet_worker.py \
  --api-base-url https://api.caslabai.com \
  --audit-id <cas-dist-id> \
  --worker-id probe-worker-001 \
  --model-id EleutherAI/gpt-neox-20b \
  --tenant-id "$CAS_FLEET_TENANT_ID" \
  --service-credential "$CAS_FLEET_SERVICE_CREDENTIAL" \
  -- python scripts/run_open_weight_probe_shard.py
```

If the model cannot load, the command writes a failed result. If probe weights
or cover maps are missing, it does not fake `cas_axis_readout` or
`blindspot_overlay`; it reports those outputs as missing so the verifier gate
stays blocked.

## Security posture

- **Fail-closed authentication.** The worker refuses to start in real-model mode
  or on non-loopback interfaces (`0.0.0.0`) unless `ATLAS_LIVE_WORKER_TOKEN` is
  set (`>= 16` chars in-app, `>= 24` chars in
  `scripts/runpod_start_atlas_live_worker.sh`). Every non-health request rejects
  missing/invalid `X-Atlas-Worker-Token` headers. `/health` reports
  `auth_configured` and `ready`, and `/health/realmode` returns HTTP `503` with
  `ready: false` whenever production auth is not configured.
- **Explicit loopback-only dev opt-in.** Tokenless local operation is permitted
  only when `ATLAS_LIVE_ALLOW_INSECURE_LOCAL_DEV=1` AND `LIVE_TRACE_USE_FAKE=1`
  are both set and the listener is bound to loopback (`127.0.0.1`, `localhost`,
  `::1`).
- **Bounded single-use sessions and concurrency.** In-memory sessions are
  bounded (`ATLAS_WORKER_MAX_SESSIONS`, default `64`;
  `ATLAS_WORKER_SESSION_TTL_SECONDS`, default `300`), atomically consumed on
  first SSE stream attach, and deleted on completion/error/disconnect. Parallel
  generations are capped globally (`ATLAS_WORKER_MAX_CONCURRENT_STREAMS`,
  default `4`).
- **No public exposure.** The worker MUST sit on a private network or
  behind an auth gate. The noetic-compass-api proxy is the only allowed
  caller.
- **No user-identifying data.** The worker only sees session IDs +
  prompts. User identity is the API's responsibility.

## Why this folder, not its own repo

See [memory: project_atlas_live_worker_scope_2026_05_23.md]. Short
version: it's product infrastructure now, not loose research code; it
needs to stay version-aligned with `api/`, `atlas-viewer/`, the evidence
schemas, and probe manifests; one repo keeps deploy review simple.
