-- Project Workbench integration. Run AFTER Knowledge Hub phases 6 and 7.
-- Existing assessment records are retained. All data is staff-only.
create table if not exists public.bov_projects (
 id uuid primary key default gen_random_uuid(),
 project_name text not null check(length(btrim(project_name))>0),
 organisation_name text not null,
 country text not null,
 applicant_type text,
 description text,
 project_manager uuid references public.bov_hub_staff(user_id) on delete set null,
 stage text not null default 'institutional_matching' check(stage in ('registration','institutional_matching','funding_verification','eligibility','application','decision','implementation','closed')),
 status text not null default 'active' check(status in ('active','on_hold','completed','cancelled')),
 next_action text,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.bov_project_reports (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.bov_projects(id) on delete restrict,
 version integer not null check(version>0),
 assessment_input jsonb not null,
 relevance_report jsonb not null,
 funding_report jsonb not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(project_id,version)
);
create index if not exists bov_project_reports_latest on public.bov_project_reports(project_id,version desc);
create index if not exists bov_projects_manager on public.bov_projects(project_manager);
alter table public.bov_projects enable row level security;
alter table public.bov_project_reports enable row level security;
revoke all on public.bov_projects,public.bov_project_reports from anon,authenticated;
grant select,insert,update on public.bov_projects to authenticated;
grant select,insert on public.bov_project_reports to authenticated;
create policy bov_projects_read on public.bov_projects for select to authenticated using(public.bov_hub_access());
create policy bov_projects_insert on public.bov_projects for insert to authenticated with check(public.bov_hub_admin());
create policy bov_projects_update on public.bov_projects for update to authenticated using(public.bov_hub_admin()) with check(public.bov_hub_admin());
create policy bov_reports_read on public.bov_project_reports for select to authenticated using(public.bov_hub_access());
create policy bov_reports_insert on public.bov_project_reports for insert to authenticated with check(public.bov_hub_admin());
-- Append-only versioning, serialized per project to avoid duplicate versions.
create or replace function public.bov_report_assign_version()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform 1 from public.bov_projects where id=new.project_id for update;
 if not found then raise exception 'Project unavailable'; end if;
 select coalesce(max(version),0)+1 into new.version from public.bov_project_reports where project_id=new.project_id;
 return new;
end $$;
drop trigger if exists bov_report_version on public.bov_project_reports;
create trigger bov_report_version before insert on public.bov_project_reports
for each row execute function public.bov_report_assign_version();
-- No update/delete permissions or policies on saved reports: prior versions remain immutable.
select 'Workbench project and report storage ready' as result;