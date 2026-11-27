# CAS Compass landing site

This directory is the version-controlled source for `https://cascompass.ai`.
The Netlify project is `famous-sunflower-86f91c` (site ID
`060816d5-7153-43e3-9d8a-9428c58a420c`). The pre-import production deploy was
a three-file CLI upload with no Git source bundle.

The public legal text is deliberately a draft. `legal.html`, `privacy.html`,
and `terms.html` must remain `OPEN` and `FLAG_FOR_HUMAN_REVIEW` until qualified
counsel and the owner approve publication. A source merge or deploy must not be
treated as customer-production `ACCEPT`.

Netlify internally rewrites `/legal`, `/privacy`, `/terms`, and `/contact` to
their static HTML files with status 200. This preserves the exact requested URL
for the fail-closed claim-honesty collector until Pattern A DNS cutover
(`cascompass.ai` → `https://compass.caslabai.com` 301 rules documented in
`netlify.toml` and `docs/CAS_COMPASS_CUTOVER_RUNBOOK.md`). The contact form
submits to `https://api.caslabai.com`.

Verify the source from the repository root:

```bash
python3 -m unittest scripts.tests.test_cascompass_landing
python3 scripts/collect_claim_honesty_evidence.py --output /tmp/claim-honesty-draft.json --pretty
```

Production deployment must use the exact protected commit being released, not
the unrelated dirty root working directory. The Netlify access token is an
account secret and must not be committed.
