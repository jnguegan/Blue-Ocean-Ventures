-- Read-only diagnostic. Safe to run in the Blue Ocean Supabase SQL Editor.
-- Does not change tables, policies, permissions or data.
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('bov_projects','bov_project_reports','bov_hub_staff','bov_staff')
order by table_name,ordinal_position;

select schemaname,tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('bov_projects','bov_project_reports')
order by tablename,policyname;

select table_name, row_security_active
from (
 select 'bov_projects'::text as table_name, row_security_active('public.bov_projects'::regclass) as row_security_active
 where to_regclass('public.bov_projects') is not null
 union all
 select 'bov_project_reports', row_security_active('public.bov_project_reports'::regclass)
 where to_regclass('public.bov_project_reports') is not null
) as status;

select
 to_regclass('public.bov_projects') is not null as projects_table_exists,
 to_regclass('public.bov_project_reports') is not null as reports_table_exists,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='bov_projects' and column_name='project_name') as workbench_project_name_column,
 exists(select 1 from information_schema.columns where table_schema='public' and table_name='bov_projects' and column_name='organisation_id') as studio_organisation_id_column;
