-- Blue Ocean Ventures ECOSOC staff screening records.
-- Execute in the Blue Ocean Supabase SQL Editor.
-- Stores preliminary screening results, not official UN decisions.
begin;
create table if not exists public.bov_hub_ecosoc_screenings (
 id uuid primary key default gen_random_uuid(),
 organisation_name text not null,
 country text,
 registered_on date,
 outcome text not null check (outcome in ('Eligibility concerns identified','Further evidence required','Preliminarily eligible — subject to independent review')),
 criteria jsonb not null default '[]'::jsonb,
 documents jsonb not null default '[]'::jsonb,
 checked_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists bov_ecosoc_screening_organisation_idx on public.bov_hub_ecosoc_screenings(organisation_name);
alter table public.bov_hub_ecosoc_screenings enable row level security;
revoke all on public.bov_hub_ecosoc_screenings from public,anon,authenticated;
grant select,insert on public.bov_hub_ecosoc_screenings to authenticated;
drop policy if exists bov_ecosoc_staff_select on public.bov_hub_ecosoc_screenings;
create policy bov_ecosoc_staff_select on public.bov_hub_ecosoc_screenings for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_ecosoc_staff_insert on public.bov_hub_ecosoc_screenings;
create policy bov_ecosoc_staff_insert on public.bov_hub_ecosoc_screenings for insert to authenticated with check (public.bov_hub_access() and created_by=auth.uid());
commit;
