-- Blue Ocean Project Development Studio - Phase 1
-- Run in the dedicated Blue Ocean Supabase project, never in globalmgm-data.
-- Staff membership is provisioned only by a trusted database administrator.
create extension if not exists pgcrypto;
create table if not exists public.bov_staff (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','consultant')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create or replace function public.bov_is_staff()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.bov_staff s where s.user_id=auth.uid() and s.active);
$$;
create or replace function public.bov_is_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.bov_staff s where s.user_id=auth.uid() and s.active and s.role='admin');
$$;
create table if not exists public.bov_organisations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 country text,
 registration_number text,
 legal_status text,
 mission text,
 contact_name text,
 contact_email text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.bov_projects (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.bov_organisations(id) on delete restrict,
 title text not null,
 country text,
 sector text,
 sdg_numbers integer[] not null default '{}',
 objectives text,
 beneficiaries text,
 start_date date,
 end_date date,
 currency text not null default 'EUR',
 status text not null default 'intake' check(status in ('intake','draft','review','approved','closed')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint bov_project_dates check(start_date is null or end_date is null or end_date>=start_date)
);
create table if not exists public.bov_activities (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bov_projects(id) on delete cascade,
 title text not null,
 start_date date,
 end_date date,
 depends_on uuid references public.bov_activities(id) on delete set null,
 owner text,
 progress integer not null default 0 check(progress between 0 and 100),
 constraint bov_activity_dates check(start_date is null or end_date is null or end_date>=start_date)
);
create table if not exists public.bov_budget_lines (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bov_projects(id) on delete cascade,
 category text not null,
 description text not null,
 quantity numeric(16,3) not null default 1 check(quantity>=0),
 unit_cost numeric(18,2) not null default 0 check(unit_cost>=0),
 periods numeric(12,2) not null default 1 check(periods>=0),
 total numeric(22,2) generated always as (round(quantity*unit_cost*periods,2)) stored,
 funding_source text
);
create table if not exists public.bov_readiness_runs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bov_projects(id) on delete cascade,
 status text not null check(status in ('ready_for_review','requires_improvement','not_ready')),
 score integer not null check(score between 0 and 100),
 checks jsonb not null default '[]'::jsonb,
 model_version text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.bov_reference_records (
 id uuid primary key default gen_random_uuid(),
 category text not null,
 title text not null,
 description text,
 source_url text,
 source_date date,
 verified_at timestamptz,
 verification_status text not null default 'unverified' check(verification_status in ('unverified','verified','outdated')),
 tags text[] not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists public.bov_generated_documents (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bov_projects(id) on delete cascade,
 document_type text not null,
 version integer not null default 1,
 storage_path text,
 content jsonb not null default '{}'::jsonb,
 approval_status text not null default 'draft' check(approval_status in ('draft','review','approved')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
-- Deny access by default, including anonymous and clients.
do $$ declare t text; begin
 foreach t in array array['bov_staff','bov_organisations','bov_projects','bov_activities','bov_budget_lines','bov_readiness_runs','bov_reference_records','bov_generated_documents'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
create policy bov_staff_read on public.bov_staff for select to authenticated using (public.bov_is_admin() or user_id=auth.uid());
create policy bov_org_staff on public.bov_organisations for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_project_staff on public.bov_projects for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_activities_staff on public.bov_activities for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_budget_staff on public.bov_budget_lines for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_readiness_staff on public.bov_readiness_runs for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_references_staff on public.bov_reference_records for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
create policy bov_documents_staff on public.bov_generated_documents for all to authenticated using(public.bov_is_staff()) with check(public.bov_is_staff());
-- Bootstrap after signing up a verified Blue Ocean administrator:
-- insert into public.bov_staff(user_id,role) values ('YOUR-AUTH-USER-UUID','admin');
-- Keep all project files in a PRIVATE Supabase Storage bucket with separate staff-only storage policies.
