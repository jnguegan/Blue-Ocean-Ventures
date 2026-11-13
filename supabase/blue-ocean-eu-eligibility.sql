-- Automated, evidence-backed eligibility assessments for EU funding.
begin;
create table if not exists public.bov_eu_eligibility_assessments (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.bov_eu_funding_calls(id) on delete cascade,
 project_id uuid,
 assessment_type text not null check(assessment_type in ('opportunity','project_match')),
 result text not null check(result in ('preliminarily_eligible','ineligible','unconfirmed')),
 applicant_type text,
 rule_snapshot jsonb not null default '{}'::jsonb,
 evidence jsonb not null default '[]'::jsonb,
 reasons jsonb not null default '[]'::jsonb,
 missing_information jsonb not null default '[]'::jsonb,
 engine_version text not null default 'rules-v1',
 assessed_at timestamptz not null default now(),
 constraint project_match_requires_project check(assessment_type <> 'project_match' or project_id is not null)
);
create index if not exists bov_eu_eligibility_call_idx on public.bov_eu_eligibility_assessments(call_id,assessed_at desc);
alter table public.bov_eu_eligibility_assessments enable row level security;
revoke all on public.bov_eu_eligibility_assessments from anon;
grant select on public.bov_eu_eligibility_assessments to authenticated;
drop policy if exists bov_eu_eligibility_read on public.bov_eu_eligibility_assessments;
create policy bov_eu_eligibility_read on public.bov_eu_eligibility_assessments for select to authenticated using(public.bov_hub_access());
-- No client-side write permissions: only server-side service role can insert results.
commit;