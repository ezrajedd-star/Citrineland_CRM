# Citrineland CRM

Internal CRM for **Citrineland**, a Philippine real estate developer selling condominium units, house-and-lot units and condo parking slots through external brokers.

- **Stack:** Next.js 15 (App Router, TypeScript strict) · Tailwind + shadcn/ui · PostgreSQL 16 + Prisma · Auth.js v5 (Microsoft Entra ID SSO + bootstrap Admin password) · pg-boss worker · Microsoft Graph · DigitalOcean Spaces · react-pdf · Vitest + Playwright · Docker Compose + Caddy.
- **Money** is integer centavos (₱, `Asia/Manila`); see [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Features

| Area | Highlights |
|---|---|
| Access | Entra ID SSO for pre-registered users only, DB-backed revocable sessions, editable permission-based roles (matrix UI), sign-in log, audit log with History tabs |
| Inventory | Developments, sections, units & parking; state machine with row locks; holds with auto-expiry; versioned price lists; stack plan; CSV/XLSX import |
| Network & sales | Brokerages/brokers with PRC/accreditation expiry tracking; leads with duplicate detection & broker-of-record override; configurable Kanban pipeline; clients with co-buyers and KYC; timeline; tasks; global search |
| Transactions | Sample computation + branded PDF; guided reservation; payment schemes & schedules; manual/CSV payments; documentation checklist; lifecycle; cancellation with Maceda Law helper; transfers; parking eligibility rule |
| Commissions | Rules by development/brokerage, milestone tranches auto-DUE, approve/release, forfeiture, clawbacks, payable report |
| Microsoft 365 | Send from your Outlook, email capture to timelines, calendar events, notification emails |
| Automation & marketing | Built-in automations + rules engine, campaigns (CPL/CPR), email sequences, public CAPTCHA web form |
| Reports | Role-aware dashboards; sales, funnel, broker, quota, inventory, collections, commissions, marketing — CSV/XLSX |

## Local setup

Requirements: Node 22+, PostgreSQL 16 (or Docker).

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), `ENCRYPTION_KEY` (`openssl rand -base64 32`), `BOOTSTRAP_ADMIN_PASSWORD`, and for local demo `DEMO_PASSWORD_LOGIN=true`. Leave Spaces empty to store files under `./.uploads`; leave Entra empty to use password login only.

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

In another terminal, start the background worker (holds expiry, automations, email sync, sequences):

```bash
npm run worker
```

Open http://localhost:3000 and sign in with `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

### Demo data

The seed (`SEED_DEMO=true`, default) creates obviously fictional data: the bootstrap Admin, one user per role (`sales.manager@citrineland.test`, `marketing.manager@citrineland.test`, `bng.staff@citrineland.test` — with `DEMO_PASSWORD_LOGIN=true` they sign in with the bootstrap password), two developments (a 10-floor × 8-unit condo tower with 60 parking slots, and a 4-block × 20-lot subdivision), price lists, payment schemes, 3 brokerages with 10 brokers (one PRC license expiring within 30 days), ~40 leads across all stages, 10 transactions in various statuses with payments and commission tranches, campaigns, a sequence, pipeline stages, document checklist and automations.

### Free hosting for demos (Render + Neon)

To show the CRM to stakeholders before paying for infrastructure, deploy it free with the included `render.yaml` blueprint and a Neon Postgres database: [`docs/FREE_HOSTING.md`](docs/FREE_HOSTING.md). The same code runs in production; only environment variables change.

### Docker Compose

```bash
cp .env.example .env   # fill it in
```

```bash
docker compose build && SEED_ON_START=true docker compose up -d
```

To run PostgreSQL inside Compose too, add `--profile localdb` and point `DATABASE_URL` at `db:5432`. Production deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Environment variables

All variables are documented in [`.env.example`](.env.example). The essentials: `DATABASE_URL`, `APP_URL`/`AUTH_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER`, `SPACES_*`, `TURNSTILE_*`, `BOOTSTRAP_ADMIN_*`, `DEMO_PASSWORD_LOGIN` (never true in production), `SEED_DEMO`, `SEED_ON_START`.

## Microsoft 365 app registration (summary)

One single-tenant Entra ID app; web redirect URI `https://<domain>/api/auth/callback/microsoft-entra-id`; client secret; **delegated** Graph permissions `openid profile email offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite` with admin consent. Signing in with Microsoft also connects the user's mailbox/calendar; refresh tokens are AES-256-GCM encrypted. Full steps: [`docs/MICROSOFT_SETUP.md`](docs/MICROSOFT_SETUP.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run worker` | pg-boss worker (cron + queues) |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `tsc --noEmit` · Vitest unit tests |
| `npm run test:integration` | DB integration tests (reservation concurrency, holds, parking rule, cancellation, email capture) — needs a seeded DB |
| `npm run test:e2e` | Playwright E2E (role access, full sales flow, concurrent reservation, cancellation) — needs a seeded DB and `DEMO_PASSWORD_LOGIN=true` |
| `npm run db:migrate` · `npm run db:seed` | Prisma migrate deploy · seed |

## Project layout

```
prisma/              schema, migrations, seed (config + demo)
src/app/             routes: (auth)/login, (app)/… pages, api/ (auth, health, files, export, public leads, PDFs)
src/domain/          pure, unit-tested business rules (state machines, pricing, schedules, Maceda, parking, commissions, automation)
src/server/          services (Prisma), server actions, Graph, reports, automation engine, sequences
src/components/      UI (shadcn-style primitives, app components, charts)
src/lib/             auth, RBAC, audit, settings, money/format, storage, crypto, validation (shared Zod schemas)
src/worker/          pg-boss worker and job registry
tests/               unit, integration, e2e
docs/                DECISIONS, MICROSOFT_SETUP, DEPLOYMENT, NETSUITE_INTEGRATION_PLAN
```

## Documentation

- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisions taken where the spec was ambiguous
- [`docs/MICROSOFT_SETUP.md`](docs/MICROSOFT_SETUP.md) — Entra ID / Graph setup
- [`docs/FREE_HOSTING.md`](docs/FREE_HOSTING.md) — free demo hosting on Render + Neon (no credit card)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — DigitalOcean Droplet deployment, backups & restore
- [`docs/NETSUITE_INTEGRATION_PLAN.md`](docs/NETSUITE_INTEGRATION_PLAN.md) — deferred accounting integration
