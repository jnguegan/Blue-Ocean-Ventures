-- Blue Ocean Ventures EU Funding Intelligence phase 2
-- Run in BLUE OCEAN Supabase SQL Editor after executive-leadership migration.
begin;
create table if not exists public.bov_eu_funding_calls (
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('regional','spain','africa')),
 title text not null,
 programme text not null,
 country_region text,
 theme text,
 summary text,
 official_url text not null check(official_url ~* '^https://'),
 status text not null default 'research' check(status in ('research','open','upcoming','closed','archived')),
 deadline date,
 funding_min_eur numeric(16,2) check(funding_min_eur is null or funding_min_eur >= 0),
 funding_max_eur numeric(16,2) check(funding_max_eur is null or funding_max_eur >= 0),
 cofinancing_percent numeric(5,2) check(cofinancing_percent is null or cofinancing_percent between 0 and 100),
 eligibility_notes text,
 partner_requirements text,
 internal_notes text,
 verified_on date,
 created_by uuid not null default auth.uid() references auth.users(id),
 updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint bov_eu_funding_amounts_order check(funding_min_eur is null or funding_max_eur is null or funding_min_eur <= funding_max_eur)
);
create index if not exists bov_eu_calls_category_status on public.bov_eu_funding_calls(category,status,deadline);
alter table public.bov_eu_funding_calls enable row level security;
revoke all on public.bov_eu_funding_calls from anon;
grant select,insert,update,delete on public.bov_eu_funding_calls to authenticated;
drop policy if exists bov_eu_calls_read on public.bov_eu_funding_calls;
drop policy if exists bov_eu_calls_insert on public.bov_eu_funding_calls;
drop policy if exists bov_eu_calls_update on public.bov_eu_funding_calls;
drop policy if exists bov_eu_calls_delete on public.bov_eu_funding_calls;
create policy bov_eu_calls_read on public.bov_eu_funding_calls for select to authenticated using(public.bov_hub_access());
create policy bov_eu_calls_insert on public.bov_eu_funding_calls for insert to authenticated with check(public.bov_hub_editor() and created_by = auth.uid());
create policy bov_eu_calls_update on public.bov_eu_funding_calls for update to authenticated using(public.bov_hub_editor()) with check(public.bov_hub_editor());
create policy bov_eu_calls_delete on public.bov_eu_funding_calls for delete to authenticated using(public.bov_hub_editor());
create or replace function public.bov_eu_calls_stamp() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 new.updated_at=now();
 new.updated_by=auth.uid();
 if tg_op='UPDATE' then new.created_by=old.created_by; new.created_at=old.created_at; end if;
 return new;
end;$$;
drop trigger if exists bov_eu_calls_stamp_trigger on public.bov_eu_funding_calls;
create trigger bov_eu_calls_stamp_trigger before insert or update on public.bov_eu_funding_calls for each row execute function public.bov_eu_calls_stamp();
commit;
