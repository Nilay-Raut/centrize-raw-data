# 🚀 Soft Deployment Guide — Centrize CDP

A step-by-step checklist to take the platform from code to a live production server.

---

## Pre-flight Checklist

Before you start, make sure you have:
- [ ] A Linux server (Ubuntu 22.04 recommended) with at least **2 vCPU / 4GB RAM**
- [ ] **Docker** and **Docker Compose** installed
- [ ] **Git** installed on the server
- [ ] A domain name pointed to the server's IP (e.g., `admin.yourcompany.com`)
- [ ] Port `80` and `443` open in your firewall / security group

---

## Step 1 — Clone the Repository

SSH into your server and pull the code:

```bash
ssh user@your-server-ip
git clone https://github.com/your-org/centrize-raw-data.git
cd centrize-raw-data
```

---

## Step 2 — Create the Production Environment File

Copy the example and fill in your real values:

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

**Key values to update:**

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Strong random password for the database |
| `JWT_SECRET` | Generate with: `openssl rand -hex 64` |
| `ALLOWED_ORIGINS` | Your domain: `https://admin.yourcompany.com` |
| `ADMIN_IP_ALLOWLIST` | Your office/VPN IPs (comma-separated) |
| `USE_S3` | `"true"` if using S3 for file uploads, else `"false"` |

> [!CAUTION]
> Never commit `.env.prod` to Git. It is already in `.gitignore`.

---

## Step 3 — Build & Start All Services

This single command builds Docker images and starts everything:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This will automatically:
1. Start **PostgreSQL** and **Redis**
2. Run **database migrations** (creates all tables)
3. Start the **API server** (`cdp-api` on port 3000 internally)
4. Start the **BullMQ Worker** for file processing
5. Build and serve the **Angular Frontend** via Nginx on port 80

---

## Step 4 — Verify All Services Are Running

```bash
docker compose -f docker-compose.prod.yml ps
```

All services should show `healthy` or `running`:

```
NAME           STATUS
cdp-postgres   Up (healthy)
cdp-redis      Up (healthy)
cdp-api        Up (healthy)
cdp-worker     Up
cdp-frontend   Up
```

Test the API health endpoint:

```bash
curl http://localhost:3000/health
# Expected: {"api":"ok"}
```

---

## Step 5 — Configure Nginx for HTTPS (SSL)

### Option A: Port 80 only — Quick Soft Launch

Port 80 is already exposed by the `frontend` container. Your app will be accessible at `http://your-server-ip` immediately. Skip to Step 6.

### Option B: HTTPS with Certbot (Recommended)

Install Nginx and Certbot on the host:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

Copy the provided Nginx config:

```bash
sudo cp nginx/admin.conf /etc/nginx/sites-available/cdp-admin
```

Edit the config to set your domain:

```bash
sudo nano /etc/nginx/sites-available/cdp-admin
# Update: server_name admin.yourcompany.com;
# Update proxy_pass to: http://localhost:80;  (points to Docker frontend)
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/cdp-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get a free SSL certificate:

```bash
sudo certbot --nginx -d admin.yourcompany.com
```

---

## Step 6 — Create the Admin User & API Keys

> [!IMPORTANT]
> The database is empty on first boot. You must create admin credentials and API keys.

### Create the Admin User

```bash
npx ts-node insert_admin.ts
```

Or if running inside Docker:

```bash
docker compose -f docker-compose.prod.yml exec cdp-api \
  node -e "require('./dist/insert_admin.js')"
```

### Generate API Keys

Generate a key for each integration:

```bash
# Admin Portal key
npx ts-node scripts/generateApiKey.ts --name "Admin Portal" --platform admin

# WhatsApp integration key
npx ts-node scripts/generateApiKey.ts --name "WhatsApp Prod" --platform whatsapp

# CSV Export key
npx ts-node scripts/generateApiKey.ts --name "Data Export" --platform csv_export
```

Each command prints a SQL statement. Run it against the database:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U cdp -d campaign_data -c "PASTE_INSERT_SQL_HERE"
```

> [!CAUTION]
> Copy the **Raw key** immediately. It cannot be recovered later.

---

## Step 7 — Smoke Test

Visit `https://admin.yourcompany.com` (or `http://your-server-ip`)

- [ ] Login page loads correctly
- [ ] Login with admin credentials works
- [ ] Upload a small test CSV (10 rows)
- [ ] Job processes and shows 100% success
- [ ] Query page returns results
- [ ] All contact columns are visible (scroll horizontally)
- [ ] CSV Export works (file downloads)

---

## Step 8 — Monitor Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Just the API
docker compose -f docker-compose.prod.yml logs -f cdp-api

# Just the worker
docker compose -f docker-compose.prod.yml logs -f cdp-worker
```

---

## Ongoing Maintenance

### Deploy a New Version

```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

> [!NOTE]
> Migrations run automatically on every deploy. Your data is safe — migrations only
> ever add new tables or columns, never drop data.

### Restart a Single Service

```bash
docker compose -f docker-compose.prod.yml restart cdp-api
```

### Daily Database Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U cdp campaign_data > backup_$(date +%Y%m%d).sql
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker: command not found` | [Install Docker](https://docs.docker.com/engine/install/ubuntu/) |
| DB migrations fail | Check `POSTGRES_PASSWORD` in `.env.prod` is correct |
| API returns 500 on start | Run `docker logs cdp-api` — usually a missing env var |
| Redis eviction policy warning | Normal if Redis has a memory limit. Fine for soft launch. |
| Frontend shows blank page | Run `docker logs cdp-frontend` and check Nginx errors |
| Upload jobs stuck in queue | Restart worker: `docker compose ... restart cdp-worker` |
| CORS error in browser | Add your domain to `ALLOWED_ORIGINS` in `.env.prod` and restart API |
