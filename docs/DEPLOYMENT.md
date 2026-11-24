# Deploying Citrineland CRM on a DigitalOcean Droplet

Stack: Docker Compose with `migrate` (one-shot), `web` (Next.js), `worker` (pg-boss jobs), `caddy` (automatic HTTPS). PostgreSQL 16 is a **DigitalOcean Managed Database** (recommended) or the optional `db` Compose service. Files are stored in **DigitalOcean Spaces**.

## 1. Size the resources

| Component | Recommendation (10–15 users, ~1,000 units) |
|---|---|
| Droplet | **Basic, 2 vCPU / 4 GB RAM / 80 GB SSD** (Ubuntu 24.04 LTS), Singapore (SGP1) region for PH latency. 4 GB covers web + worker + Caddy + image builds. |
| Database | **DO Managed PostgreSQL 16, 1 vCPU / 2 GB** (Basic) in SGP1, daily backups + PITR included. Add a standby node if you need HA. |
| Spaces | One private bucket, e.g. `citrineland-crm` in SGP1 (documents + optional DB backups). |

Self-hosting Postgres on the Droplet? Use **4 vCPU / 8 GB** and enable the `backup` service (section 8).

## 2. Create the Droplet

1. Create the Droplet with your SSH key; enable **Monitoring** and **weekly backups**.
2. Point DNS: an `A` record `crm.citrineland.com` → Droplet IP (and `AAAA` if using IPv6).
3. SSH in and harden:

```bash
adduser deploy && usermod -aG sudo deploy
```

```bash
sudo apt update && sudo apt -y upgrade && sudo apt -y install unattended-upgrades fail2ban
```

4. Install Docker Engine + Compose plugin (official convenience script):

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker deploy
```

## 3. Firewall

Use a **DigitalOcean Cloud Firewall** on the Droplet:

| Inbound | Source |
|---|---|
| TCP 22 (SSH) | Your office IPs only |
| TCP 80, 443 | All (Caddy needs 80 for ACME HTTP challenge, then redirects to HTTPS) |
| UDP 443 | All (HTTP/3, optional) |

Outbound: allow all. In the Managed Database settings, add the Droplet as a **trusted source** so only it can connect.

## 4. Spaces

1. Create the bucket (private, no CDN for documents).
2. **API → Spaces Keys → Generate** a key pair; note endpoint `https://sgp1.digitaloceanspaces.com`.

## 5. Get the code & configure

```bash
git clone <your repo URL> /opt/citrineland && cd /opt/citrineland
```

```bash
cp .env.example .env && nano .env
```

Fill in (see `.env.example` for every variable):

- `DATABASE_URL` — from the Managed DB "Connection details" (use the **private network** host and append `?sslmode=require`).
- `APP_URL`, `AUTH_URL` — `https://crm.citrineland.com`; `APP_DOMAIN=crm.citrineland.com`.
- `AUTH_SECRET`, `ENCRYPTION_KEY` — generate each with `openssl rand -base64 32`. **Back up `ENCRYPTION_KEY`**; losing it means users must reconnect Microsoft 365.
- `AUTH_MICROSOFT_ENTRA_ID_*` — see `docs/MICROSOFT_SETUP.md` (callback `https://crm.citrineland.com/api/auth/callback/microsoft-entra-id`).
- `SPACES_*`, `TURNSTILE_*`, `PUBLIC_FORM_FRAME_ANCESTORS`.
- `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (strong, unique).
- Production: `DEMO_PASSWORD_LOGIN=false`, `SEED_DEMO=false`.

## 6. First deploy (migrations + seed)

```bash
docker compose build
```

```bash
SEED_ON_START=true docker compose up -d
```

`migrate` applies Prisma migrations and (only because `SEED_ON_START=true`) seeds roles, settings, pipeline stages, picklists, checklist template, built-in automations and the bootstrap Admin. With `SEED_DEMO=false` no demo data is created. Caddy obtains a Let's Encrypt certificate automatically.

Check health:

```bash
curl -s https://crm.citrineland.com/api/health
```

```bash
docker compose logs -f web worker
```

Then sign in as the bootstrap Admin, review **Admin → Settings** (VAT, fees, rates, hold duration), invite users, connect Microsoft 365, and finally disable password login.

## 7. Updating

```bash
cd /opt/citrineland && git pull
```

```bash
docker compose build && docker compose up -d
```

`migrate` runs `prisma migrate deploy` before `web`/`worker` start (they wait for it to complete). Zero-config rollback: `git checkout <previous tag>` and repeat (only if the migration was additive — prefer forward fixes).

Prune old images occasionally:

```bash
docker image prune -f
```

## 8. Backups & restore

**Managed Database (recommended):** daily backups with 7-day point-in-time recovery are automatic. Restore from the DO console ("Restore from backup" creates a new cluster); update `DATABASE_URL` and restart.

**Self-hosted Postgres (`--profile localdb`):** the `backup` service runs `scripts/backup.sh` nightly at 02:00 Manila: `pg_dump | gzip` → `s3://$SPACES_BUCKET/backups/postgres/` with **30-day retention** (`BACKUP_RETENTION_DAYS`).

Run one immediately:

```bash
docker compose --profile localdb run --rm backup sh -c "apk add --no-cache aws-cli >/dev/null && sh /scripts/backup.sh --once"
```

Restore procedure:

1. Download the dump: `aws --endpoint-url https://sgp1.digitaloceanspaces.com s3 cp s3://citrineland-crm/backups/postgres/<file>.sql.gz .`
2. Stop the app: `docker compose stop web worker`
3. Recreate the database and restore:

```bash
gunzip -c <file>.sql.gz | docker compose --profile localdb exec -T db psql -U citrineland -d citrineland
```

   (Restore into an empty database: `dropdb`/`createdb` first, or restore into a new database and switch `DATABASE_URL`.)
4. Start: `docker compose up -d`. Verify `/api/health` and spot-check recent transactions.

Test a restore quarterly.

Uploaded documents live in Spaces; enable **bucket versioning** or a lifecycle rule as an extra safeguard.

## 9. Operations checklist

- Logs: structured JSON (pino) via `docker compose logs`; ship to DO Monitoring/Logtail if desired.
- Health: `GET /api/health` (DB + worker heartbeat) — wire it to an uptime monitor.
- Failed jobs: **Admin → Background jobs** (retry from there).
- Secrets rotation: Entra client secret (calendar reminder before expiry), Spaces keys, `AUTH_SECRET` (rotating signs everyone out).
- OS updates: unattended-upgrades handles security patches; reboot monthly.
