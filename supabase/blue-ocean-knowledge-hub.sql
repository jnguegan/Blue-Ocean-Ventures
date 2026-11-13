-- Knowledge Hub v1: run ONLY in Blue Ocean Supabase SQL editor.
create extension if not exists pgcrypto;
create table if not exists public.bov_hub_staff(user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('admin','consultant')), active boolean not null default true);
create or replace function public.bov_hub_access() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.bov_hub_staff where user_id=auth.uid() and active); $$;
create or replace function public.bov_hub_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from public.bov_hub_staff where user_id=auth.uid() and active and role='admin'); $$;
create table if not exists public.bov_hub_records(
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in ('institution','funding','law','ecosoc','sdg','contact','document','project')),
 title text not null,
 summary text,
 country text,
 sectors text[] not null default '{}',
 sdgs integer[] not null default '{}',
 source_url text,
 source_reference text,
 verification text not null default 'unverified' check(verification in ('unverified','verified','outdated')),
 verified_at timestamptz,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint bov_hub_sdgs_valid check(sdgs <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]::integer[])
);
create index if not exists bov_hub_records_category_idx on public.bov_hub_records(category);
create index if not exists bov_hub_records_sdgs_idx on public.bov_hub_records using gin(sdgs);
create table if not exists public.bov_hub_links(id uuid primary key default gen_random_uuid(),from_id uuid not null references public.bov_hub_records(id) on delete cascade,to_id uuid not null references public.bov_hub_records(id) on delete cascade,relation text not null,unique(from_id,to_id,relation),check(from_id<>to_id));
alter table public.bov_hub_staff enable row level security;
alter table public.bov_hub_records enable row level security;
alter table public.bov_hub_links enable row level security;
revoke all on public.bov_hub_staff,public.bov_hub_records,public.bov_hub_links from anon,authenticated;
grant select on public.bov_hub_staff to authenticated;
grant select,insert,update,delete on public.bov_hub_records,public.bov_hub_links to authenticated;
create policy bov_hub_staff_self on public.bov_hub_staff for select to authenticated using(user_id=auth.uid() or public.bov_hub_admin());
create policy bov_hub_records_read on public.bov_hub_records for select to authenticated using(public.bov_hub_access());
create policy bov_hub_records_insert on public.bov_hub_records for insert to authenticated with check(public.bov_hub_admin());
create policy bov_hub_records_update on public.bov_hub_records for update to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
create policy bov_hub_records_delete on public.bov_hub_records for delete to authenticated using(public.bov_hub_admin());
create policy bov_hub_links_read on public.bov_hub_links for select to authenticated using(public.bov_hub_access());
create policy bov_hub_links_insert on public.bov_hub_links for insert to authenticated with check(public.bov_hub_admin());
create policy bov_hub_links_update on public.bov_hub_links for update to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
create policy bov_hub_links_delete on public.bov_hub_links for delete to authenticated using(public.bov_hub_admin());
-- After authenticating a verified admin, provision them in SQL editor:
-- insert into public.bov_hub_staff(user_id,role) values ('AUTH_USER_UUID','admin');
-- Files: create a PRIVATE storage bucket and separate staff-only storage policies before uploading confidential documents.
