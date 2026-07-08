# Be Care Compliant

Multi-tenant SaaS keeping UK care companies compliant with CQC (England), CIW (Wales) and local authorities.

Stack: Next.js 15 (App Router) + TypeScript + Supabase (Postgres, RLS, Storage, Realtime, Auth) + Tailwind v4, deployed on Vercel. Stripe, Resend, Twilio, Anthropic.

- Master build plan: `PHASES.md`
- Migrations: `supabase/migrations/` (applied via Supabase MCP to the becarecompliant project only)

## Vocabulary (hard rules)

Record (one person or one service user), Register (collection view for a branch), Check (recurring compliance requirement), Form (structured document completed to satisfy a check), Evidence (a completed, stored form submission). The words "item" and "board" are banned everywhere.

## Local dev

```
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev
```
