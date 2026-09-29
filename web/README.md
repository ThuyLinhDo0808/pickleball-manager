# Pickleball Manager — Host Web App

Next.js 14 (App Router) frontend for the Pickleball ecosystem. Talks to the
shared Express API in `../backend` and to Supabase directly only for auth.

## Setup

```bash
cd web
npm install
cp .env.local.example .env.local   # fill in Supabase URL/anon key + API URL
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, "New Project" → import the repo → set **Root Directory** to `web`.
3. Add environment variables from `.env.local.example` in Vercel's project settings
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`
   pointing at your deployed backend, e.g. the Render URL).
4. Deploy.

## What's implemented

- Vietnamese-first i18n (with English fallback), dark navy/lime theme
- Supabase email/password auth
- Club Manager: members (fixed/guest, VIP/standard tier, notes), rankings, fund ledger
- Xé Vé: event schedule, event detail with participants (add / import-from-club /
  check-in / no-show / cancel / fee toggle) and per-event finance
- Excel export (live formulas) for per-event finance, and a club-wide backup
  export (Members + Schedule + Rankings) from the Account page
- Feedback form that stores messages for the developer (wire up an email
  provider in `backend/src/routes/host.routes.js` to also email them)

## Not yet built (see the project's memory notes for the full backlog)

- Player Web Portal (separate self-service app)
- Tournament bracket system
- Analytics dashboard / charts, SCD Type 2 history logging
- Ball-inventory itemized tracking
- Referee/coordinator role-restricted UI (schema + API exist; no screens yet)
