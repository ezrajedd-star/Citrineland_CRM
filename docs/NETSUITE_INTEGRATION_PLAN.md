# NetSuite integration plan (deferred)

**Status:** not built. The CRM runs standalone; payments are recorded manually or by CSV import. This document describes how Oracle NetSuite will be connected later without changing commission or reporting logic.

## What already exists (the seams)

| Seam | Where |
|---|---|
| `netsuiteId` + `netsuiteSyncedAt` (nullable) on **Client**, **Transaction**, **Payment**, **Brokerage**, **Broker** | `prisma/schema.prisma` |
| Payments tagged `source = MANUAL \| CSV \| NETSUITE` with `externalId` and a unique `(source, externalId)` constraint | `Payment` model |
| `AccountingProvider` interface (`upsertCustomer`, `upsertSalesOrder`, `fetchPayments`, `upsertVendor`, `createCommissionBill`) and `NoopAccountingProvider` (used now) | `src/server/accounting/provider.ts` |
| Single payment entry point that re-allocates collections and re-evaluates commission milestones | `recordPayment()` in `src/server/transactions.ts` |
| Background job runner with retries and failed-job view | pg-boss worker (`src/worker`), Admin → Background jobs |
| "NetSuite — Not connected, coming soon" | Admin → Integrations |

Because commissions and reports read *recorded payments* regardless of source, switching collections from CSV to NetSuite needs no change in those modules.

## Direction of sync

| Data | Direction | NetSuite record | Trigger |
|---|---|---|---|
| Clients (buyer + co-buyers) | CRM → NetSuite | Customer | Reservation created; client updated |
| Transactions | CRM → NetSuite | Sales Order (or Invoice per Citrineland's accounting policy) with one line per unit/parking item | Contract signed (configurable: reservation) |
| Status changes / cancellation | CRM → NetSuite | Sales Order status / close | Status change events |
| Brokerages & brokers | CRM → NetSuite | Vendor | Accreditation = ACCREDITED |
| Released commission tranches | CRM → NetSuite | Vendor Bill (payee = brokerage and/or agent per split) | Tranche APPROVED (bill), RELEASED (payment reference) |
| Payments / collections | NetSuite → CRM | Customer Payment / Deposit applied to the Sales Order | Polling every 15 min (or SuiteScript webhook) |

## Authentication & API

- **SuiteTalk REST Web Services** (`https://<account>.suitetalk.api.netsuite.com/services/rest/record/v1/…`) and SuiteQL (`/query/v1/suiteql`) for reads.
- **OAuth 2.0 (client credentials / machine-to-machine with certificate)** preferred; Token-Based Authentication (TBA) as fallback. Credentials in env: `NETSUITE_ACCOUNT_ID`, `NETSUITE_CLIENT_ID`, `NETSUITE_CERT_ID`, `NETSUITE_PRIVATE_KEY` (or TBA token pair). Never stored in the DB unencrypted.
- A dedicated NetSuite integration role with only the record permissions above.

## Idempotency & reliability

- Every outbound call carries an **idempotency key** derived from the CRM entity and version, e.g. `customer:<clientId>:<updatedAt>`; also sent as NetSuite `externalId` so retries upsert instead of duplicating.
- Inbound payments are inserted with `source = NETSUITE`, `externalId = <NetSuite internal id>`; the unique constraint makes re-imports no-ops.
- A new `AccountingSyncLog` table (entity, entityId, direction, operation, idempotencyKey, status, request/response summary, error, attempts, timestamps) will back an Admin → Integrations → Sync log view.
- Jobs: `netsuite.push` (queued from domain events: `transaction.reserved`, `transaction.status_changed`, tranche approval), `netsuite.pull-payments` (cron, cursor stored in `Setting`). pg-boss retries with exponential backoff; failures appear in Admin → Background jobs.
- NetSuite concurrency/rate limits: one worker concurrency for `netsuite.*` queues; honour `429` with backoff.

## Cut-over plan

1. Map master data: developments → NetSuite classes/departments/locations; units → items or a single "Real property" item with memo; payment methods → NetSuite payment methods.
2. Backfill: push existing clients, brokers and active transactions; store returned `netsuiteId`s.
3. Reconcile CSV-entered payments against NetSuite collections for an overlap period (match on OR number + amount + date); mark matched CRM payments with the NetSuite id.
4. Switch collections entry to NetSuite; disable CSV import for finance users (keep for exceptions).
5. Monitor sync log daily for two weeks.

## Open questions for Citrineland finance

- Sales Order vs Invoice at contract signing; revenue recognition policy for pre-selling.
- How VAT and misc. fees are booked (separate items vs included).
- Whether commission bills go to the brokerage only (brokerage pays agents) or split.
- Subsidiary / class structure per development.
