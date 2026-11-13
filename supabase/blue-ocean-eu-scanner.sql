-- Apply after blue-ocean-eu-funding-phase2.sql and blue-ocean-eu-funding-sources.sql
begin;
alter table public.bov_eu_funding_calls add column if not exists source_key text;
alter table public.bov_eu_funding_calls add column if not exists source_external_id text;
alter table public.bov_eu_funding_calls add column if not exists discovered_at timestamptz;
alter table public.bov_eu_funding_calls add column if not exists last_seen_at timestamptz;
alter table public.bov_eu_funding_calls add column if not exists audience text not null default 'unreviewed' check(audience in ('unreviewed','private_possible','public_only','mixed'));
alter table public.bov_eu_funding_calls alter column created_by drop not null;
create unique index if not exists bov_eu_calls_source_external_unique on public.bov_eu_funding_calls(source_key,source_external_id) where source_key is not null and source_external_id is not null;
create table if not exists public.bov_eu_scan_runs (
 id uuid primary key default gen_random_uuid(),
 source_key text not null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','success','error')),
 fetched_count integer not null default 0,
 inserted_count integer not null default 0,
 updated_count integer not null default 0,
 error_message text
);
alter table public.bov_eu_scan_runs enable row level security;
revoke all on public.bov_eu_scan_runs from anon,authenticated;
grant select on public.bov_eu_scan_runs to authenticated;
drop policy if exists bov_eu_scan_runs_read on public.bov_eu_scan_runs;
create policy bov_eu_scan_runs_read on public.bov_eu_scan_runs for select to authenticated using(public.bov_hub_access());
commit;