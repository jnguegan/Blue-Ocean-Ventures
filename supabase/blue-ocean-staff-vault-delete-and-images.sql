-- Blue Ocean Ventures: Staff Vault administrator deletion and image uploads.
-- Run in the BLUE OCEAN Supabase SQL Editor. No existing files are deleted.
-- Requires public.bov_hub_admin(), public.bov_hub_access(), and existing vault table.
begin;
do $$ begin
 if to_regclass('public.bov_hub_project_documents') is null then
  raise exception 'Staff Vault table is missing';
 end if;
end $$;
-- Allow photo metadata in addition to existing PDF/DOCX records.
alter table public.bov_hub_project_documents
 drop constraint if exists bov_hub_project_documents_mime_type_check;
alter table public.bov_hub_project_documents
 add constraint bov_hub_project_documents_mime_type_check
 check (mime_type in (
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg','image/png','image/webp'
 ));
-- The bucket remains private; images and documents retain the 10MB/file limit.
update storage.buckets
set public=false,
    file_size_limit=10485760,
    allowed_mime_types=array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/jpeg','image/png','image/webp'
    ]
where id='bov-hub-project-documents';
-- Table privilege + row-level policy: administrators only.
grant delete on table public.bov_hub_project_documents to authenticated;
drop policy if exists bov_vault_admin_delete on public.bov_hub_project_documents;
create policy bov_vault_admin_delete on public.bov_hub_project_documents
 for delete to authenticated using (public.bov_hub_admin());
-- Storage deletion: only administrators, only files in the Staff Vault.
drop policy if exists bov_project_storage_admin_delete on storage.objects;
create policy bov_project_storage_admin_delete on storage.objects
 for delete to authenticated using (
  bucket_id='bov-hub-project-documents' and public.bov_hub_admin()
 );
commit;
-- Review policies after execution:
select policyname,cmd,roles from pg_policies
where (schemaname='public' and tablename='bov_hub_project_documents')
   or (schemaname='storage' and tablename='objects' and policyname='bov_project_storage_admin_delete');
