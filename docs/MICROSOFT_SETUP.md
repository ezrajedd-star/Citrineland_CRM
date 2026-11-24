# Microsoft 365 setup (Entra ID SSO + Microsoft Graph)

Citrineland CRM uses **one Entra ID app registration** for:

- staff sign-in (SSO with company Microsoft accounts), and
- delegated Microsoft Graph access to each user's own mailbox and calendar (send email, capture emails with known contacts, create/read calendar events).

Only users that an Admin has registered in **Admin → Users** can sign in. Unknown Microsoft accounts are rejected with a clear message.

## 1. Register the app

1. Go to **Microsoft Entra admin center → Identity → Applications → App registrations → New registration**.
2. Name: `Citrineland CRM`.
3. Supported account types: **Accounts in this organizational directory only (single tenant)**.
4. Redirect URI (platform **Web**):
   - Production: `https://<your CRM domain>/api/auth/callback/microsoft-entra-id`
   - Local development: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
5. Click **Register**. Copy the **Application (client) ID** and **Directory (tenant) ID**.

## 2. Client secret

**Certificates & secrets → Client secrets → New client secret.** Choose an expiry (e.g. 24 months) and copy the **Value** immediately. Put a calendar reminder to rotate it before it expires — when it expires, SSO and Graph stop working.

## 3. API permissions (delegated)

**API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add:

| Permission | Why |
|---|---|
| `openid`, `profile`, `email` | Sign-in |
| `offline_access` | Refresh tokens so the worker can sync mailboxes in the background |
| `User.Read` | Read the signed-in user's profile |
| `Mail.Read` | Capture emails to/from known leads, clients and brokers |
| `Mail.Send` | Send email (and sample computation PDFs) from the user's own mailbox |
| `Calendars.ReadWrite` | Create meetings/site visits from the CRM and log Outlook meetings with known contacts |

Then click **Grant admin consent for <tenant>** so users aren't prompted individually.

> Only delegated permissions are used. The CRM never reads mailboxes of users who haven't signed in, and only logs messages that involve an email address of a known lead, client or broker. Internal-only emails (all participants in `Settings → Email capture → Internal domains`) are ignored. Full bodies are **not** stored unless an Admin turns on *Store full email bodies*.

## 4. Environment variables

```bash
AUTH_MICROSOFT_ENTRA_ID_ID=<Application (client) ID>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0
ENCRYPTION_KEY=<openssl rand -base64 32>   # encrypts refresh tokens at rest (AES-256-GCM)
AUTH_URL=https://<your CRM domain>
```

Restart `web` and `worker` after changing them.

## 5. First sign-in

1. Sign in once with the bootstrap Admin (email/password from the seed).
2. **Admin → Users → Invite user** for each staff member using their **Microsoft 365 email**, and assign a role.
3. Each user clicks **Sign in with Microsoft**. Their mailbox/calendar is connected automatically (Profile page shows the status).
4. Once SSO works for at least one Admin, turn off **Settings → Security → password login** to disable the fallback.

## 6. What runs in the background (worker)

| Job | Schedule | What it does |
|---|---|---|
| `graph.mail-sync` | every 5 min | Polls `/me/messages` (since last sync) for each connected user; logs `EMAIL_IN` / `EMAIL_OUT` activities on matching lead/client/broker timelines with subject, snippet, participants, timestamp and an Outlook web link. Inbound replies from a lead stop their email sequences. |
| `graph.calendar-sync` | every 15 min | Reads the user's calendar (−7 / +30 days) and logs meetings that include a known contact (CRM-created events are skipped). |
| `notifications.email` | every 5 min | For users who opted in, sends their in-app notifications to themselves via Outlook. |

Emails sent from the CRM are created as drafts and then sent, so their `internetMessageId` is known and the capture job doesn't log them twice.

### Throttling and token expiry

- The Graph SDK's retry middleware honours `429`/`503`/`504` `Retry-After` headers with exponential backoff.
- Access tokens are refreshed automatically (refresh tokens rotate and are re-encrypted). If refresh fails (password change, revoked consent, expired secret), the user's connection shows **Error** in *Profile* and *Admin → Integrations*; the user just signs in with Microsoft again.

### Optional: change notifications

Polling is used by default because it needs no public webhook. If the CRM has a stable public HTTPS URL, Graph change notifications (`/subscriptions` on `me/messages`) can be added later to reduce latency; the capture logic in `src/server/graph/sync.ts` can be reused as the notification handler.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Your Microsoft account is not registered" | Invite the user in Admin → Users with the exact Microsoft 365 email (UPN). |
| `AADSTS50011` redirect URI mismatch | Add the exact callback URL from step 1.4. |
| Connection shows *Error: invalid_grant* | User must sign in with Microsoft again (consent revoked, password reset, or secret rotated). |
| Emails not captured | Check the contact's email matches exactly, the sender isn't internal-only, and *Settings → Email capture* is on. Check *Admin → Background jobs* for failures. |
