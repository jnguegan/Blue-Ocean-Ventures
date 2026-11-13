-- Phase 7: staff-only private project document vault.
-- Run once in Blue Ocean Supabase SQL Editor before using Upload.
create table if not exists public.bov_hub_project_documents (
 id uuid primary key default gen_random_uuid(),
 project_name text not null check (length(trim(project_name)) between 2 and 240),
 organisation_name text not null,
 file_name text not null,
 storage_path text not null unique,
 mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 file_size bigint not null check (file_size between 1 and 10485760),
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists bov_hub_project_documents_project_idx on public.bov_hub_project_documents(project_name);
alter table public.bov_hub_project_documents enable row level security;
drop policy if exists bov_documents_staff_read on public.bov_hub_project_documents;
create policy bov_documents_staff_read on public.bov_hub_project_documents for select to authenticated using (
 exists(select 1 from public.bov_hub_staff s where s.user_id=(select auth.uid()) and s.active=true)
);
drop policy if exists bov_documents_staff_insert on public.bov_hub_project_documents;
create policy bov_documents_staff_insert on public.bov_hub_project_documents for insert to authenticated with check (
 uploaded_by=(select auth.uid()) and exists(select 1 from public.bov_hub_staff s where s.user_id=(select auth.uid()) and s.active=true)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('bov-hub-project-documents','bov-hub-project-documents',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists bov_project_storage_staff_insert on storage.objects;
create policy bov_project_storage_staff_insert on storage.objects for insert to authenticated with check (
 bucket_id='bov-hub-project-documents'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.bov_hub_staff s where s.user_id=(select auth.uid()) and s.active=true)
);
drop policy if exists bov_project_storage_staff_select on storage.objects;
create policy bov_project_storage_staff_select on storage.objects for select to authenticated using (
 bucket_id='bov-hub-project-documents'
 and exists(select 1 from public.bov_hub_staff s where s.user_id=(select auth.uid()) and s.active=true)
);
-- No public storage policies, no client read, no overwrite/delete policies.
