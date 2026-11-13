# Blue Ocean EU Funding Scanner — deployment

The repository contains a first-stage Edge Function at `supabase/functions/bov-eu-funding-scan/index.ts`. It is **not deployed** simply by committing it to GitHub.

## Step 1 — Database
Run `supabase/blue-ocean-eu-scanner.sql` in the **Blue Ocean** Supabase SQL Editor. This adds import IDs, private-sector classification and scan audit logs. Keep the existing source registry and funding calls migrations.

## Step 2 — Configure function secret
In Supabase Dashboard > Edge Functions > Secrets, add `EU_SCAN_SECRET` with a long, random value. Never put the service-role key or this secret in GitHub or browser code. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to functions.

## Step 3 — Deploy
Deploy `bov-eu-funding-scan` using Supabase CLI from the repo root:
```bash
supabase login
supabase link --project-ref tzpbdfbedwmawmpygwpx
supabase functions deploy bov-eu-funding-scan --no-verify-jwt
```
JWT verification is disabled for this machine-to-machine endpoint **only** because it requires the private `x-eu-scan-secret` header and rejects all other requests. Keep the secret server-side.

## Step 4 — First test
Use the Supabase function test panel or an authenticated shell with a private header:
```bash
curl -X POST 'https://tzpbdfbedwmawmpygwpx.supabase.co/functions/v1/bov-eu-funding-scan' -H 'x-eu-scan-secret: YOUR_PRIVATE_SECRET'
```
The response reports `fetched`, `inserted`, `updated`. A successful response does not guarantee every source field was parsed correctly. Inspect `bov_eu_scan_runs` and a sample of `bov_eu_funding_calls` records before enabling a schedule.

## Step 5 — Schedule
After the first test succeeds, schedule a daily HTTP POST to the Edge Function from a secure scheduler such as Supabase Cron/pg_net or a managed secret-backed scheduler. Do not store the secret in a public table, public GitHub workflow or frontend code.

## Coverage limits
This first connector covers centrally published EU Funding & Tenders grant topics only. Portugal 2030, Canary Islands, Madeira, Azores, and other regional sources need separate verified source adapters. Calls are imported as `research` and do not assert SME eligibility or verified deadlines. EU-wide records deliberately remain unpinned on the geographic map.

## Important
The EU public API response schema and deployment must be tested against live results before relying on this ingestion in production. Do not represent this code commit as an active automated service.
