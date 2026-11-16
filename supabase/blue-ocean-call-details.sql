-- Blue Ocean Ventures — stored EU call requirements (Knowledge Hub › Call Requirements).
-- Run once in the Supabase SQL Editor. Safe to run again.
-- bov_eu_call_details holds the full official call text fetched once from the EU Funding & Tenders Portal
-- by the Edge Function bov-eu-call-details (service role writes; staff read and may delete a stored copy).
-- bov_eu_call_saves is the staff "Saved requirements" list.
begin;

create table if not exists public.bov_eu_call_details (
 call_id uuid primary key,                       -- bov_eu_funding_calls.id (kept even after the call expires)
 source_external_id text not null,               -- EU topic identifier or cs-<id> for cascade calls
 title text,
 programme text,
 call_identifier text,
 call_title text,
 call_kind text,
 status text,
 type_of_action text,
 deadline_model text,
 opening_date text,
 deadline_dates text[] not null default '{}',
 next_deadline date,
 total_budget_eur numeric(16,2),
 grant_min_eur numeric(16,2),
 grant_max_eur numeric(16,2),
 expected_grants int,
 budget jsonb not null default '[]'::jsonb,
 description_html text,
 conditions_html text,
 support_html text,
 latest_info_html text,
 documents jsonb not null default '[]'::jsonb,
 keywords text[] not null default '{}',
 official_url text,
 source_url text,
 fetch_status text not null default 'ok' check (fetch_status in ('ok','partial','failed')),
 fetch_error text,
 fetched_at timestamptz not null default now(),
 fetched_by uuid
);
create index if not exists bov_eu_call_details_ext_idx on public.bov_eu_call_details(source_external_id);
create index if not exists bov_eu_call_details_deadline_idx on public.bov_eu_call_details(next_deadline);

alter table public.bov_eu_call_details enable row level security;
revoke all on public.bov_eu_call_details from public, anon, authenticated;
grant select, delete on public.bov_eu_call_details to authenticated;
drop policy if exists bov_eu_call_details_staff_select on public.bov_eu_call_details;
create policy bov_eu_call_details_staff_select on public.bov_eu_call_details for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_eu_call_details_staff_delete on public.bov_eu_call_details;
create policy bov_eu_call_details_staff_delete on public.bov_eu_call_details for delete to authenticated using (public.bov_hub_access());

create table if not exists public.bov_eu_call_saves (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null,
 note text check (note is null or char_length(note) <= 1000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique (call_id, created_by)
);
alter table public.bov_eu_call_saves enable row level security;
revoke all on public.bov_eu_call_saves from public, anon, authenticated;
grant select, insert, delete on public.bov_eu_call_saves to authenticated;
drop policy if exists bov_eu_call_saves_select on public.bov_eu_call_saves;
create policy bov_eu_call_saves_select on public.bov_eu_call_saves for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_eu_call_saves_insert on public.bov_eu_call_saves;
create policy bov_eu_call_saves_insert on public.bov_eu_call_saves for insert to authenticated with check (public.bov_hub_access() and created_by = auth.uid());
drop policy if exists bov_eu_call_saves_delete on public.bov_eu_call_saves;
create policy bov_eu_call_saves_delete on public.bov_eu_call_saves for delete to authenticated using (public.bov_hub_access() and (created_by = auth.uid() or public.bov_hub_admin()));

grant all on public.bov_eu_call_details to service_role;
grant all on public.bov_eu_call_saves to service_role;

commit;
select 'Call requirements storage ready' as result;
