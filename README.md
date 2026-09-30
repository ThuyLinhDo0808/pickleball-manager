# Pickleball Ecosystem

Single-Administrator (Host) pickleball club + event management system.

- **database/schema.sql** — full Supabase/Postgres schema. Run once in the
  Supabase SQL Editor (it's idempotent — safe to re-run).
- **backend/** — Express API, deployable to Render, shared by all frontends.
- **web/** — Next.js Host Web App, deployable to Vercel.

## Quick start

```bash
# 1. Database
# Paste database/schema.sql into your Supabase project's SQL Editor and run it.

# 2. Backend
cd backend
npm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run dev            # http://localhost:4000

# 3. Web app
cd ../web
npm install
cp .env.local.example .env.local   # fill in Supabase anon key + API URL
npm run dev            # http://localhost:3000
```

See `web/README.md` for Vercel deploy steps and `backend/render.yaml` for Render.

## Feedback → your inbox

The in-app **Feedback / Góp ý** button always saves to the `feedback` table. To also be
notified, set one or both on the backend (Render → Environment). **Never commit keys.**

**Option A — Resend email**

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | your Resend API key (`re_…`) |
| `FEEDBACK_TO_EMAIL` | where to receive it (comma-separated for several) |
| `FEEDBACK_FROM_EMAIL` | optional; only with your own verified domain |

With the default sender `onboarding@resend.dev`, Resend only delivers to the email of
your Resend account — so use that address as `FEEDBACK_TO_EMAIL`.

**Option B — Webhook** (no email provider needed)

| Variable | Value |
|---|---|
| `FEEDBACK_WEBHOOK_URL` | any URL that accepts a JSON `POST` |
| `FEEDBACK_WEBHOOK_SECRET` | optional; sent as the `X-Feedback-Secret` header |

The JSON body has `message`, `contact`, `page`, `user_email`, `created_at` and a ready-made
`text` (and `content` for Discord). Free Gmail forwarding with Google Apps Script:

1. Go to https://script.google.com → New project, paste:

   ```js
   const SECRET = 'choose-a-long-random-string'; // same as FEEDBACK_WEBHOOK_SECRET
   function doPost(e) {
     const body = JSON.parse(e.postData.contents);
     // Apps Script can't read headers, so the secret also travels as ?key=... in the URL
     if (e.parameter.key !== SECRET) return ContentService.createTextOutput('forbidden');
     MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Góp ý mới — Pickleball Manager', body.text);
     return ContentService.createTextOutput('ok');
   }
   ```
2. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → copy the URL.
3. Set `FEEDBACK_WEBHOOK_URL` to `<that URL>?key=<your SECRET>`.

## Scope note

This is a from-scratch rebuild of the core system (schema, shared API, and a
working Host Web App covering Club Manager + Xé Vé). The larger backlog from
our planning conversation — Player Web Portal, Tournament Bracket, Analytics
Dashboard/charts, SCD Type 2 history, itemized ball-inventory tracking, and
referee/coordinator role UI — is designed for in the schema (forward-compat
tables: `event_scorers`, `event_role`) but not yet built. Tell me which piece
to build next.
