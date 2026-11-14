-- EU Funding Scanner v3: richer call data for the visual Grant Register.
-- Apply after blue-ocean-eu-scanner.sql and blue-ocean-eu-scanner-sample.sql.
begin;

alter table public.bov_eu_funding_calls add column if not exists call_kind text;            -- 'topic' (EU call) or 'cascade' (call run by an EU-funded project)
alter table public.bov_eu_funding_calls add column if not exists parent_topic text;         -- EU topic the call belongs to
alter table public.bov_eu_funding_calls add column if not exists parent_topic_id text;      -- e.g. HORIZON-EIT-2025-KIC-IBA-H
alter table public.bov_eu_funding_calls add column if not exists organiser text;            -- project running a cascade call, e.g. "PHORTIFY"
alter table public.bov_eu_funding_calls add column if not exists total_budget_eur numeric(16,2) check (total_budget_eur is null or total_budget_eur >= 0);
alter table public.bov_eu_funding_calls add column if not exists audience_tags text[] not null default '{}';   -- sme, students, research, public, ngo, individuals
alter table public.bov_eu_funding_calls add column if not exists country_codes text[] not null default '{}';   -- ISO codes when a call targets specific countries
alter table public.bov_eu_funding_calls add column if not exists eu_status text;            -- 'open' or 'forthcoming' as published by the EU
alter table public.bov_eu_funding_calls add column if not exists opening_date date;

-- Earlier scans keyed cascade calls by their parent topic, so several different calls collapsed
-- into one record with the wrong title and link. Retire those unreviewed records without deleting
-- them (eligibility assessments that point to them are kept). The next scan re-imports them correctly.
update public.bov_eu_funding_calls
   set status = 'archived',
       source_external_id = 'legacy-' || id::text,
       internal_notes = coalesce(internal_notes || E'\n', '') || 'Archived 2026-11 by scanner v3: imported with incorrect title/link mapping.'
 where source_key = 'eu-ft'
   and status = 'research'
   and verified_on is null
   and source_external_id not like 'cs-%'
   and source_external_id not like 'legacy-%'
   and call_kind is null;

create index if not exists bov_eu_calls_deadline_idx on public.bov_eu_funding_calls(deadline) where status <> 'archived';
create index if not exists bov_eu_calls_audience_idx on public.bov_eu_funding_calls using gin(audience_tags);

commit;
