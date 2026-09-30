# Pickleball Manager — Web

Next.js 14 (App Router) frontend. Talks to the Express API in `../backend` and to
Supabase directly only for sign-in.

```bash
cd web
npm install
cp .env.local.example .env.local   # Supabase URL + anon key + NEXT_PUBLIC_API_URL
npm run dev                        # http://localhost:3000
```

Features, usage guide, deployment (Vercel) and environment variables are documented in
the main [README](../README.md).
