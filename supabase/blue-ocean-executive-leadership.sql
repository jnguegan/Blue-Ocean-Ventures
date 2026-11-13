-- Blue Ocean Ventures: equal operational access for executive leadership.
-- Run in the Supabase SQL Editor AFTER blue-ocean-account-registration.sql
-- and the Knowledge Hub phase scripts. GitHub commits do not apply SQL automatically.
-- The existing Hub 'admin' role remains reserved for platform account management.
-- Executives receive full internal Hub operations but cannot approve staff accounts.

begin;

alter table public.bov_hub_staff
  drop constraint if exists bov_hub_staff_role_check;
alter table public.bov_hub_staff
  add constraint bov_hub_staff_role_check
  check (role in ('admin','consultant','staff','executive_leadership'));

create or replace function public.bov_hub_editor()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
 select exists (
  select 1 from public.bov_hub_staff s
  where s.user_id = auth.uid()
    and s.active = true
    and s.role in ('admin','executive_leadership')
 );
$$;
revoke all on function public.bov_hub_editor() from public, anon;
grant execute on function public.bov_hub_editor() to authenticated;

-- Executives may view the staff directory but not change staff role records.
drop policy if exists bov_hub_staff_self on public.bov_hub_staff;
create policy bov_hub_staff_self on public.bov_hub_staff for select
to authenticated using (user_id = auth.uid() or public.bov_hub_editor());

-- Full operational editing of Knowledge Hub records and links.
drop policy if exists bov_hub_records_insert on public.bov_hub_records;
create policy bov_hub_records_insert on public.bov_hub_records for insert
to authenticated with check (public.bov_hub_editor());
drop policy if exists bov_hub_records_update on public.bov_hub_records;
create policy bov_hub_records_update on public.bov_hub_records for update
to authenticated using (public.bov_hub_editor()) with check (public.bov_hub_editor());
drop policy if exists bov_hub_records_delete on public.bov_hub_records;
create policy bov_hub_records_delete on public.bov_hub_records for delete
to authenticated using (public.bov_hub_editor());

drop policy if exists bov_hub_links_insert on public.bov_hub_links;
create policy bov_hub_links_insert on public.bov_hub_links for insert
to authenticated with check (public.bov_hub_editor());
drop policy if exists bov_hub_links_update on public.bov_hub_links;
create policy bov_hub_links_update on public.bov_hub_links for update
to authenticated using (public.bov_hub_editor()) with check (public.bov_hub_editor());
drop policy if exists bov_hub_links_delete on public.bov_hub_links;
create policy bov_hub_links_delete on public.bov_hub_links for delete
to authenticated using (public.bov_hub_editor());

-- Full operational editing of opportunities, assessments, and contact activity.
drop policy if exists bov_hub_opportunities_admin on public.bov_hub_opportunities;
create policy bov_hub_opportunities_admin on public.bov_hub_opportunities
for all to authenticated using (public.bov_hub_editor())
with check (public.bov_hub_editor());
drop policy if exists bov_hub_assessments_admin on public.bov_hub_assessments;
create policy bov_hub_assessments_admin on public.bov_hub_assessments
for all to authenticated using (public.bov_hub_editor())
with check (public.bov_hub_editor());
drop policy if exists bov_hub_contact_activity_admin on public.bov_hub_contact_activity;
create policy bov_hub_contact_activity_admin on public.bov_hub_contact_activity
for all to authenticated using (public.bov_hub_editor())
with check (public.bov_hub_editor());

-- Operational staff document removal (metadata and private storage).
-- Existing staff-only read/upload policies remain intact.
drop policy if exists bov_vault_admin_delete on public.bov_hub_project_documents;
create policy bov_vault_admin_delete on public.bov_hub_project_documents
for delete to authenticated using (public.bov_hub_editor());
drop policy if exists bov_project_storage_admin_delete on storage.objects;
create policy bov_project_storage_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'bov-hub-project-documents' and public.bov_hub_editor());

-- Preserve all existing assessment evidence requirements and decision locking;
-- extend permission to executive leadership while keeping technical roles distinct.
create or replace function public.bov_phase7_guard_assessment()
returns trigger language plpgsql security invoker
set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.decision in ('approved','rejected')
    and new.decision is distinct from old.decision then
  raise exception 'Final decisions cannot be changed; create a new assessment for reassessment';
 end if;
 if new.decision in ('approved','rejected') then
  if not public.bov_hub_editor() then
   raise exception 'Executive Leadership permission required for a final decision';
  end if;
  if new.decision='approved' then
   if new.opportunity_id is null or not new.call_confirmed or new.mandate_fit <> 'yes'
    or new.country_eligible <> 'yes' or new.applicant_eligible <> 'yes'
    or new.budget_eligible <> 'yes'
    or nullif(btrim(coalesce(new.evidence_url,'')),'') is null then
    raise exception 'Approval requires a linked opportunity, confirmed call, all eligibility checks YES and evidence URL';
   end if;
  end if;
  if tg_op='INSERT' or old.decision is distinct from new.decision then
   new.reviewed_by := auth.uid();
   new.reviewed_at := now();
  end if;
 else
  new.reviewed_by := null;
  new.reviewed_at := null;
 end if;
 return new;
end $$;

-- Account lookup is exact-email only; available only to the existing Hub admin.
create or replace function public.bov_lookup_account_for_leadership(p_email text)
returns table(
 user_id uuid, email text, full_name text,
 account_type text, approval_status text, role text, active boolean
)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.bov_hub_admin() then
  raise exception 'Administrator access required';
 end if;
 if nullif(btrim(coalesce(p_email,'')),'') is null then
  raise exception 'Email address required';
 end if;
 return query
 select u.id, u.email::text, p.full_name, p.account_type,
        p.approval_status, s.role, s.active
 from auth.users u
 left join public.bov_account_profiles p on p.user_id=u.id
 left join public.bov_hub_staff s on s.user_id=u.id
 where lower(u.email)=lower(btrim(p_email))
 limit 1;
end $$;
revoke all on function public.bov_lookup_account_for_leadership(text) from public, anon;
grant execute on function public.bov_lookup_account_for_leadership(text) to authenticated;

-- Only the current Hub admin may promote an existing, verified auth user.
-- No hardcoded emails, guesses, or automatic promotions of clients.
create or replace function public.bov_grant_executive_leadership(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.bov_hub_admin() then
  raise exception 'Administrator access required';
 end if;
 if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
  raise exception 'Registered account not found';
 end if;
 if exists (
   select 1 from public.bov_hub_staff
   where user_id=p_user_id and role='admin'
 ) then
  raise exception 'Cannot replace an existing administrator role';
 end if;
 insert into public.bov_account_profiles (user_id,account_type,approval_status)
 values (p_user_id,'staff','approved')
 on conflict (user_id) do update
   set account_type='staff', approval_status='approved';
 insert into public.bov_hub_staff (user_id,role,active)
 values (p_user_id,'executive_leadership',true)
 on conflict (user_id) do update
   set role='executive_leadership', active=true;
end $$;
revoke all on function public.bov_grant_executive_leadership(uuid) from public, anon;
grant execute on function public.bov_grant_executive_leadership(uuid) to authenticated;

commit;

-- After running this migration, use account.html as your existing Hub administrator,
-- look up Dr. Kseniya and Badu by their exact registered emails, and grant both.
-- Existing admin remains admin; no GitHub, Netlify or Supabase-console permission is granted.
