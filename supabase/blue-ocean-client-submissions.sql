-- Blue Ocean Ventures — Client Dashboard: project submissions with documents.
-- Clients fill a project form (saved as a draft), upload documents and submit.
-- On submit the server creates the Workbench project, fills the project intake,
-- links the client, hands the documents to the staff document vault (so matching can read them)
-- and opens a conversation so staff are notified in the Client inbox.
-- Run once in the Supabase SQL Editor. Safe to run again.
begin;

create table if not exists public.bov_client_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','under_review','matching','proposal_sent','closed')),
  -- about the applicant
  contact_name text check (contact_name is null or length(contact_name) <= 160),
  contact_phone text check (contact_phone is null or length(contact_phone) <= 60),
  organisation_name text check (organisation_name is null or length(organisation_name) <= 240),
  applicant_type text check (applicant_type is null or length(applicant_type) <= 120),
  registration_country text check (registration_country is null or length(registration_country) <= 80),
  -- the project
  project_title text check (project_title is null or length(project_title) <= 240),
  country text check (country is null or length(country) <= 80),
  region text check (region is null or length(region) <= 160),
  site_address text check (site_address is null or length(site_address) <= 300),
  ownership_type text check (ownership_type is null or ownership_type in ('owner','co_owner','company_owned','lease','permission_of_owner','purchase_option','other','unknown')),
  project_areas text[] not null default '{}',
  description text check (description is null or length(description) <= 8000),
  beneficiaries text check (beneficiaries is null or length(beneficiaries) <= 3000),
  jobs_created int check (jobs_created is null or jobs_created between 0 and 100000),
  -- money and timeline
  currency text not null default 'EUR' check (currency in ('EUR','GBP','USD','CHF')),
  total_budget numeric(16,2) check (total_budget is null or total_budget >= 0),
  funding_requested numeric(16,2) check (funding_requested is null or funding_requested >= 0),
  own_contribution numeric(16,2) check (own_contribution is null or own_contribution >= 0),
  planned_start date,
  duration_months int check (duration_months is null or duration_months between 1 and 240),
  submission_language text not null default 'en' check (submission_language in ('en','de','fr','es')),
  -- workflow
  project_id uuid references public.bov_projects(id) on delete set null,
  conversation_id uuid references public.bov_conversations(id) on delete set null,
  staff_note text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bov_client_submissions_client on public.bov_client_submissions(client_id, updated_at desc);
create index if not exists bov_client_submissions_status on public.bov_client_submissions(status, submitted_at desc);

create table if not exists public.bov_client_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.bov_client_submissions(id) on delete cascade,
  client_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 240),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp')),
  file_size bigint not null check (file_size between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index if not exists bov_client_submission_files_sub on public.bov_client_submission_files(submission_id);

create or replace function public.bov_client_submission_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists bov_client_submission_touch on public.bov_client_submissions;
create trigger bov_client_submission_touch before update on public.bov_client_submissions
  for each row execute function public.bov_client_submission_touch();

-- ---------- row level security ----------
alter table public.bov_client_submissions enable row level security;
alter table public.bov_client_submission_files enable row level security;
revoke all on public.bov_client_submissions, public.bov_client_submission_files from anon, authenticated;
grant select, insert, delete on public.bov_client_submissions to authenticated;
grant update (contact_name, contact_phone, organisation_name, applicant_type, registration_country, project_title, country, region,
  site_address, ownership_type, project_areas, description, beneficiaries, jobs_created, currency, total_budget, funding_requested,
  own_contribution, planned_start, duration_months, submission_language) on public.bov_client_submissions to authenticated;
grant select, insert, delete on public.bov_client_submission_files to authenticated;

drop policy if exists bov_subs_read on public.bov_client_submissions;
create policy bov_subs_read on public.bov_client_submissions for select to authenticated
  using (client_id = auth.uid() or public.bov_hub_access());
drop policy if exists bov_subs_insert on public.bov_client_submissions;
create policy bov_subs_insert on public.bov_client_submissions for insert to authenticated
  with check (client_id = auth.uid() and status = 'draft' and project_id is null);
drop policy if exists bov_subs_update on public.bov_client_submissions;
create policy bov_subs_update on public.bov_client_submissions for update to authenticated
  using (client_id = auth.uid() and status = 'draft') with check (client_id = auth.uid() and status = 'draft');
drop policy if exists bov_subs_delete on public.bov_client_submissions;
create policy bov_subs_delete on public.bov_client_submissions for delete to authenticated
  using (client_id = auth.uid() and status = 'draft');

drop policy if exists bov_subfiles_read on public.bov_client_submission_files;
create policy bov_subfiles_read on public.bov_client_submission_files for select to authenticated
  using (client_id = auth.uid() or public.bov_hub_access());
drop policy if exists bov_subfiles_insert on public.bov_client_submission_files;
create policy bov_subfiles_insert on public.bov_client_submission_files for insert to authenticated
  with check (client_id = auth.uid()
    and storage_path like 'client/' || auth.uid()::text || '/%'
    and exists (select 1 from public.bov_client_submissions s where s.id = submission_id and s.client_id = auth.uid() and s.status = 'draft'));
drop policy if exists bov_subfiles_delete on public.bov_client_submission_files;
create policy bov_subfiles_delete on public.bov_client_submission_files for delete to authenticated
  using (client_id = auth.uid()
    and exists (select 1 from public.bov_client_submissions s where s.id = submission_id and s.status = 'draft'));

-- ---------- private storage: clients use their own folder in the project document bucket ----------
update storage.buckets
   set public = false, file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
 where id = 'bov-hub-project-documents';
drop policy if exists bov_client_storage_insert on storage.objects;
create policy bov_client_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'bov-hub-project-documents'
  and (storage.foldername(name))[1] = 'client'
  and (storage.foldername(name))[2] = (select auth.uid())::text);
drop policy if exists bov_client_storage_select on storage.objects;
create policy bov_client_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'bov-hub-project-documents'
  and (storage.foldername(name))[1] = 'client'
  and (storage.foldername(name))[2] = (select auth.uid())::text);
drop policy if exists bov_client_storage_delete on storage.objects;
create policy bov_client_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'bov-hub-project-documents'
  and (storage.foldername(name))[1] = 'client'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and not exists (select 1 from public.bov_client_submission_files f
                   join public.bov_client_submissions s on s.id = f.submission_id
                  where f.storage_path = name and s.status <> 'draft'));

-- ---------- submit ----------
create or replace function public.bov_submit_client_project(p_submission uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s bov_client_submissions%rowtype; p uuid; c uuid; org text; nfiles int; label text;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into s from bov_client_submissions where id = p_submission and client_id = auth.uid() for update;
  if not found then raise exception 'Project not found'; end if;
  if s.status <> 'draft' then raise exception 'This project has already been submitted'; end if;
  if coalesce(length(btrim(s.project_title)),0) < 3 then raise exception 'Please give your project a title'; end if;
  if coalesce(btrim(s.country),'') = '' then raise exception 'Please choose the country where the project takes place'; end if;
  if coalesce(btrim(s.applicant_type),'') = '' then raise exception 'Please choose your legal type'; end if;
  if coalesce(array_length(s.project_areas,1),0) = 0 then raise exception 'Please choose at least one project area'; end if;
  if coalesce(length(btrim(s.description)),0) < 50 then raise exception 'Please describe your project in at least 50 characters'; end if;
  org := coalesce(nullif(btrim(s.organisation_name),''), nullif(btrim(s.contact_name),''), public.bov_display_name(auth.uid()), 'Private applicant');

  insert into bov_projects(project_name, organisation_name, country, applicant_type, description, stage, status, next_action, created_by)
  values (btrim(s.project_title), org, btrim(s.country), s.applicant_type, s.description, 'registration', 'active',
          'Review client submission and run Find Matching Funding Programmes', auth.uid())
  returning id into p;

  insert into bov_project_members(project_id, user_id, added_by) values (p, auth.uid(), auth.uid()) on conflict do nothing;

  insert into bov_project_intake(project_id, promoter_name, promoter_type, contact_email, contact_phone, site_address, region, country,
      ownership_type, idea_title, idea_summary, sectors, target_beneficiaries, jobs_created, total_investment_eur, own_contribution_eur,
      funding_requested_eur, planned_start, duration_months, submission_language, status, updated_by)
  values (p, org,
      case when s.applicant_type ilike '%NGO%' or s.applicant_type ilike 'Foundation%' then 'ngo'
           when s.applicant_type ilike 'Private company%' then 'company'
           when s.applicant_type ilike 'Government%' then 'public_body'
           when s.applicant_type ilike 'Individual%' then 'individual' else 'other' end,
      (select email from auth.users where id = auth.uid()), s.contact_phone, s.site_address, s.region, s.country,
      s.ownership_type, s.project_title, s.description, s.project_areas, s.beneficiaries, s.jobs_created,
      case when s.currency = 'EUR' then s.total_budget end, case when s.currency = 'EUR' then s.own_contribution end,
      case when s.currency = 'EUR' then s.funding_requested end, s.planned_start, s.duration_months, s.submission_language, 'draft', auth.uid())
  on conflict (project_id) do nothing;

  insert into bov_hub_project_documents(project_name, organisation_name, file_name, storage_path, mime_type, file_size, uploaded_by)
  select btrim(s.project_title), org, f.file_name, f.storage_path, f.mime_type, f.file_size, auth.uid()
    from bov_client_submission_files f where f.submission_id = s.id
  on conflict (storage_path) do nothing;
  get diagnostics nfiles = row_count;

  label := left('Project submitted: ' || btrim(s.project_title), 200);
  insert into bov_conversations(client_id, project_id, subject, topic, created_by)
  values (auth.uid(), p, label, 'project', auth.uid()) returning id into c;
  insert into bov_messages(conversation_id, body) values (c,
    'I have submitted my project "' || btrim(s.project_title) || '" (' || btrim(s.country) || ') with ' || nfiles || ' document(s).');
  perform set_config('bov.system_message', 'on', true);
  insert into bov_messages(conversation_id, body) values (c,
    'Thank you, your project has been received. Our team will review it and look for matching UN and EU funding. You can follow its status in your Client Dashboard and reply here at any time.');
  perform set_config('bov.system_message', 'off', true);
  insert into bov_message_reads(conversation_id, user_id, last_read_at) values (c, auth.uid(), clock_timestamp())
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  update bov_client_submissions set status = 'submitted', project_id = p, conversation_id = c, submitted_at = now() where id = s.id;
  return jsonb_build_object('project_id', p, 'conversation_id', c, 'documents', nfiles);
end $$;

-- ---------- staff: list and move submissions along ----------
create or replace function public.bov_staff_submissions(p_status text default 'active')
returns table (id uuid, status text, project_title text, country text, organisation_name text, applicant_type text,
               client_email text, contact_name text, submitted_at timestamptz, project_id uuid, conversation_id uuid,
               files int, funding_requested numeric, currency text, project_areas text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  return query
  select s.id, s.status, s.project_title, s.country, s.organisation_name, s.applicant_type, u.email::text, s.contact_name,
         s.submitted_at, s.project_id, s.conversation_id,
         (select count(*)::int from bov_client_submission_files f where f.submission_id = s.id), s.funding_requested, s.currency, s.project_areas
    from bov_client_submissions s left join auth.users u on u.id = s.client_id
   where s.status <> 'draft' and (p_status = 'all' or (p_status = 'active' and s.status not in ('closed')) or s.status = p_status)
   order by s.submitted_at desc nulls last;
end $$;

create or replace function public.bov_set_submission_status(p_submission uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s bov_client_submissions%rowtype; label text;
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  if p_status not in ('submitted','under_review','matching','proposal_sent','closed') then raise exception 'Invalid status'; end if;
  select * into s from bov_client_submissions where id = p_submission for update;
  if not found or s.status = 'draft' then raise exception 'Submission not found'; end if;
  if s.status = p_status then return; end if;
  update bov_client_submissions set status = p_status, staff_note = coalesce(p_note, staff_note) where id = p_submission;
  label := case p_status when 'submitted' then 'Submitted' when 'under_review' then 'Under review' when 'matching' then 'Funding matching'
                         when 'proposal_sent' then 'Proposal sent' else 'Closed' end;
  if s.conversation_id is not null then
    perform set_config('bov.system_message', 'on', true);
    insert into bov_messages(conversation_id, body) values (s.conversation_id,
      'Status update for "' || coalesce(s.project_title,'your project') || '": ' || label || '.' || coalesce(' ' || nullif(btrim(p_note),''), ''));
    perform set_config('bov.system_message', 'off', true);
  end if;
end $$;

revoke all on function public.bov_submit_client_project(uuid), public.bov_staff_submissions(text), public.bov_set_submission_status(uuid,text,text) from public, anon;
grant execute on function public.bov_submit_client_project(uuid), public.bov_staff_submissions(text), public.bov_set_submission_status(uuid,text,text) to authenticated;

commit;
select 'Client project submissions ready' as result;
