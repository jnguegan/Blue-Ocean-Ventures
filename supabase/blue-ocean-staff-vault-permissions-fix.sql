-- Blue Ocean Knowledge Hub: repair Staff Vault metadata permissions.
-- Run ONLY in Blue Ocean Supabase SQL Editor.
-- Preserves documents, requires authenticated active Blue Ocean staff.
-- Existing RLS policies are retained; no public or anon access is granted.

begin;

-- Fail safely if the expected table is absent.
do $$ begin
 if to_regclass('public.bov_hub_project_documents') is null then
  raise exception 'Missing public.bov_hub_project_documents: install Staff Vault migration first';
 end if;
end $$;

alter table public.bov_hub_project_documents enable row level security;
revoke all on table public.bov_hub_project_documents from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert on table public.bov_hub_project_documents to authenticated;

-- RLS: only active Blue Ocean staff can list or insert document metadata.
-- Do not use permissive authenticated-only policies without a staff check.
drop policy if exists bov_vault_staff_select_fix on public.bov_hub_project_documents;
create policy bov_vault_staff_select_fix on public.bov_hub_project_documents
 for select to authenticated using (public.bov_hub_access());
drop policy if exists bov_vault_staff_insert_fix on public.bov_hub_project_documents;
create policy bov_vault_staff_insert_fix on public.bov_hub_project_documents
 for insert to authenticated with check (public.bov_hub_access() and uploaded_by = auth.uid());

commit;

-- Diagnostic: should show authenticated SELECT and INSERT plus staff RLS policies.
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='bov_hub_project_documents'
 and grantee in ('anon','authenticated') order by grantee,privilege_type;
select policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename='bov_hub_project_documents';
