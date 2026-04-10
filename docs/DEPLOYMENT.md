# Deployment Guide — Campaign Data Platform

> **Target:** AWS EC2 t4g.small (ARM64, 2GB RAM) · Docker Compose · All services on one box
>
> **Stack deployed:** PostgreSQL 15 · Redis 7 · Node.js API · BullMQ Worker · Angular Admin Portal · Embed Widget (Nginx)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Files Created for Deployment](#2-files-created-for-deployment)
3. [Phase 1 — Launch EC2](#3-phase-1--launch-ec2)
4. [Phase 2 — Connect to EC2](#4-phase-2--connect-to-ec2)
5. [Phase 3 — Server Bootstrap](#5-phase-3--server-bootstrap)
6. [Phase 4 — Deploy Code](#6-phase-4--deploy-code)
7. [Phase 5 — Create .env.prod](#7-phase-5--create-envprod)
8. [Phase 6 — Build and Start](#8-phase-6--build-and-start)
9. [Phase 7 — Create Admin User](#9-phase-7--create-admin-user)
10. [Phase 8 — Generate API Key](#10-phase-8--generate-api-key)
11. [Phase 9 — Test Everything](#11-phase-9--test-everything)
12. [Phase 10 — Daily Operations](#12-phase-10--daily-operations)
13. [URL Reference](#13-url-reference)
14. [RAM Budget](#14-ram-budget)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Architecture Overview

### How traffic flows

```
Browser (Ops team)                    Browser (3rd party platform — WhatsApp/Email/Calling)
       │                                        │
       │ GET yourdomain.com/                    │ <script src="yourdomain.com/widget/main.js">
       ▼                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Nginx :80                                │
│                                                                  │
│  /           → serves dist/apps/admin-portal/   (Angular SPA)   │
│  /api/*      → proxy_pass → cdp-api:3000                         │
│  /widget/*   → serves dist/apps/embed-widget/  (Web Component)  │
└──────────────────────────────────────────────────────────────────┘
                                  │
                           cdp-api:3000
                           (Express.js)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             postgres:5432               redis:6379
             (contacts, jobs,            (rate limiting,
              api_keys,                   BullMQ queues,
              admin_users)                api key cache)
                                           │
                                    cdp-worker
                                    (BullMQ processor)
                                    reads same Redis + Postgres
```

### Container map

| Container | Image | Role | Port exposed |
|-----------|-------|------|-------------|
| `cdp-postgres` | postgres:15-alpine | Database | internal only |
| `cdp-redis` | redis:7-alpine | Cache + queue broker | internal only |
| `cdp-migrate` | built from Dockerfile.backend | Runs migrations once, then exits | none |
| `cdp-api` | built from Dockerfile.backend | Express HTTP API | internal :3000 |
| `cdp-worker` | built from Dockerfile.backend | BullMQ CSV processor | none |
| `cdp-frontend` | built from Dockerfile.frontend | Nginx serving Angular + Widget | **80 → host** |

All containers share a single Docker bridge network `cdp-internal`. Only port 80 is exposed to the internet.

### How the two frontends work

**admin-portal** — Angular SPA (Single Page App)
- Builds to static `HTML + JS + CSS` files
- Nginx serves these files to the browser
- Browser runs Angular, makes API calls to `/api/*`
- No Angular server process — just files on disk

**embed-widget** — Angular Element (Web Component)
- Builds to a single `main.js` file (no filename hashing — stable URL)
- Nginx serves it at `/widget/main.js` with CORS headers
- 3rd party platforms include it via `<script src="...">` and use `<cdp-filter-widget>` tag
- The `base-url` and `api-key` HTML attributes tell it where to call your API

---

## 2. Files Created for Deployment

```
docker/
  Dockerfile.backend    ← multi-stage: builder → api target + worker target
  Dockerfile.frontend   ← multi-stage: builds admin-portal + embed-widget → Nginx
  nginx.conf            ← Nginx routing: SPA + /api proxy + /widget CORS

docker-compose.prod.yml ← production orchestration (all 6 containers)
.env.prod.example       ← environment variable template (copy → .env.prod)
```

> `docker-compose.yml` (existing) is kept for **local development only** (Postgres + Redis only).
> Always use `docker-compose.prod.yml` for production.

---

## 3. Phase 1 — Launch EC2

On the [AWS EC2 Console](https://console.aws.amazon.com/ec2):

| Setting | Value |
|---------|-------|
| Name | `cdp-server` |
| AMI | **Amazon Linux 2023** — search and select |
| Architecture | **ARM64** — CRITICAL: t4g is ARM, not x86 |
| Instance type | `t4g.small` (2 vCPU, 2 GB RAM) |
| Key pair | Create new → download `.pem` → store safely |
| Storage | 30 GB gp3 |

**Security Group — create new, name it `cdp-sg`:**

| Type | Port | Source | Reason |
|------|------|--------|--------|
| SSH | 22 | My IP | SSH access — your IP only |
| HTTP | 80 | 0.0.0.0/0 | Web traffic |
| HTTPS | 443 | 0.0.0.0/0 | HTTPS (after cert setup) |

> Port 3000 (Node API) stays **closed** — Nginx proxies internally.

Click **Launch Instance**. Wait ~1 minute for status to show **Running**. Note the **Public IPv4 address**.

---

## 4. Phase 2 — Connect to EC2

```bash
# On your local machine
chmod 400 your-key.pem

ssh -i your-key.pem ec2-user@<EC2-PUBLIC-IP>
```

---

## 5. Phase 3 — Server Bootstrap

Run these once after first SSH in.

```bash
# ── Step 1: Add swap ──────────────────────────────────────────────────────────
# Critical: Angular build uses ~1.5GB RAM. Swap prevents OOM kills.
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active (should show Swap: 2.0G)
free -h

# ── Step 2: Install Docker ────────────────────────────────────────────────────
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

# ── Step 3: Install Docker Compose plugin ────────────────────────────────────
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ── Step 4: Reconnect so docker group applies ─────────────────────────────────
exit
```

SSH back in:
```bash
ssh -i your-key.pem ec2-user@<EC2-PUBLIC-IP>

# Verify both work
docker --version          # Docker version 25.x.x
docker compose version    # Docker Compose version v2.x.x
```

---

## 6. Phase 4 — Deploy Code

```bash
# Clone the repository
git clone https://github.com/your-org/centrize-raw-data.git app
cd app
```

---

## 7. Phase 5 — Create .env.prod

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Fill in every value below:

```bash
# ── PostgreSQL ────────────────────────────────────────────────────────────────
# Docker will auto-create this database on first run
POSTGRES_DB=campaign_data
POSTGRES_USER=cdp
POSTGRES_PASSWORD=choose_a_strong_password_here    # min 20 chars recommended

# ── Auth ──────────────────────────────────────────────────────────────────────
# Generate: openssl rand -hex 64
JWT_SECRET=paste_64_char_hex_string_here
JWT_EXPIRES_IN=8h

# ── CORS ─────────────────────────────────────────────────────────────────────
# Your EC2 public IP for now (update to domain after DNS setup)
ALLOWED_ORIGINS=http://<EC2-PUBLIC-IP>

# ── Export IP allowlist ───────────────────────────────────────────────────────
# Find your current IP: curl ifconfig.me
# This controls who can hit GET /api/export (in addition to JWT)
ADMIN_IP_ALLOWLIST=<your-office-or-laptop-ip>

# ── S3 ────────────────────────────────────────────────────────────────────────
S3_BUCKET=your-bucket-name
S3_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Worker ────────────────────────────────────────────────────────────────────
WORKER_CONCURRENCY=2           # keep at 2 for t4g.small

# ── Tuning ────────────────────────────────────────────────────────────────────
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=5
LOG_LEVEL=info
```

Save: `Ctrl+X` → `Y` → Enter

> `.env.prod` is in `.gitignore` — it will never be committed.

---

## 8. Phase 6 — Build and Start

```bash
# First build: 8–15 minutes (Angular + TypeScript + Docker layers)
docker compose -f docker-compose.prod.yml up -d --build

# In a second terminal — watch logs while it starts
docker compose -f docker-compose.prod.yml logs -f
```

**What you'll see in the logs (in order):**

```
cdp-postgres  | database system is ready to accept connections
cdp-redis     | Ready to accept connections
cdp-migrate   | Running migration: 001_initial_schema
cdp-migrate   | Running migration: 002_add_extended_fields
cdp-migrate   | Running migration: 003_deduplicate_emails
cdp-migrate   | Running migration: 004_create_campaign_history
cdp-migrate   | Running migration: 005_add_raw_access_to_keys
cdp-migrate   | Running migration: 006_admin_users_can_view_raw
cdp-migrate   | All migrations complete
cdp-migrate exited with code 0         ← normal — one-shot job
cdp-api       | {"message":"CDP API started","port":3000,"env":"production"}
cdp-worker    | {"message":"BullMQ worker started"}
cdp-frontend  | nginx: worker process started
```

**Check all containers are in correct state:**

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected:

```
NAME            IMAGE       STATUS              PORTS
cdp-postgres    postgres    Up (healthy)
cdp-redis       redis       Up (healthy)
cdp-migrate     ...         Exited (0)          ← correct, runs once
cdp-api         ...         Up (healthy)
cdp-worker      ...         Up
cdp-frontend    ...         Up                  0.0.0.0:80->80/tcp
```

> If `cdp-api` shows `Exited` — run `docker compose -f docker-compose.prod.yml logs cdp-api` to see the error (usually a missing env var).

---

## 9. Phase 7 — Create Admin User

The admin portal login requires a user in the `admin_users` table. There is no signup page — insert once manually.

```bash
# Step 1: Generate bcrypt hash for your chosen password
docker exec cdp-api node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('your-chosen-password', 10).then(h => console.log(h));
"
# Output looks like: $2b$10$abc123...  ← copy this entire string

# Step 2: Insert admin user (paste your hash and email)
docker exec -it cdp-postgres psql -U cdp -d campaign_data -c "
INSERT INTO admin_users (email, password_hash)
VALUES ('admin@yourcompany.com', '\$2b\$10\$paste_hash_here');
"

# Step 3: Verify
docker exec -it cdp-postgres psql -U cdp -d campaign_data -c \
  "SELECT id, email, can_view_raw, created_at FROM admin_users;"
```

---

## 10. Phase 8 — Generate API Key

API keys are for external platforms (WhatsApp, Email, Calling) to call `POST /api/query`. Run this for each platform:

```bash
docker exec cdp-api node -e "
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const name = 'WhatsApp Prod';         // change per platform
const platform = 'whatsapp';          // whatsapp | email | admin | csv_export
const suffix = crypto.randomBytes(24).toString('base64url').slice(0, 32);
const rawKey = 'cdp_' + suffix;
const prefix = suffix.slice(0, 8);
const id = crypto.randomUUID();
bcrypt.hash(rawKey, 10).then(hash => {
  console.log('='.repeat(50));
  console.log('Raw key (COPY NOW — shown once):', rawKey);
  console.log('='.repeat(50));
  console.log('Run this SQL:');
  console.log(\`INSERT INTO api_keys (id, name, key_hash, key_prefix, platform, active, created_at) VALUES ('\${id}', '\${name}', '\${hash}', '\${prefix}', '\${platform}', true, NOW());\`);
});
"
```

Copy the raw key immediately. Then insert into DB:

```bash
docker exec -it cdp-postgres psql -U cdp -d campaign_data -c \
  "INSERT INTO api_keys ..."    # paste the INSERT from above output
```

Verify:
```bash
docker exec -it cdp-postgres psql -U cdp -d campaign_data -c \
  "SELECT id, name, platform, key_prefix, active FROM api_keys;"
```

---

## 11. Phase 9 — Test Everything

### Test 1 — API health check

```bash
# From EC2
curl http://localhost/api/health

# From your local machine
curl http://<EC2-PUBLIC-IP>/api/health
```

**Expected:** `{"status":"ok"}`

---

### Test 2 — Admin portal login (browser)

1. Open browser → `http://<EC2-PUBLIC-IP>`
2. You should see the **login page**
3. Enter email and password set in Phase 7
4. After login — dashboard should load with Upload / Query / Jobs / Keys tabs

---

### Test 3 — Upload a CSV

Use the sample file already in the repo:

```bash
# From your local machine (inside the cloned repo)
curl -X POST http://<EC2-PUBLIC-IP>/api/ingest \
  -H "x-api-key: cdp_your_raw_key_here" \
  -F "file=@apps/admin-portal/src/assets/samples/contacts_sample.csv" \
  -F "segment=test-segment"
```

**Expected:**
```json
{ "jobId": "abc-123-...", "status": "queued" }
```

Then open the **Jobs tab** in the admin portal — you should see the job move from `queued` → `processing` → `done`.

---

### Test 4 — Query contacts

After the upload job completes:

```bash
curl -X POST http://<EC2-PUBLIC-IP>/api/query \
  -H "x-api-key: cdp_your_raw_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": { "segment": "test-segment" },
    "page_size": 10
  }'
```

**Expected:**
```json
{
  "total_count": 150,
  "data": [ { "phone": "+91...", "name": "...", ... } ],
  "next_cursor": "..."
}
```

---

### Test 5 — Embed widget JS is being served

```bash
# Should return the minified JS content (not 404)
curl -I http://<EC2-PUBLIC-IP>/widget/main.js
# Expected: HTTP/1.1 200 OK, Content-Type: application/javascript
```

To test the widget renders correctly, create this file locally and open it in a browser:

```html
<!-- save as test-widget.html on your laptop, open in browser -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Widget Test</title>
</head>
<body style="padding: 40px; background: #f5f5f5;">

  <script src="http://<EC2-PUBLIC-IP>/widget/main.js"></script>

  <cdp-filter-widget
    api-key="cdp_your_raw_key_here"
    base-url="http://<EC2-PUBLIC-IP>">
  </cdp-filter-widget>

  <div id="result" style="margin-top: 20px; font-family: monospace;"></div>

  <script>
    document.querySelector('cdp-filter-widget')
      .addEventListener('dataSelected', (e) => {
        document.getElementById('result').textContent =
          'Selected: ' + e.detail.count + ' contacts | Filter: ' + JSON.stringify(e.detail.filter);
      });
  </script>
</body>
</html>
```

1. Widget renders with segment / tags / language inputs
2. Type `test-segment` in Segment field
3. Click **Preview** → shows contact count
4. Click **Use this data** → `dataSelected` event fires with filter + count

---

### Test 6 — Worker is processing

```bash
docker compose -f docker-compose.prod.yml logs cdp-worker --tail 30
```

After an upload, you should see log lines showing job processing, row counts, normalisation activity.

---

### Test 7 — All containers healthy

```bash
docker compose -f docker-compose.prod.yml ps
```

All running containers should show `Up` (not `Restarting`, not `Exited`).

---

## 12. Phase 10 — Daily Operations

### Deploy updated code

```bash
cd ~/app
git pull

# Rebuild and restart only backend (most common)
docker compose -f docker-compose.prod.yml up -d --build cdp-api cdp-worker

# Also rebuild frontend only if Angular code changed
docker compose -f docker-compose.prod.yml up -d --build frontend
```

### View logs

```bash
docker compose -f docker-compose.prod.yml logs cdp-api      --tail 100 -f
docker compose -f docker-compose.prod.yml logs cdp-worker   --tail 100 -f
docker compose -f docker-compose.prod.yml logs cdp-frontend --tail 50
docker compose -f docker-compose.prod.yml logs cdp-postgres --tail 30
```

### Restart a container

```bash
docker compose -f docker-compose.prod.yml restart cdp-api
docker compose -f docker-compose.prod.yml restart cdp-worker
```

### Database shell

```bash
docker exec -it cdp-postgres psql -U cdp -d campaign_data

# Useful queries:
# \dt                          — list tables
# SELECT count(*) FROM contacts;
# SELECT * FROM upload_jobs ORDER BY created_at DESC LIMIT 10;
# SELECT name, platform, key_prefix, active FROM api_keys;
# SELECT email, can_view_raw FROM admin_users;
# \q                           — quit
```

### Backup database

```bash
# Dump to file
docker exec cdp-postgres pg_dump -U cdp campaign_data > backup-$(date +%Y%m%d-%H%M).sql

# Copy backup to your local machine
scp -i your-key.pem ec2-user@<EC2-PUBLIC-IP>:~/app/backup-*.sql ./
```

### Monitor resource usage

```bash
free -h                                                    # RAM + swap
df -h                                                      # disk usage
docker stats --no-stream                                   # CPU + RAM per container
docker compose -f docker-compose.prod.yml ps               # container states
```

### Stop everything

```bash
# Stop but keep data (volumes preserved)
docker compose -f docker-compose.prod.yml down

# Stop AND delete all data (full reset — careful)
docker compose -f docker-compose.prod.yml down -v
```

---

## 13. URL Reference

| URL | What it is | Auth required |
|-----|-----------|---------------|
| `http://<IP>/` | Admin portal login page | None (public login page) |
| `http://<IP>/upload` | CSV upload wizard | JWT (admin login) |
| `http://<IP>/query` | Contact query builder | JWT (admin login) |
| `http://<IP>/jobs` | Upload job monitor | JWT (admin login) |
| `http://<IP>/keys` | API key list (read-only) | JWT (admin login) |
| `http://<IP>/api/health` | API health check | None |
| `http://<IP>/api/auth/login` | POST — get JWT token | None |
| `http://<IP>/api/query` | POST — query contacts | API key |
| `http://<IP>/api/ingest` | POST — upload CSV | API key + JWT |
| `http://<IP>/api/export` | GET — stream CSV export | API key + JWT + IP allowlist |
| `http://<IP>/api/status/:jobId` | GET — job progress | API key |
| `http://<IP>/widget/main.js` | Embed widget JS bundle | None (public CDN-style) |

---

## 14. RAM Budget

RAM usage on t4g.small (2GB):

| Component | Approx idle usage |
|-----------|-----------------|
| Amazon Linux 2023 OS | ~150 MB |
| Docker daemon | ~80 MB |
| cdp-postgres | ~120 MB |
| cdp-redis | ~30 MB |
| cdp-api (Node.js) | ~120 MB |
| cdp-worker (Node.js) | ~100 MB |
| cdp-frontend (Nginx) | ~20 MB |
| **Total idle** | **~620 MB** |
| **Free** | **~1.4 GB + 2 GB swap** |

During a large CSV upload (150k rows), the worker peaks at ~300 MB. Still within budget.

> If you consistently see > 1.6 GB used (`free -h`), upgrade to **t4g.medium (4GB RAM)** — ~$12/mo more.

---

## 15. Troubleshooting

### cdp-api exits immediately on start

```bash
docker compose -f docker-compose.prod.yml logs cdp-api
```

Most common cause: missing env var. Look for:
```
[startup] Missing required environment variables: JWT_SECRET, ...
```
Fix: add the missing variable to `.env.prod`, then `docker compose -f docker-compose.prod.yml up -d cdp-api`.

---

### Migrations fail

```bash
docker compose -f docker-compose.prod.yml logs cdp-migrate
```

Common causes:
- Postgres not ready yet → wait 30s and re-run
- Wrong `POSTGRES_PASSWORD` in `.env.prod` vs what the postgres container was started with

To re-run migrations manually:
```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

---

### Frontend shows blank page or 404

```bash
docker compose -f docker-compose.prod.yml logs cdp-frontend
```

Check Nginx started correctly. If Angular build failed during Docker build, the html folder will be empty. Rebuild:
```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

### Upload CSV returns 413 (payload too large)

The Nginx `client_max_body_size` is set to 60MB in `docker/nginx.conf`. If your CSV is larger, increase it:

```nginx
# docker/nginx.conf → location /api/
client_max_body_size 150M;
```

Then rebuild the frontend container:
```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

---

### Widget not loading on external site (CORS error)

Check the browser console. The `/widget/` location in `docker/nginx.conf` sets `Access-Control-Allow-Origin: *`. If you still see a CORS error, check that the request is going to `/widget/` and not `/api/` — API CORS is controlled by the Express `ALLOWED_ORIGINS` env var.

Add the external platform's domain to `ALLOWED_ORIGINS` in `.env.prod`:
```bash
ALLOWED_ORIGINS=http://<EC2-IP>,https://platform.theirsite.com
```
Then restart: `docker compose -f docker-compose.prod.yml restart cdp-api`

---

### Out of disk space

```bash
df -h
docker system df          # see how much Docker is using

# Clean up unused images and stopped containers
docker system prune -f

# Clean up old build cache (safe — will just slow next build)
docker builder prune -f
```

---

*DEPLOYMENT.md — Campaign Data Platform*
*Stack: EC2 t4g.small · Docker Compose · PostgreSQL 15 · Redis 7 · Node.js 20 · Angular 18 · Nginx*
