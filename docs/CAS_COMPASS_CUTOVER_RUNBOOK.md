# CAS Compass → CAS Lab Cloud, Repo & DNS Cutover Runbook

> **Canonical Target Architecture (Pattern A)**
> - **GitHub Repository (in-place rename):** `LittleHenderson/noetic-compass` → `LittleHenderson/cas-compass`
>   *(preserves `REPOSITORY_ID=1203465584`, `REPOSITORY_NODE_ID=R_kgDOR7ttcA`, workflow IDs, and internal folder `noetic-compass-scaffold/noetic-compass/` so zero CodeBuild archive paths break)*
> - **Canonical Portal / App Origin:** `https://compass.caslabai.com`
> - **Canonical API Origin:** `https://api.caslabai.com`
> - **CAS Lab Main Site:** `https://www.caslabai.com`
> - **Legacy Landing Domain (`cascompass.ai`):** Netlify site `famous-sunflower-86f91c` → Pattern A 301 redirect to `https://compass.caslabai.com`
> - **Retired Domains:** `noeticcompass.com`, `www.noeticcompass.com`, `atlas.noeticcompass.com`, `api.noeticcompass.com`
> - **AWS Account / Primary Region:** `807562639912` / `us-west-2` (ACM + CloudFront in `us-east-1`)

---

## HARD SAFETY WARNINGS — READ BEFORE TOUCHING AWS

> [!CAUTION]
> **1. NEVER delete, overwrite, or rotate the 10 SSM continuity secrets** in `/noetic-compass/customer-production` (or `/noetic-compass/accounts-canary`).
> Rotating or deleting any of these breaks existing user credentials, evidence-share URLs, WORM receipt signatures, or pseudonymized audit chains:
> 1. `NC_JWT_SECRET`
> 2. `NC_ACCOUNT_CREDENTIAL_PEPPER`
> 3. `NC_ACCOUNT_BOOTSTRAP_SECRET`
> 4. `NC_PLATFORM_TENANT_PROVISIONING_SECRET`
> 5. `NC_BILLING_ADMIN_SECRET`
> 6. `NC_EVIDENCE_SHARE_TOKEN_PEPPER`
> 7. `NC_OBJECT_LOCK_RECEIPT_ATTESTATION_KEY`
> 8. `NC_HUMAN_ATTESTATION_PSEUDONYM_ACTIVE_KEY_ID` & `NC_HUMAN_ATTESTATION_PSEUDONYM_KEYRING_JSON`
> 9. `NC_CUSTOMER_PRODUCTION_PSEUDONYM_ACTIVE_KEY_ID` & `NC_CUSTOMER_PRODUCTION_PSEUDONYM_KEYRING_JSON`
> 10. `NC_DATABASE_URL` (RDS Postgres credentials for `nc-customer-pg` / `nc-canary-pg`)
>
> **Only update CORS parameters (`ATLAS_ALLOWED_ORIGINS`, `NC_CORS_ORIGINS`) in SSM.** Leave every secret parameter untouched.

> [!CAUTION]
> **2. NEVER delete, empty, or weaken Object Lock on S3 WORM bucket `cas-harness-runpod-92754088`** (`us-west-2`, `GOVERNANCE` mode, 31-day retention).
> This bucket holds **27 customer-production + 5 accounts-canary locked Evidence Packet anchor objects**. It is part of the compliance/acceptance evidence chain and must remain intact.

> [!WARNING]
> **3. ALWAYS inspect EC2 tags before stopping or terminating any GPU instance** (e.g., `g7.2xlarge` research/training instances).
> Never assume an unlabeled or running GPU box belongs to the retired Render/Noetic Compass web stack:
> ```bash
> aws ec2 describe-instances --region us-west-2 \
>   --query 'Reservations[].Instances[].{Id:InstanceId,Type:InstanceType,State:State.Name,Name:Tags[?Key==`Name`]|[0].Value,Tags:Tags}' \
>   --output table
> ```

> [!WARNING]
> **4. NEVER expose private lanes or databases:**
> - `accounts-canary` EC2 (`i-0026b4c0da5d69efe`) MUST keep **0 inbound security-group rules** and remain SSM Session Manager only.
> - RDS instances `nc-customer-pg` and `nc-canary-pg` MUST keep `PubliclyAccessible=false`.
> - `customer-production` EC2 (`i-0dd650b53f8cb52e7`) MUST restrict HTTP ingress strictly to CloudFront origin-facing prefix lists (`cloudfront-origin-facing`).

---

## Pre-Cutover Checklist (Local Verification)

Before changing any live cloud or DNS setting, confirm the migration branch is clean and passes all offline control verifiers:

```bash
python3 scripts/verify_aws_deployment_control.py --offline
python3 scripts/verify_render_blueprint_control.py --offline
python3 scripts/verify_customer_production_acceptance.py --validate-only
python3 -m unittest \
  scripts/tests/test_verify_aws_deployment_control.py \
  scripts/tests/test_cascompass_landing.py \
  scripts/tests/test_acceptance_authority_contract_alignment.py \
  scripts/tests/test_collect_claim_honesty_evidence.py
```

Merge `feat/cas-compass-redesign-migration` into `master` only when ready to execute the steps below in order.

---

## Phase 1 — GitHub In-Place Rename & Repository Settings

### 1.1 Rename repository in-place
In-place rename preserves `REPOSITORY_ID` (`1203465584`), `REPOSITORY_NODE_ID` (`R_kgDOR7ttcA`), and all GitHub Actions workflow IDs (`312407214`, `312407213`, `312587430`), while preserving the internal folder `noetic-compass-scaffold/noetic-compass/` so AWS CodeBuild source archives never break.

```bash
# Rename in-place via gh CLI (or GitHub UI -> Settings -> General -> Repository name)
gh repo rename cas-compass --repo LittleHenderson/noetic-compass --yes

# Verify IDs were preserved
gh api repos/LittleHenderson/cas-compass \
  --jq '{full_name, id, node_id, default_branch, private}'
# Expected: full_name="LittleHenderson/cas-compass", id=1203465584, node_id="R_kgDOR7ttcA"
```

Update your local git remote:

```bash
git remote set-url origin https://github.com/LittleHenderson/cas-compass.git
git remote -v
```

### 1.2 Set repository variable `CAS_PRODUCTION_API_BASE_URL`
```bash
gh variable set CAS_PRODUCTION_API_BASE_URL \
  --repo LittleHenderson/cas-compass \
  --body "https://api.caslabai.com"

gh variable list --repo LittleHenderson/cas-compass
```

### 1.3 Review Branch Protection on `master`
Verify `master` branch protection survived the rename and requires the active CI gates:

```bash
gh api repos/LittleHenderson/cas-compass/branches/master/protection \
  --jq '{required_checks: .required_status_checks.contexts, enforce_admins: .enforce_admins.enabled}'
```

- Required checks expected by `scripts/verify_customer_production_acceptance.py`:
  - `cas-ci-gate`
  - `cas-postgres-live-gate`
  - `render-blueprint-control-offline` *(offline-only check; keep until Phase 5 Render deletion + acceptance contract update, and optionally add `aws-deployment-control-offline`)*

### 1.4 Review Repository & GHCR Visibility
- Confirm repository visibility (`private` vs `public`) matches founder policy in **Settings → General → Danger Zone**.
- Because `.github/workflows/live-worker-image.yml` now publishes `ghcr.io/littlehenderson/cas-compass-live-worker`, after the first push to `master` verify package access in GitHub Packages → `cas-compass-live-worker` → **Package settings** (link to `LittleHenderson/cas-compass` and confirm RunPod pull credentials if private).

---

## Phase 2 — AWS TLS, CloudFront, SSM, EC2, CodeBuild & App Runner

Set shell helpers (all AWS operations target account `807562639912`):

```bash
export AWS_PAGER=""
export AWS_ACCOUNT_ID="807562639912"
export AWS_REGION="us-west-2"
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table
# STOP if Account != 807562639912
```

### 2.1 Request ACM Certificate in `us-east-1` (Required for CloudFront)
Request a DNS-validated certificate covering `api.caslabai.com` and `compass.caslabai.com`:

```bash
NEW_CERT_ARN="$(aws acm request-certificate \
  --region us-east-1 \
  --domain-name api.caslabai.com \
  --subject-alternative-names compass.caslabai.com \
  --validation-method DNS \
  --query CertificateArn --output text)"
echo "NEW_CERT_ARN=$NEW_CERT_ARN"

# Print the DNS validation CNAME records to add in your caslabai.com DNS zone
aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn "$NEW_CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[].{Domain:DomainName,Status:ValidationStatus,RecordName:ResourceRecord.Name,RecordValue:ResourceRecord.Value}' \
  --output table
```

Add the CNAME validation record(s) in your `caslabai.com` DNS provider, then wait until issued:

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn "$NEW_CERT_ARN"
aws acm describe-certificate --region us-east-1 --certificate-arn "$NEW_CERT_ARN" \
  --query 'Certificate.{Status:Status,Domains:SubjectAlternativeNames}' --output json
# Must show "Status": "ISSUED"
```

### 2.2 Swap CloudFront Aliases & Certificates

#### A. Customer Production API Distribution `E1RBLENB7B6YEA` (`d2zcr7t1an5spf.cloudfront.net`)
1. Save a rollback snapshot of the current distribution config to `s3://nc-api-build-807562639912-usw2/rollback/`:
   ```bash
   STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
   aws cloudfront get-distribution-config --id E1RBLENB7B6YEA > "/tmp/cf-E1RBLENB7B6YEA-${STAMP}.json"
   aws s3 cp "/tmp/cf-E1RBLENB7B6YEA-${STAMP}.json" \
     "s3://nc-api-build-807562639912-usw2/rollback/cloudfront-E1RBLENB7B6YEA-${STAMP}.json"
   ```
2. Update `E1RBLENB7B6YEA` to serve `api.caslabai.com` with `$NEW_CERT_ARN` (and remove `api.noeticcompass.com` once traffic switches):
   ```bash
   ETAG="$(jq -r '.ETag' "/tmp/cf-E1RBLENB7B6YEA-${STAMP}.json")"
   jq --arg cert "$NEW_CERT_ARN" '
     .DistributionConfig
     | .Aliases = {"Quantity": 1, "Items": ["api.caslabai.com"]}
     | .ViewerCertificate = {
         "ACMCertificateArn": $cert,
         "SSLSupportMethod": "sni-only",
         "MinimumProtocolVersion": "TLSv1.2_2021",
         "Certificate": $cert,
         "CertificateSource": "acm"
       }
   ' "/tmp/cf-E1RBLENB7B6YEA-${STAMP}.json" > /tmp/cf-E1RBLENB7B6YEA-updated.json

   aws cloudfront update-distribution \
     --id E1RBLENB7B6YEA \
     --if-match "$ETAG" \
     --distribution-config file:///tmp/cf-E1RBLENB7B6YEA-updated.json \
     --query 'Distribution.{Id:Id,Status:Status,Aliases:DistributionConfig.Aliases.Items}'
   ```
   *(Tip: if you prefer zero-downtime dual-alias overlap first, keep `api.noeticcompass.com` alongside `api.caslabai.com` only if both domains are on the cert; otherwise schedule a 2-minute swap and immediately update the `api.caslabai.com` CNAME.)*
3. Add DNS record in `caslabai.com` DNS zone:
   - **Type:** `CNAME`
   - **Name:** `api` (`api.caslabai.com`)
   - **Value:** `d2zcr7t1an5spf.cloudfront.net`
   - **TTL:** `300` (5 minutes)

#### B. Atlas Viewer Distribution `E3S21FTH7DN5N5` (`dkpql0p4015ev.cloudfront.net`)
Under Pattern A, **Vercel** hosts the canonical `compass.caslabai.com` CAS Compass portal (Phase 3). For `E3S21FTH7DN5N5` (bucket `nc-atlas-viewer-807562639912`):
- Remove the retired `atlas.noeticcompass.com` alias (if attached) so no dangling alias remains:
  ```bash
  aws cloudfront get-distribution-config --id E3S21FTH7DN5N5 > "/tmp/cf-E3S21FTH7DN5N5-${STAMP}.json"
  aws s3 cp "/tmp/cf-E3S21FTH7DN5N5-${STAMP}.json" \
    "s3://nc-api-build-807562639912-usw2/rollback/cloudfront-E3S21FTH7DN5N5-${STAMP}.json"

  ETAG_ATLAS="$(jq -r '.ETag' "/tmp/cf-E3S21FTH7DN5N5-${STAMP}.json")"
  # If E3S21FTH7DN5N5 is being kept behind its CloudFront default domain (or swapped to a CAS Lab alias),
  # inspect current aliases first:
  jq '.DistributionConfig.Aliases' "/tmp/cf-E3S21FTH7DN5N5-${STAMP}.json"
  ```
  - If removing `atlas.noeticcompass.com` (returning `E3S21FTH7DN5N5` to default CloudFront domain while Vercel serves `compass.caslabai.com`), set `.Aliases = {"Quantity": 0}` and `.ViewerCertificate = {"CloudFrontDefaultCertificate": true, "MinimumProtocolVersion": "TLSv1.2_2021", "CertificateSource": "cloudfront"}`.
  - If routing `compass.caslabai.com` directly to `E3S21FTH7DN5N5` instead of Vercel, attach `compass.caslabai.com` + `$NEW_CERT_ARN` using the exact same `update-distribution` pattern as `E1RBLENB7B6YEA`.

### 2.3 Update SSM CORS Parameters & Restart Customer-Production EC2 (`i-0dd650b53f8cb52e7`)

> [!IMPORTANT]
> **Modify ONLY `ATLAS_ALLOWED_ORIGINS` (and `NC_CORS_ORIGINS` if present). NEVER touch the 10 continuity secrets.**

```bash
# 1. Inspect existing CORS parameters first (safe, non-secret)
aws ssm get-parameters \
  --region us-west-2 \
  --names \
    /noetic-compass/customer-production/ATLAS_ALLOWED_ORIGINS \
    /noetic-compass/customer-production/NC_CORS_ORIGINS \
  --query 'Parameters[].{Name:Name,Value:Value}' --output table

# 2. Update ATLAS_ALLOWED_ORIGINS to canonical CAS Lab + cascompass.ai origins
aws ssm put-parameter \
  --region us-west-2 \
  --name /noetic-compass/customer-production/ATLAS_ALLOWED_ORIGINS \
  --type String \
  --overwrite \
  --value "https://compass.caslabai.com,https://www.caslabai.com,https://cascompass.ai,https://www.cascompass.ai"

# 3. If NC_CORS_ORIGINS was also populated above, update it to match identically:
# aws ssm put-parameter --region us-west-2 \
#   --name /noetic-compass/customer-production/NC_CORS_ORIGINS \
#   --type String --overwrite \
#   --value "https://compass.caslabai.com,https://www.caslabai.com,https://cascompass.ai,https://www.cascompass.ai"
```

Restart the customer-production API container on EC2 `i-0dd650b53f8cb52e7` via SSM so it reloads SSM parameters cleanly:

```bash
# Inspect running systemd unit / docker service name on i-0dd650b53f8cb52e7
CMD_ID="$(aws ssm send-command \
  --region us-west-2 \
  --instance-ids i-0dd650b53f8cb52e7 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["systemctl list-units --type=service | grep -iE \"noetic|cas|compass\" || true","docker ps --format \"table {{.Names}}\t{{.Image}}\t{{.Status}}\""]' \
  --query 'Command.CommandId' --output text)"
sleep 5
aws ssm get-command-invocation --region us-west-2 --command-id "$CMD_ID" --instance-id i-0dd650b53f8cb52e7 \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'

# Restart the API service (replace <service-name> with the unit printed above, e.g. cas-harness-customer-api.service)
CMD_ID="$(aws ssm send-command \
  --region us-west-2 \
  --instance-ids i-0dd650b53f8cb52e7 \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["sudo systemctl restart <service-name>","sleep 4","curl -fsS http://127.0.0.1:8000/health"]' \
  --query 'Command.CommandId' --output text)"
sleep 8
aws ssm get-command-invocation --region us-west-2 --command-id "$CMD_ID" --instance-id i-0dd650b53f8cb52e7 \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

### 2.4 Rebuild Atlas Viewer via CodeBuild (`nc-atlas-viewer-build`)
Update `VITE_ATLAS_API_BASE_URL` to `https://api.caslabai.com/atlas`, trigger a fresh build, and invalidate `E3S21FTH7DN5N5`:

```bash
# Start CodeBuild with canonical API base URL override
BUILD_ID="$(aws codebuild start-build \
  --region us-west-2 \
  --project-name nc-atlas-viewer-build \
  --environment-variables-override \
    name=VITE_ATLAS_API_BASE_URL,value=https://api.caslabai.com/atlas,type=PLAINTEXT \
  --query 'build.id' --output text)"
echo "BUILD_ID=$BUILD_ID"

# Poll until SUCCEEDED
aws codebuild batch-get-builds --region us-west-2 --ids "$BUILD_ID" \
  --query 'builds[0].{Status:buildStatus,Phase:currentPhase}' --output table

# Also persist VITE_ATLAS_API_BASE_URL=https://api.caslabai.com/atlas in the CodeBuild project
# environment configuration (AWS Console -> CodeBuild -> nc-atlas-viewer-build -> Edit -> Environment)

# Invalidate CloudFront cache on E3S21FTH7DN5N5
aws cloudfront create-invalidation \
  --distribution-id E3S21FTH7DN5N5 \
  --paths "/*"
```

### 2.5 Check App Runner CORS (`accounts-off` Lane)
Service: `arn:aws:apprunner:us-west-2:807562639912:service/noetic-compass-api/c359ce499746402592cd872d97bd9124` (`https://bmxq2dmdam.us-west-2.awsapprunner.com`).

```bash
aws apprunner describe-service \
  --region us-west-2 \
  --service-arn arn:aws:apprunner:us-west-2:807562639912:service/noetic-compass-api/c359ce499746402592cd872d97bd9124 \
  --query 'Service.{Status:Status,ServiceUrl:ServiceUrl,Env:SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables}'
```

- Confirm `ATLAS_ALLOWED_ORIGINS` (or `NC_CORS_ORIGINS`) includes `https://compass.caslabai.com`, `https://www.caslabai.com`, and `https://cascompass.ai` (or `*` for the mock accounts-off lane).
- **Note on `dashboard/vercel.json` `/api/:path*` proxy:**
  - Currently `noetic-compass-scaffold/noetic-compass/dashboard/vercel.json` keeps `/api/:path*` → `https://bmxq2dmdam.us-west-2.awsapprunner.com/:path*` (the mock `accounts-off` App Runner lane) so the public portal's interactive playground continues working immediately without requiring customer-production credentials.
  - When promoting the Vercel portal's `/api/:path*` proxy to the authenticated AWS customer-production lane, update `"destination"` in `noetic-compass-scaffold/noetic-compass/dashboard/vercel.json` from `https://bmxq2dmdam.us-west-2.awsapprunner.com/:path*` to `https://api.caslabai.com/:path*` and redeploy Vercel.

---

## Phase 3 — Vercel Domain Cutover (`compass.caslabai.com`)

1. **Reconnect GitHub repo (if needed):**
   - In Vercel Dashboard → Project Settings → **Git**, confirm the connected repository reflects `LittleHenderson/cas-compass` and Root Directory remains `noetic-compass-scaffold/noetic-compass/dashboard`.
2. **Add custom domain `compass.caslabai.com`:**
   - Vercel Project → Settings → **Domains** → Add `compass.caslabai.com`.
   - In your `caslabai.com` DNS zone, add the CNAME record Vercel displays (typically `compass` → `cname.vercel-dns.com`).
   - Wait for Vercel TLS certificate issuance.
3. **Verify Vercel routes on `https://compass.caslabai.com`:**
   ```bash
   for path in "/" "/audit-console" "/support" "/legal" "/privacy" "/terms" "/login" "/scenarios"; do
     code="$(curl -sS -o /dev/null -w '%{http_code}' "https://compass.caslabai.com${path}")"
     echo "${path} -> HTTP ${code}"
   done
   # Expect HTTP 200 on every route.
   ```
4. **Remove legacy Vercel domains:**
   - Once `compass.caslabai.com` is live and verified, remove `noeticcompass.com` and `www.noeticcompass.com` from Vercel Project → Settings → **Domains**.

---

## Phase 4 — Netlify `cascompass.ai` Deploy & Pattern A 301 Activation

Netlify site: `famous-sunflower-86f91c` (Site ID `060816d5-7153-43e3-9d8a-9428c58a420c`, source `cascompass-landing/`).

### 4.1 Deploy updated Biolume landing & `api.caslabai.com` support intake
```bash
# Verify local contract tests first
python3 -m unittest scripts.tests.test_cascompass_landing

# Deploy the exact protected commit's cascompass-landing/ directory
netlify deploy --prod --dir cascompass-landing --site 060816d5-7153-43e3-9d8a-9428c58a420c
```

Verify headers & support privacy-notice connectivity:
```bash
curl -sSI https://cascompass.ai/ | grep -iE 'content-security-policy|x-frame-options|x-content-type-options'
# CSP must include: connect-src 'self' https://api.caslabai.com
```

### 4.2 Activate Pattern A 301 Redirect (`cascompass.ai` → `https://compass.caslabai.com`)
> [!IMPORTANT]
> Only perform Step 4.2 **after** `https://compass.caslabai.com` serves `/legal`, `/privacy`, `/terms`, and `/support` as static/verified surfaces and you are ready to update `PINNED_SURFACES` in `scripts/collect_claim_honesty_evidence.py` (which fail-closes on 3xx redirects for any URL still pinned to `cascompass.ai`).

1. In `cascompass-landing/netlify.toml`, uncomment the Pattern A 301 `[[redirects]]` rules (`https://cascompass.ai/*` and `https://www.cascompass.ai/*` → `https://compass.caslabai.com/:splat`, `status = 301`, `force = true`) and remove or place them ahead of the `/legal`, `/privacy`, `/terms`, `/contact` 200 rules.
2. Update `scripts/collect_claim_honesty_evidence.py` `PINNED_SURFACES` (and `scripts/tests/test_cascompass_landing.py`) to point legal/privacy/terms to `https://compass.caslabai.com/{legal,privacy,terms}`.
3. Redeploy Netlify:
   ```bash
   netlify deploy --prod --dir cascompass-landing --site 060816d5-7153-43e3-9d8a-9428c58a420c
   curl -sSI https://cascompass.ai/ | head -n 5
   # Expect: HTTP/2 301 and location: https://compass.caslabai.com/
   ```

---

## Phase 5 — DNS Cleanup (`noeticcompass.com`) & Render Service Deletion

### 5.1 Retire `noeticcompass.com` DNS (Prevent Subdomain Takeover)
In the `noeticcompass.com` DNS zone, **delete** the following records after verifying zero active traffic:
- `api.noeticcompass.com` (CNAME to `d2zcr7t1an5spf.cloudfront.net` or Render)
- `atlas.noeticcompass.com` (CNAME to `dkpql0p4015ev.cloudfront.net` or Render)
- `www.noeticcompass.com` (CNAME to Vercel)
- `@` / apex `noeticcompass.com` (A / ALIAS to Vercel)

Verify NXDOMAIN / no dangling CNAMEs:
```bash
for host in noeticcompass.com www.noeticcompass.com atlas.noeticcompass.com api.noeticcompass.com; do
  echo "=== $host ==="
  dig +short "$host" A CNAME
done
```

### 5.2 Delete Suspended Render Services (Suspended 2026-09-26)
Render was superseded by AWS on 2026-09-26 and its daily CI cron + runtime-monitor drift job have already been retired.

1. In the Render Dashboard (or via Render API), permanently delete the suspended resources:
   - Web service `noetic-compass-api` (`srv-d82ph683kofs73d210e0`) & Blueprint `exs-d82lpanaqgkc7399m1g0`
   - Web service `cas-harness-customer-api` (`srv-d9bijbjtqb8s73cn4n20`), Postgres `cas-harness-customer-postgres` (`dpg-d9biitbtqb8s73cn3mgg-a`), Disk `cas-harness-customer-support` (`dsk-d9bijbjtqb8s73cn4o60`), & Blueprint `exs-d9biqt37uimc73ajh99g`
   - Private service `cas-harness-api-accounts-canary` (`srv-d9akoolaeets73bp3e7g`) & Blueprint `exs-d9aknt8458ps73ftpkc0`
   - Static site `atlas-viewer-app` (`atlas-viewer-app.onrender.com`)
2. Delete the `RENDER_API_KEY` secret from GitHub Actions (`LittleHenderson/cas-compass` → Settings → Secrets and variables → Actions).
3. In a follow-up cleanup PR (after branch protection removes `render-blueprint-control-offline` and adds `aws-deployment-control-offline`), archive/remove `render.yaml`, `render.canary.yaml`, `render.customer.yaml`, `.render/blueprint-control.json`, and `.github/workflows/render-blueprint-control.yml`.

---

## Phase 6 — Post-Cutover Verification Suite

Run all checks after DNS propagation completes:

```bash
# 1. AWS live deployment-control check (compares .aws/deployment-control.json against live AWS account 807562639912)
python3 scripts/verify_aws_deployment_control.py --offline
python3 scripts/verify_aws_deployment_control.py --live

# 2. Public API readiness + Pythia real-mode worker proof
CAS_PRODUCTION_API_BASE_URL=https://api.caslabai.com \
  python3 scripts/verify_production_runtime_readiness.py --readiness
CAS_PRODUCTION_API_BASE_URL=https://api.caslabai.com \
  python3 scripts/verify_production_runtime_readiness.py --worker-realmode

# 3. TLS, Health, and CORS preflight from canonical origins
curl -fsS https://api.caslabai.com/health && echo ""
curl -fsS https://api.caslabai.com/deployment && echo ""
curl -sSI -X OPTIONS https://api.caslabai.com/api/support/public/privacy-notice \
  -H "Origin: https://compass.caslabai.com" \
  -H "Access-Control-Request-Method: GET" | grep -i 'access-control-allow-origin'
curl -sSI -X OPTIONS https://api.caslabai.com/api/support/public/privacy-notice \
  -H "Origin: https://www.caslabai.com" \
  -H "Access-Control-Request-Method: GET" | grep -i 'access-control-allow-origin'

# 4. Trigger GitHub Actions workflows on LittleHenderson/cas-compass to confirm green CI
gh workflow run aws-deployment-control.yml --repo LittleHenderson/cas-compass --ref master
gh workflow run production-runtime-monitor.yml --repo LittleHenderson/cas-compass --ref master
```

### Rollback Plan (If Needed)
- **CloudFront `E1RBLENB7B6YEA`:** restore the saved JSON snapshot from `s3://nc-api-build-807562639912-usw2/rollback/cloudfront-E1RBLENB7B6YEA-<timestamp>.json` using `aws cloudfront update-distribution`.
- **SSM CORS:** revert `/noetic-compass/customer-production/ATLAS_ALLOWED_ORIGINS` using `aws ssm get-parameter-history` to read the prior version and restart the EC2 container.
- **GitHub:** GitHub maintains automatic redirects from `LittleHenderson/noetic-compass` → `LittleHenderson/cas-compass` for both HTTPS/SSH git URLs and web links as long as no new repository is created at the old name.
