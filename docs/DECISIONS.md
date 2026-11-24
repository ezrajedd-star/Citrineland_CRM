# Decision log

Decisions made where the build prompt was ambiguous. Simplest option consistent with the spec was chosen.

| # | Area | Decision | Why |
|---|------|----------|-----|
| 1 | Money | Stored as `BigInt` centavos (columns end in `Cents`). Domain code uses `number` centavos (safe to ±₱90 trillion). Percentages are `Float` (e.g. `12.5` = 12.5%). | Integer centavos avoid float drift; `Int` overflows at ₱21M. |
| 2 | Sessions | Auth.js uses a JWT cookie that carries only an opaque `sessionToken`; the `Session` table is the source of truth and is checked on every request (`getCurrentUser`). | Auth.js database sessions don't work with the Credentials provider (needed for the bootstrap Admin). This still gives DB-stored, revocable sessions so Admin "force sign-out" works instantly. |
| 3 | Password login | Only the bootstrap Admin (role key `ADMIN` with a password hash) can use password login, and only while `Settings → passwordLoginEnabled` is on. `DEMO_PASSWORD_LOGIN=true` lets seeded demo users sign in with the bootstrap password for demos/E2E tests; it must be `false` in production. | Spec: fallback for bootstrap Admin only; demos/E2E need per-role sign-in without Entra. |
| 4 | Microsoft tokens | Graph scopes are requested at SSO sign-in, so signing in with Microsoft also connects the mailbox/calendar. Refresh tokens are encrypted with AES-256-GCM (`ENCRYPTION_KEY`). | One consent step; fewer moving parts. |
| 5 | Permissions | Permissions are a code-defined catalog (`src/lib/rbac/permissions.ts`); roles store a `String[]`. Admin role is `"*"` and cannot be edited. | Matrix UI needs a fixed set of resources/actions; adding a permission is a code change anyway. |
| 6 | Default grants | Sales Manager gets `transactions:cancel` and `commissions:approve` by default (they own sales and commissions). `price_lists:update` and `commissions:release` are **not** granted to any non-Admin role by default — Admin grants them deliberately. | Spec requires these to be separate permissions; finance-sensitive actions default to Admin-only. |
| 7 | Deleting users | Users are soft-deleted (email rewritten so it can be re-invited) to preserve audit history. | Referential integrity of audit/timeline records. |
| 8 | Rate limiting | In-memory fixed-window limiter (single `web` container). | Simplest; documented swap path if scaled out. |
| 9 | CSP | Nonce-based CSP set in middleware (`strict-dynamic`). `style-src 'unsafe-inline'` is allowed because Recharts/Radix set inline styles. | Strict scripts, practical styles. |
| 10 | Forms | Zod schemas in `src/lib/validation/schemas.ts` are used by both react-hook-form (client) and the `action()` wrapper (server). Forms submit raw strings; schemas transform (pesos → centavos, `YYYY-MM-DD` → Date) identically on both sides. | One schema, two enforcement points. |
| 11 | Dates | Date-only fields (`@db.Date`) are stored at UTC midnight and formatted in UTC; timestamps are formatted in `Asia/Manila`. | Prevents off-by-one day shifts. |
