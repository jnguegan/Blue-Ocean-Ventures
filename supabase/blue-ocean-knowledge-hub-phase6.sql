-- Blue Ocean Ventures Knowledge Hub Phase 6
-- Run only in the Blue Ocean Supabase project AFTER the Knowledge Hub migration.
-- No client access: RLS on every table; only authorised staff may read.
-- Admins create/update; consultants may read. Do not use service_role in browser.
create table if not exists public.bov_hub_opportunities (
 id uuid primary key default gen_random_uuid(),
 agency text not null,
 title text not null,
 country text,
 theme text,
 applicant_types text[] not null default '{}',
 funding_min numeric check(funding_min is null or funding_min>=0),
 funding_max numeric check(funding_max is null or funding_max>=0),
 currency text not null default 'USD',
 cofinancing text,
 eligibility text,
 documents_required text,
 source_url text not null check(source_url ~ '^https://'),
 opens_on date,
 deadline date,
 status text not null default 'unverified' check(status in ('unverified','upcoming','open','closed','rolling','archived')),
 verified_on date,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(funding_min is null or funding_max is null or funding_min<=funding_max),
 check(opens_on is null or deadline is null or opens_on<=deadline)
);
create table if not exists public.bov_hub_assessments (
 id uuid primary key default gen_random_uuid(),
 project_name text not null,
 country text,
 theme text,
 applicant_type text,
 project_budget numeric check(project_budget is null or project_budget>=0),
 currency text not null default 'EUR',
 opportunity_id uuid references public.bov_hub_opportunities(id) on delete set null,
 mandate_fit text not null default 'unassessed' check(mandate_fit in ('unassessed','yes','partial','no')),
 country_eligible text not null default 'unassessed' check(country_eligible in ('unassessed','yes','no')),
 applicant_eligible text not null default 'unassessed' check(applicant_eligible in ('unassessed','yes','no')),
 budget_eligible text not null default 'unassessed' check(budget_eligible in ('unassessed','yes','no')),
 call_confirmed boolean not null default false,
 decision text not null default 'research' check(decision in ('research','review','approved','rejected')),
 evidence_url text,
 consultant_notes text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(evidence_url is null or evidence_url ~ '^https://')
);
create table if not exists public.bov_hub_contact_activity (
 id uuid primary key default gen_random_uuid(),
 contact_record_id uuid references public.bov_hub_records(id) on delete set null,
 organisation text not null,
 contact_name text,
 contact_email text,
 activity_date date not null default current_date,
 activity_type text not null default 'note' check(activity_type in ('note','email','call','meeting','follow_up')),
 summary text not null,
 follow_up_on date,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists bov_hub_opportunity_deadline_idx on public.bov_hub_opportunities(deadline);
create index if not exists bov_hub_assessment_opportunity_idx on public.bov_hub_assessments(opportunity_id);
create index if not exists bov_hub_contact_follow_up_idx on public.bov_hub_contact_activity(follow_up_on);
alter table public.bov_hub_opportunities enable row level security;
alter table public.bov_hub_assessments enable row level security;
alter table public.bov_hub_contact_activity enable row level security;
revoke all on public.bov_hub_opportunities,public.bov_hub_assessments,public.bov_hub_contact_activity from anon,authenticated;
grant select,insert,update,delete on public.bov_hub_opportunities,public.bov_hub_assessments,public.bov_hub_contact_activity to authenticated;
drop policy if exists bov_hub_opportunities_read on public.bov_hub_opportunities;
drop policy if exists bov_hub_opportunities_admin on public.bov_hub_opportunities;
create policy bov_hub_opportunities_read on public.bov_hub_opportunities for select to authenticated using(public.bov_hub_access());
create policy bov_hub_opportunities_admin on public.bov_hub_opportunities for all to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
drop policy if exists bov_hub_assessments_read on public.bov_hub_assessments;
drop policy if exists bov_hub_assessments_admin on public.bov_hub_assessments;
create policy bov_hub_assessments_read on public.bov_hub_assessments for select to authenticated using(public.bov_hub_access());
create policy bov_hub_assessments_admin on public.bov_hub_assessments for all to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
drop policy if exists bov_hub_contact_activity_read on public.bov_hub_contact_activity;
drop policy if exists bov_hub_contact_activity_admin on public.bov_hub_contact_activity;
create policy bov_hub_contact_activity_read on public.bov_hub_contact_activity for select to authenticated using(public.bov_hub_access());
create policy bov_hub_contact_activity_admin on public.bov_hub_contact_activity for all to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
-- No automatic seed: opportunities must be verified against original notices.
select 'phase6 schema ready' as result;
