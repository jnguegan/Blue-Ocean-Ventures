-- Run in Blue Ocean Supabase SQL Editor. Public signup creates client or pending staff profile.
create table if not exists public.bov_account_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 account_type text not null check(account_type in ('client','staff')),
 approval_status text not null default 'pending' check(approval_status in ('pending','approved','rejected')),
 full_name text,organisation text,created_at timestamptz not null default now()
);
alter table public.bov_account_profiles enable row level security;
revoke all on public.bov_account_profiles from anon,authenticated;
grant select on public.bov_account_profiles to authenticated;
drop policy if exists bov_account_own_profile on public.bov_account_profiles;
create policy bov_account_own_profile on public.bov_account_profiles for select to authenticated using(user_id=auth.uid());
-- No direct client updates to role/approval. Trigger ignores any supplied approval claim.
create or replace function public.bov_register_account() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare requested text;
begin
 requested:=case when new.raw_user_meta_data->>'account_type'='staff' then 'staff' else 'client' end;
 insert into public.bov_account_profiles(user_id,account_type,approval_status,full_name,organisation)
 values(new.id,requested,case when requested='client' then 'approved' else 'pending' end,
 left(coalesce(new.raw_user_meta_data->>'full_name',''),200),left(coalesce(new.raw_user_meta_data->>'organisation',''),200))
 on conflict(user_id) do nothing;
 return new;
end $$;
drop trigger if exists bov_account_signup on auth.users;
create trigger bov_account_signup after insert on auth.users for each row execute function public.bov_register_account();
-- Existing users are not automatically promoted to staff.
insert into public.bov_account_profiles(user_id,account_type,approval_status)
select u.id,case when s.user_id is not null then 'staff' else 'client' end,
case when s.user_id is not null then 'approved' else 'approved' end
from auth.users u left join public.bov_hub_staff s on s.user_id=u.id and s.active=true
on conflict(user_id) do nothing;
-- Staff approval must be performed by an existing approved Hub administrator.
create or replace function public.bov_approve_staff(requested_user uuid,approve boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.bov_hub_staff where user_id=auth.uid() and role='admin' and active=true) then raise exception 'Administrator access required';end if;
 if not exists(select 1 from public.bov_account_profiles where user_id=requested_user and account_type='staff') then raise exception 'No staff application found';end if;
 update public.bov_account_profiles set approval_status=case when approve then 'approved' else 'rejected' end where user_id=requested_user;
 if approve then
 insert into public.bov_hub_staff(user_id,role,active) values(requested_user,'staff',true)
 on conflict(user_id) do update set role='staff',active=true;
 else
 update public.bov_hub_staff set active=false where user_id=requested_user;
 end if;
end $$;
revoke all on function public.bov_approve_staff(uuid,boolean) from public;
grant execute on function public.bov_approve_staff(uuid,boolean) to authenticated;
-- Administrators can review pending requests through a security-definer RPC.
create or replace function public.bov_pending_staff() returns table(user_id uuid,full_name text,organisation text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.bov_hub_staff s where s.user_id=auth.uid() and s.role='admin' and s.active=true) then raise exception 'Administrator access required';end if;
 return query select p.user_id,p.full_name,p.organisation,p.created_at from public.bov_account_profiles p where p.account_type='staff' and p.approval_status='pending' order by p.created_at;
end $$;
revoke all on function public.bov_pending_staff() from public;
grant execute on function public.bov_pending_staff() to authenticated;
