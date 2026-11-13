-- Blue Ocean Ventures Phase 7: detailed project assessments and approval controls.
-- Run in the Blue Ocean Supabase project after Phase 6.
-- Existing assessments are retained; no DELETE/DROP TABLE operations.
alter table public.bov_hub_assessments
 add column if not exists project_description text,
 add column if not exists organisation_name text,
 add column if not exists organisation_legal_status text,
 add column if not exists target_beneficiaries text,
 add column if not exists project_sdgs integer[] not null default '{}',
 add column if not exists requested_funding numeric check(requested_funding is null or requested_funding>=0),
 add column if not exists project_duration_months integer check(project_duration_months is null or project_duration_months>0),
 add column if not exists documents_available text,
 add column if not exists eligibility_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists reviewed_by uuid references auth.users(id),
 add column if not exists reviewed_at timestamptz;
create index if not exists bov_hub_assessment_decision_idx on public.bov_hub_assessments(decision);
-- Server-side enforcement: only staff admins can approve/reject; approval needs evidence and reviewed eligibility.
create or replace function public.bov_phase7_guard_assessment()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.decision in ('approved','rejected') and new.decision is distinct from old.decision then
  raise exception 'Final decisions cannot be changed; create a new assessment for reassessment';
 end if;
 if new.decision in ('approved','rejected') then
  if not public.bov_hub_admin() then raise exception 'Only a Knowledge Hub administrator may make a final decision'; end if;
  if new.decision='approved' then
   if new.opportunity_id is null or not new.call_confirmed or new.mandate_fit <> 'yes'
    or new.country_eligible <> 'yes' or new.applicant_eligible <> 'yes' or new.budget_eligible <> 'yes'
    or nullif(btrim(coalesce(new.evidence_url,'')),'') is null then
    raise exception 'Approval requires a linked opportunity, confirmed call, all eligibility checks YES and evidence URL';
   end if;
  end if;
  if tg_op='INSERT' or old.decision is distinct from new.decision then
   new.reviewed_by := auth.uid(); new.reviewed_at := now();
  end if;
 else
  new.reviewed_by := null; new.reviewed_at := null;
 end if;
 return new;
end $$;
drop trigger if exists bov_phase7_assessment_guard on public.bov_hub_assessments;
create trigger bov_phase7_assessment_guard before insert or update on public.bov_hub_assessments
 for each row execute function public.bov_phase7_guard_assessment();
-- Preserve existing staff-only RLS; no public/client grants.
select 'phase7 schema ready' as result;
