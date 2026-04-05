# Campaign Data Platform — How to Use & Operate

> Day-to-day usage guide for the ops team, platform integrators, and developers.  
> No prior setup knowledge assumed.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [First-Time Setup Checklist](#2-first-time-setup-checklist)
3. [Uploading Campaign Data](#3-uploading-campaign-data)
4. [Field Mapping Reference](#4-field-mapping-reference)
5. [Querying Data — Admin Portal](#5-querying-data--admin-portal)
6. [Querying Data — API Direct](#6-querying-data--api-direct)
7. [Rate Limits Per Platform](#7-rate-limits-per-platform)
8. [CSV Export (Protected)](#8-csv-export-protected)
9. [Monitoring Upload Jobs](#9-monitoring-upload-jobs)
10. [Embedding the Widget](#10-embedding-the-widget)
11. [Managing API Keys](#11-managing-api-keys)
12. [Routine Maintenance Tasks](#12-routine-maintenance-tasks)
13. [Deployment Procedure](#13-deployment-procedure)
14. [Rollback Procedure](#14-rollback-procedure)
15. [Troubleshooting Common Issues](#15-troubleshooting-common-issues)
16. [Monitoring & Alerts](#16-monitoring--alerts)
17. [Adding a New Platform](#17-adding-a-new-platform)
18. [Security Rules — Never Break These](#18-security-rules--never-break-these)

---

## 1. Platform Overview

```
Who uploads data?     → Ops team, via Admin Portal
Who queries data?     → WhatsApp/Email/Calling platforms, via API
Who exports CSVs?     → Ops team only, via Protected Export route
Who manages keys?     → Dev team, via DB + scripts
```

### Data flow summary

```
Raw CSV / Excel
     │
     ▼
Admin Portal — upload + map fields
     │
     ▼
Background Worker — normalise, deduplicate, store
     │
     ▼
PostgreSQL — millions of clean contact records
     │
     ▼
Query API — filter, paginate, return to any platform
     │
     ├──→ WhatsApp Platform (API key, 100 req/min)
     ├──→ Email Platform    (API key, 60 req/min)
     └──→ Embed Widget      (used inside any platform UI)
```

---

## 2. First-Time Setup Checklist

Run these steps exactly once when setting up a fresh environment.

### Infrastructure

- [ ] Provision dedicated EC2 (t3.medium minimum — 2 vCPU, 4GB RAM)
- [ ] Install Node.js 20, PostgreSQL 15, Redis 7, nginx, PM2
- [ ] Point domain `api.yourapp.com` → EC2 IP (A record)
- [ ] Point domain `admin.yourapp.com` → EC2 IP (A record)
- [ ] Install SSL via Let's Encrypt: `certbot --nginx -d api.yourapp.com -d admin.yourapp.com`

### Backend

```bash
git clone <repo>
cd campaign-data-platform

# Install dependencies
npm install

# Copy and fill env file
cp .env.example .env
nano .env    # Fill in DB URL, Redis URL, JWT secret, etc.

# Create database
psql -U postgres -c "CREATE DATABASE campaign_data;"

# Run migrations
npm run migrate

# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # Follow the printed command to auto-start on reboot
```

### Frontend

```bash
# Build admin portal
nx build admin-portal --configuration=production

# Copy to nginx root
sudo rsync -avz dist/apps/admin-portal/ /var/www/admin/

# Build and upload embed widget
nx build embed-widget --configuration=production
aws s3 sync dist/apps/embed-widget/ s3://your-cdn-bucket/widget/
```

### Verify everything is working

```bash
# API health check
curl https://api.yourapp.com/health
# Expected: {"api":"ok","db":"ok","redis":"ok"}

# Admin portal
open https://admin.yourapp.com
```

---

## 3. Uploading Campaign Data

### Step-by-step (Admin Portal UI)

1. Log into `https://admin.yourapp.com`
2. Click **Upload** in the sidebar
3. Drag your CSV or Excel file onto the dropzone (max 50MB)
4. Wait for the file to parse — column headers appear automatically
5. **Map each column** to a standard field (see [Field Mapping Reference](#4-field-mapping-reference))
   - At minimum: map at least one column to **phone**
   - Columns you don't recognise → map to **skip**
6. Enter a **Segment name** — this is how you'll filter this batch later
   - Use descriptive names: `loan-defaulter-90d`, `premium-mumbai-q3`, `inactive-12m`
7. Click **Upload & Process**
8. You'll get a Job ID — monitor progress in the **Jobs** tab

### File requirements

| Property | Requirement |
|----------|-------------|
| Format | CSV, XLSX, XLS |
| Max size | 50MB per file |
| Encoding | UTF-8 preferred |
| Headers | First row must be column headers |
| Phone format | Any format accepted — normalised automatically |
| Max rows | No limit — batched in 500s |

### What happens in the background

After upload, a worker process picks up the job and:
1. Reads the file row by row (never loads fully into memory)
2. Applies your field mapping
3. Normalises phone numbers to E.164 format (`+91XXXXXXXXXX`)
4. Deduplicates on `phone + segment` — if the same phone exists in the same segment, it updates rather than creates
5. Inserts in batches of 500 rows
6. Saves unknown columns into the `custom` JSON field
7. Updates job progress every batch — visible in the Jobs tab

---

## 4. Field Mapping Reference

When uploading, map your CSV columns to these standard fields:

| Standard Field | What to put here | Example CSV column names |
|---------------|-----------------|--------------------------|
| `phone` | Mobile number (any format) | Mobile, Phone, Contact, Number |
| `email` | Email address | Email, Email ID, Mail |
| `name` | Full name | Name, Customer Name, Full Name |
| `language` | Language code | Lang, Language, Locale |
| `tags` | Semicolon or comma separated tags | Tags, Labels, Category |
| `opt_out_whatsapp` | true/false or yes/no | WA Opt Out, No WA |
| `opt_out_email` | true/false or yes/no | Email Opt Out |
| `skip` | Ignore this column | (any column you don't need) |

### Phone number formats accepted

The normaliser converts all of these to `+91XXXXXXXXXX`:

```
9876543210         → +919876543210
09876543210        → +919876543210
+919876543210      → +919876543210
91-9876-543210     → +919876543210
(+91) 98765 43210  → +919876543210
```

> **Non-Indian numbers:** Include country code in your data. `+1 555 000 0000` → `+15550000000`

### Tags format

Tags can be in any of these formats in your CSV:

```
"premium;delhi;overdue"       → ['premium', 'delhi', 'overdue']
"premium,delhi,overdue"       → ['premium', 'delhi', 'overdue']
"premium | delhi | overdue"   → ['premium', 'delhi', 'overdue']
```

---

## 5. Querying Data — Admin Portal

### Using the Query Builder

1. Go to the **Query** tab
2. Fill in filters (all are optional):

| Filter | What it does |
|--------|-------------|
| **Segment** | Filter to a specific upload batch |
| **Tags (all)** | Contact must have ALL of these tags |
| **Tags (any)** | Contact must have at least ONE of these tags |
| **Opt-out WhatsApp** | `false` = only contacts who can receive WhatsApp |
| **Opt-out Email** | `false` = only contacts who can receive email |
| **Language** | Filter by language code |
| **Page size** | Records per API call (your platform's max applies) |

3. Click **Search** — see live count and preview
4. Use **Load More** to fetch the next page

### Understanding the result count

The total count shown is an **estimate** for large tables. It's accurate for small result sets (<10,000). For large segments it may be off by ±5%. Use the actual loaded count for campaign planning.

---

## 6. Querying Data — API Direct

Platforms consume data by calling the API directly.

### Endpoint

```
POST https://api.yourapp.com/api/query
Headers:
  X-Api-Key: cdp_<your-platform-key>
  Content-Type: application/json
```

### Request body

```json
{
  "filters": {
    "segment": "loan-defaulter-90d",
    "tags": ["delhi"],
    "tags_any": ["premium", "high-value"],
    "opt_out_whatsapp": false,
    "language": "hi"
  },
  "page_size": 1000,
  "cursor": null,
  "fields": ["id", "phone", "name", "tags"]
}
```

### Response

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "phone": "+919876543210",
      "name": "Rahul Sharma",
      "tags": ["delhi", "premium"]
    }
  ],
  "next_cursor": "eyJpZCI6IjEyMzQ1NiJ9",
  "total_count": 48200,
  "page_size": 1000
}
```

### Fetching all pages (pagination loop)

```javascript
// Example: fetch all contacts for a campaign

async function fetchAllContacts(filters) {
  const contacts = [];
  let cursor = null;

  do {
    const response = await fetch('https://api.yourapp.com/api/query', {
      method: 'POST',
      headers: {
        'X-Api-Key': 'cdp_your_key_here',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filters, page_size: 1000, cursor }),
    });

    const result = await response.json();

    if (response.status === 429) {
      // Rate limit hit — wait and retry
      const retryAfter = result.retry_after * 1000;
      await new Promise(r => setTimeout(r, retryAfter));
      continue;
    }

    contacts.push(...result.data);
    cursor = result.next_cursor;

    console.log(`Fetched ${contacts.length} / ${result.total_count}`);
  } while (cursor !== null);

  return contacts;
}
```

### Using `fields` for projection

Always request only the fields you need. This reduces response size and speeds up queries.

```json
// WhatsApp platform only needs phone
{ "fields": ["id", "phone", "name"] }

// Email platform needs email + name
{ "fields": ["id", "email", "name", "language"] }

// Calling platform needs phone only
{ "fields": ["id", "phone"] }
```

---

## 7. Rate Limits Per Platform

All limits are per API key, per time window.

| Platform | Requests | Window | Max page size | Notes |
|----------|----------|--------|---------------|-------|
| WhatsApp | 100 | 1 minute | 1,000 rows | — |
| Email | 60 | 1 minute | 2,000 rows | — |
| Admin portal | 300 | 1 minute | 5,000 rows | Internal use only |
| CSV export | 5 | 1 hour | 500,000 rows | Triple-guarded route |

### Rate limit headers

Every response includes:

```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 1735000060
```

### When you get a 429 response

```json
{
  "error": "rate_limit_exceeded",
  "platform": "whatsapp",
  "limit": 100,
  "window_seconds": 60,
  "retry_after": 23
}
```

Wait `retry_after` seconds and retry. Build exponential backoff for robust integration.

### Adjusting limits

To change a platform's limits, edit `src/config/limits.ts` and redeploy. No DB change needed.

```typescript
// src/config/limits.ts
whatsapp: {
  windowMs: 60_000,
  max: 150,          // ← change this
  maxPageSize: 1000,
},
```

---

## 8. CSV Export (Protected)

The `/api/export` route streams a CSV of filtered contacts. It has stricter security than the query API.

### Requirements to access

1. Valid JWT token (obtained by logging into Admin Portal)
2. Request must come from a registered IP address (set in `ADMIN_IP_ALLOWLIST`)
3. Max 5 exports per hour per key

### How to export from the UI

1. Run a query in the Admin Portal Query Builder
2. If results are what you want, click **Export CSV**
3. File downloads as `export-{segment}-{timestamp}.csv`

### How to export via API (for automated scripts)

```bash
# Step 1: Get JWT token
TOKEN=$(curl -s -X POST https://api.yourapp.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourapp.com","password":"..."}' \
  | jq -r '.token')

# Step 2: Stream the CSV
curl -o export.csv \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Api-Key: cdp_your_admin_key" \
  "https://api.yourapp.com/api/export?segment=loan-defaulter-90d&tags=delhi"
```

### CSV export columns

```
id, phone, email, name, language, segment, tags,
opt_out_whatsapp, opt_out_email, opt_out_call
```

Tags are exported as semicolon-separated: `delhi;premium;overdue`

### Export security reminder

- Export route streams — never buffers. A 5-lakh row export won't crash the server.
- Each export is logged with API key, IP, filters, and timestamp.
- If you see unexpected exports in logs, rotate the API key immediately.

---

## 9. Monitoring Upload Jobs

### In the Admin Portal

1. Click **Jobs** in the sidebar
2. See all uploads with status: `queued → processing → done / failed`
3. Progress bar shows `processed_rows / total_rows`
4. Failed rows count shown — download error log if needed

### Via API

```bash
curl https://api.yourapp.com/api/status/<job_id> \
  -H "X-Api-Key: cdp_your_key"
```

```json
{
  "id": "abc-123",
  "filename": "leads-q3.csv",
  "status": "processing",
  "total_rows": 150000,
  "processed_rows": 87500,
  "failed_rows": 12,
  "segment": "premium-mumbai-q3"
}
```

### Status meanings

| Status | Meaning |
|--------|---------|
| `queued` | File received, worker hasn't picked it up yet |
| `processing` | Worker is actively normalising rows |
| `done` | All rows processed successfully |
| `failed` | Fatal error — check `error_log` field |

> If status stays `queued` for more than 2 minutes, the worker may be down. Check `pm2 status cdp-worker`.

---

## 10. Embedding the Widget

Any platform can embed the filter widget with two lines.

### Basic embed

```html
<!-- Load the widget script (from your CDN) -->
<script src="https://cdn.yourapp.com/widget/cdp-widget.js"></script>

<!-- Place the widget anywhere in your HTML -->
<cdp-filter-widget
  api-key="cdp_platform_key_here"
  base-url="https://api.yourapp.com"
></cdp-filter-widget>
```

### Listening for the user's selection

```javascript
const widget = document.querySelector('cdp-filter-widget');

widget.addEventListener('dataSelected', (event) => {
  const { filter, count } = event.detail;
  // filter = the FilterPayload the user built
  // count  = how many contacts match

  console.log(`User selected ${count} contacts`);
  console.log('Filters:', filter);

  // Start your campaign with these filters
  startCampaign(filter);
});
```

### Widget attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `api-key` | Yes | Platform API key (`cdp_...`) |
| `base-url` | Yes | Your API base URL |

### Styling the widget

The widget exposes CSS custom properties for theming:

```css
cdp-filter-widget {
  --cdp-primary-color: #2563eb;
  --cdp-font-family: 'Inter', sans-serif;
  --cdp-border-radius: 8px;
}
```

---

## 11. Managing API Keys

### Create a new key

```bash
# On the server
cd /path/to/campaign-data-platform
ts-node scripts/generateApiKey.ts
```

Output:
```
Raw key (give to platform):  cdp_a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5...
Hash (store in DB):          $2b$12$...
Prefix (store in DB):        a3f8b2c1
```

Then insert into DB:

```sql
INSERT INTO api_keys (name, key_hash, key_prefix, platform)
VALUES ('WhatsApp Platform Production', '$2b$12$...', 'a3f8b2c1', 'whatsapp');
```

### Revoke a key (if compromised)

```sql
UPDATE api_keys SET active = false WHERE key_prefix = 'a3f8b2c1';
```

The Redis cache for that key expires within 5 minutes. For immediate revocation:

```bash
redis-cli DEL "apikey:platform:a3f8b2c1"
```

### Rotate a key (scheduled replacement)

1. Generate new key
2. Insert new key into DB (both old and new now active)
3. Share new key with platform team
4. Confirm platform has switched
5. Deactivate old key: `UPDATE api_keys SET active = false WHERE id = '<old_id>'`

### Never do these things with API keys

- Never put a key in a git commit or code comment
- Never send a key via email — use a password manager or secrets manager
- Never create keys with `max = null` (no rate limit)
- Never share one key between two different platforms

---

## 12. Routine Maintenance Tasks

### Daily (automated via cron)

```bash
# Add to crontab: crontab -e

# Clear expired Redis keys (Redis handles TTL automatically, but good to check)
0 2 * * * redis-cli --scan --pattern "query:*" | head -1000 | xargs redis-cli del

# Vacuum PostgreSQL (prevents table bloat)
0 3 * * * psql $DATABASE_URL -c "VACUUM ANALYZE contacts;"
```

### Weekly

```bash
# Check disk space
df -h

# Check PostgreSQL table sizes
psql $DATABASE_URL -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
"

# Review failed upload jobs
psql $DATABASE_URL -c "SELECT * FROM upload_jobs WHERE status = 'failed' ORDER BY created_at DESC;"

# PM2 log rotation
pm2 flush   # Clears old logs
```

### Monthly

- Review and rotate API keys for all platforms
- Check `last_used_at` on api_keys — deactivate keys unused for 30 days
- Review error logs for patterns
- Test the health check endpoint from an external machine
- Run `npm audit` and update dependencies

---

## 13. Deployment Procedure

Follow this exact order every time. Never skip steps.

### 1. Pre-deploy checks

```bash
# On local machine
npm run lint       # Must pass with 0 errors
npm run build      # Must complete without errors
npm test           # Must pass

# Check if there are DB migrations
ls src/db/migrations/   # New files since last deploy?
```

### 2. Deploy backend

```bash
# SSH into server
ssh user@api.yourapp.com

# Pull latest code
cd /srv/campaign-data-platform
git pull origin main

# Install any new dependencies
npm ci

# Build
npm run build

# Run migrations BEFORE reloading (order matters)
npm run migrate

# Zero-downtime reload (PM2 handles this)
pm2 reload cdp-api
pm2 reload cdp-worker

# Verify
pm2 status
curl https://api.yourapp.com/health
```

### 3. Deploy frontend

```bash
# On local machine
nx build admin-portal --configuration=production

# Upload to server
rsync -avz dist/apps/admin-portal/ user@api.yourapp.com:/var/www/admin/

# nginx doesn't need restart for static files
```

### 4. Post-deploy verification

```bash
# Health check
curl https://api.yourapp.com/health

# Test a query (use a test API key)
curl -X POST https://api.yourapp.com/api/query \
  -H "X-Api-Key: cdp_test_key" \
  -H "Content-Type: application/json" \
  -d '{"filters":{},"page_size":1}'

# Check PM2 logs for errors
pm2 logs cdp-api --lines 50
```

---

## 14. Rollback Procedure

If something goes wrong after deploy:

```bash
# 1. Roll back code
git revert HEAD --no-commit
git stash    # Or git checkout HEAD~1

npm run build
pm2 reload cdp-api

# 2. Roll back DB migration (if one was applied)
npm run migrate:rollback

# 3. Verify
curl https://api.yourapp.com/health
pm2 logs cdp-api --lines 100
```

> **Rule:** Always apply DB migrations forward. The `rollback` command is for emergencies only. A bad migration should be fixed with a new forward migration, not a rollback in production.

---

## 15. Troubleshooting Common Issues

### API returns 503 "server_busy"

Server event loop is overloaded (lag > 70ms).

```bash
pm2 monit          # Check CPU/memory
pm2 logs cdp-api   # Look for error patterns
# If a query is hammering the DB:
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### Upload job stuck in "queued"

Worker is down or Redis connection lost.

```bash
pm2 status cdp-worker     # Should show "online"
pm2 restart cdp-worker    # Restart if stopped
redis-cli ping            # Should return PONG
```

### Query returns fewer results than expected

1. Check your filter — `tags` uses AND logic. Try `tags_any` for OR.
2. Check opt-out filters — `opt_out_whatsapp: false` excludes opted-out contacts.
3. The data might not have normalised yet — check job status.

```bash
# Check how many records exist for a segment
psql $DATABASE_URL -c "SELECT COUNT(*) FROM contacts WHERE segment = 'your-segment';"
```

### Rate limit hit unexpectedly

Check which key is hitting the limit:

```bash
redis-cli keys "whatsapp:cdp_*"
redis-cli ttl "whatsapp:cdp_abc123..."
```

Increase the limit temporarily in `src/config/limits.ts` and redeploy, or stagger requests across multiple API keys.

### CSV export returns 403

Check the request is coming from an IP in `ADMIN_IP_ALLOWLIST`. Your server's outbound IP must be in the list.

```bash
# Find your server's IP
curl ifconfig.me

# Add to .env
ADMIN_IP_ALLOWLIST=existing.ip,new.ip.here
pm2 reload cdp-api
```

### PostgreSQL queries slow

Check indexes:

```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Check if index is being used
EXPLAIN ANALYZE SELECT * FROM contacts WHERE segment = 'x' AND tags @> '["delhi"]';
```

If `Seq Scan` appears instead of `Index Scan`, the index may need to be rebuilt:

```sql
REINDEX INDEX contacts_tags_gin_idx;
```

---

## 16. Monitoring & Alerts

### Set up basic monitoring (free, no extra tools)

```bash
# Install PM2 monitor
pm2 install pm2-logrotate    # Auto-rotate logs
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7

# Health check via cron — alert if down
*/5 * * * * curl -sf https://api.yourapp.com/health || \
  curl -X POST https://hooks.slack.com/YOUR_WEBHOOK \
  -d '{"text":"CDP API is DOWN"}'
```

### Key metrics to watch

| Metric | Warning | Critical |
|--------|---------|----------|
| API response time | > 500ms | > 2000ms |
| PM2 memory (cdp-api) | > 700MB | > 900MB |
| Disk space | > 70% | > 85% |
| Redis memory | > 70% of max | > 90% |
| Failed upload jobs | Any | 5+ in 1 hour |
| Rate limit 429s | Spike | Sustained |

### Useful commands

```bash
pm2 monit                     # Real-time CPU/memory graph
pm2 logs cdp-api --lines 200  # Recent logs
pm2 logs cdp-worker --lines 200

# DB connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Redis memory
redis-cli info memory | grep used_memory_human
```

---

## 17. Adding a New Platform

Complete checklist when a new platform (e.g. Calling Platform) needs access.

**1. Decide rate limit tier**

Does the new platform need different limits than existing ones?
- Similar to WhatsApp → use `whatsapp` tier
- Different → add a new tier in `src/config/limits.ts`

**2. Add origin to CORS (if browser-based)**

```env
# .env
ALLOWED_ORIGINS=https://existing.com,https://new-platform.yourapp.com
```

**3. Generate API key**

```bash
ts-node scripts/generateApiKey.ts
# Note down raw key and hash
```

**4. Insert key into DB**

```sql
INSERT INTO api_keys (name, key_hash, key_prefix, platform)
VALUES ('Calling Platform Production', '<hash>', '<prefix>', 'whatsapp');
-- Use the closest matching platform tier
```

**5. Share key securely**

Use a secrets manager (AWS Secrets Manager, Bitwarden) or encrypted message. Never email.

**6. Reload API (picks up new CORS origin)**

```bash
pm2 reload cdp-api
```

**7. Integration test**

```bash
curl -X POST https://api.yourapp.com/api/query \
  -H "X-Api-Key: cdp_new_key_here" \
  -H "Content-Type: application/json" \
  -d '{"filters":{},"page_size":1}'
# Expect 200 with data array
```

**8. Share API documentation**

Send the platform team links to sections 6 and 7 of this document.

---

## 18. Security Rules — Never Break These

These rules are non-negotiable. Breaking them can expose lakh of contact records.

| Rule | Why |
|------|-----|
| Never store API keys in plain text | DB dump = all keys exposed |
| Never log full API keys | Log aggregators are not secured |
| Never add `*` to CORS origins | Any website could query your data |
| Never skip migrations before deploy | Schema mismatch crashes the API |
| Never put secrets in git | git history is permanent |
| Never remove IP allowlist from export route | JWT alone is insufficient for data export |
| Never share one key between platforms | Can't revoke one without affecting both |
| Always use HTTPS | HTTP sends API keys in plaintext |
| Never disable rate limiting "temporarily" | Scrapers don't wait for you to re-enable it |
| Rotate compromised keys within 5 minutes | Window between discovery and rotation is risk |

### If you suspect a key is compromised

1. Immediately: `UPDATE api_keys SET active = false WHERE key_prefix = '<prefix>';`
2. Flush Redis cache: `redis-cli DEL "apikey:platform:<prefix>"`
3. Check export logs for any unusual exports in past 24 hours
4. Generate a new key and share with platform team
5. Review access logs: `pm2 logs cdp-api --lines 5000 | grep '<partial_key>'`
