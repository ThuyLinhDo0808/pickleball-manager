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

## Scope note

This is a from-scratch rebuild of the core system (schema, shared API, and a
working Host Web App covering Club Manager + Xé Vé). The larger backlog from
our planning conversation — Player Web Portal, Tournament Bracket, Analytics
Dashboard/charts, SCD Type 2 history, itemized ball-inventory tracking, and
referee/coordinator role UI — is designed for in the schema (forward-compat
tables: `event_scorers`, `event_role`) but not yet built. Tell me which piece
to build next.
