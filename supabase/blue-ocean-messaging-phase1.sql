-- Blue Ocean Ventures — Client ↔ staff messaging, phase 1
-- Clients ask questions from their Dashboard (client-portal.html): general questions or about a linked project.
-- Staff reply from the Workbench "Client inbox". Messages appear instantly (Supabase Realtime).
-- Tables:   bov_project_members  (client accounts linked to projects by staff)
--           bov_conversations    (one thread: a client, optional project, subject, open/closed)
--           bov_messages         (messages in a thread; sender stamped by the server)
--           bov_message_reads    (per user, last time a thread was read → unread counts)
-- Security: a client sees only their own conversations (and only links to projects they belong to);
--           staff (bov_hub_access()) see everything. Messages cannot be edited or deleted.
begin;

create table if not exists public.bov_project_members (
  project_id uuid not null references public.bov_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client')),
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.bov_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.bov_projects(id) on delete set null,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  topic text not null default 'general' check (topic in ('general','project','funding','website','other')),
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists bov_conversations_client on public.bov_conversations(client_id, last_message_at desc);
create index if not exists bov_conversations_recent on public.bov_conversations(last_message_at desc);

create table if not exists public.bov_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.bov_conversations(id) on delete cascade,
  sender_id uuid default auth.uid() references auth.users(id) on delete set null,
  sender_role text not null default 'client' check (sender_role in ('client','staff','system')),
  sender_name text,
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists bov_messages_thread on public.bov_messages(conversation_id, created_at);

create table if not exists public.bov_message_reads (
  conversation_id uuid not null references public.bov_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------- helpers ----------
create or replace function public.bov_is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bov_project_members where project_id = p_project and user_id = auth.uid());
$$;

create or replace function public.bov_owns_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bov_conversations where id = p_conversation and client_id = auth.uid());
$$;

create or replace function public.bov_display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(btrim(full_name),'') from bov_account_profiles where user_id = p_user),
                  (select split_part(email,'@',1) from auth.users where id = p_user));
$$;

-- Sender identity is set by the server, never trusted from the browser.
create or replace function public.bov_message_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('bov.system_message', true) = 'on' then
    new.sender_id := null; new.sender_role := 'system'; new.sender_name := 'Blue Ocean Ventures';
  else
    new.sender_id := auth.uid();
    new.sender_role := case when public.bov_hub_access() then 'staff' else 'client' end;
    new.sender_name := left(coalesce(public.bov_display_name(auth.uid()), case when new.sender_role = 'staff' then 'Blue Ocean team' else 'Client' end), 120);
  end if;
  new.body := btrim(new.body);
  new.created_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists bov_message_stamp on public.bov_messages;
create trigger bov_message_stamp before insert on public.bov_messages for each row execute function public.bov_message_stamp();

-- Keep the thread's last activity up to date; a client message re-opens a closed thread.
create or replace function public.bov_message_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update bov_conversations set last_message_at = new.created_at,
         status = case when new.sender_role = 'client' then 'open' else status end
   where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists bov_message_after on public.bov_messages;
create trigger bov_message_after after insert on public.bov_messages for each row execute function public.bov_message_after();

-- ---------- row level security ----------
alter table public.bov_project_members enable row level security;
alter table public.bov_conversations enable row level security;
alter table public.bov_messages enable row level security;
alter table public.bov_message_reads enable row level security;
revoke all on public.bov_project_members, public.bov_conversations, public.bov_messages, public.bov_message_reads from anon;
grant select on public.bov_project_members, public.bov_conversations to authenticated;
grant select, insert on public.bov_messages to authenticated;
grant select, insert, update on public.bov_message_reads to authenticated;

drop policy if exists bov_members_read on public.bov_project_members;
create policy bov_members_read on public.bov_project_members for select to authenticated
  using (public.bov_hub_access() or user_id = auth.uid());

drop policy if exists bov_conversations_read on public.bov_conversations;
create policy bov_conversations_read on public.bov_conversations for select to authenticated
  using (public.bov_hub_access() or client_id = auth.uid());

drop policy if exists bov_messages_read on public.bov_messages;
create policy bov_messages_read on public.bov_messages for select to authenticated
  using (public.bov_hub_access() or public.bov_owns_conversation(conversation_id));
drop policy if exists bov_messages_send on public.bov_messages;
create policy bov_messages_send on public.bov_messages for insert to authenticated
  with check (public.bov_hub_access() or public.bov_owns_conversation(conversation_id));

drop policy if exists bov_reads_own on public.bov_message_reads;
create policy bov_reads_own on public.bov_message_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- client functions ----------
create or replace function public.bov_start_conversation(p_subject text, p_body text, p_topic text default 'general', p_project uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if p_project is not null and not (public.bov_hub_access() or public.bov_is_project_member(p_project)) then
    raise exception 'This project is not linked to your account';
  end if;
  insert into bov_conversations(client_id, project_id, subject, topic, created_by)
  values (auth.uid(), p_project, left(btrim(p_subject),200),
          case when p_topic in ('general','project','funding','website','other') then p_topic else 'general' end, auth.uid())
  returning id into c;
  insert into bov_messages(conversation_id, body) values (c, p_body);
  -- automatic acknowledgement
  perform set_config('bov.system_message', 'on', true);
  insert into bov_messages(conversation_id, body) values (c,
    'Thank you, your message has been received. A member of the Blue Ocean Ventures team will reply here as soon as possible, usually within one business day. You will see the reply in your Dashboard.');
  perform set_config('bov.system_message', 'off', true);
  insert into bov_message_reads(conversation_id, user_id, last_read_at) values (c, auth.uid(), clock_timestamp())
    on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return c;
end;
$$;

create or replace function public.bov_my_projects()
returns table (project_id uuid, project_name text, country text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(to_jsonb(p)->>'project_name', to_jsonb(p)->>'title', 'Project'), to_jsonb(p)->>'country'
  from bov_project_members m join bov_projects p on p.id = m.project_id
  where m.user_id = auth.uid() order by 2;
$$;

create or replace function public.bov_my_conversations()
returns table (id uuid, subject text, topic text, status text, project_name text, last_message_at timestamptz, last_body text, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.subject, c.topic, c.status,
         (select coalesce(to_jsonb(p)->>'project_name', to_jsonb(p)->>'title') from bov_projects p where p.id = c.project_id),
         c.last_message_at,
         (select left(m.body,140) from bov_messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
         (select count(*)::int from bov_messages m where m.conversation_id = c.id and m.sender_role = 'staff'
            and m.created_at > coalesce((select last_read_at from bov_message_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity'))
  from bov_conversations c where c.client_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.bov_mark_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.bov_hub_access() or public.bov_owns_conversation(p_conversation)) then raise exception 'Not allowed'; end if;
  insert into bov_message_reads(conversation_id, user_id, last_read_at) values (p_conversation, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- ---------- staff functions ----------
create or replace function public.bov_staff_inbox(p_status text default 'open')
returns table (id uuid, subject text, topic text, status text, client_id uuid, client_name text, client_email text, organisation text,
               project_id uuid, project_name text, last_message_at timestamptz, last_body text, last_sender_role text, unread int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  return query
  select c.id, c.subject, c.topic, c.status, c.client_id, public.bov_display_name(c.client_id), u.email::text, a.organisation,
         c.project_id, (select coalesce(to_jsonb(p)->>'project_name', to_jsonb(p)->>'title') from bov_projects p where p.id = c.project_id),
         c.last_message_at, lm.body, lm.sender_role,
         (select count(*)::int from bov_messages m where m.conversation_id = c.id and m.sender_role = 'client'
            and m.created_at > coalesce((select last_read_at from bov_message_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity'))
  from bov_conversations c
  left join auth.users u on u.id = c.client_id
  left join bov_account_profiles a on a.user_id = c.client_id
  left join lateral (select left(m.body,140) as body, m.sender_role from bov_messages m where m.conversation_id = c.id and m.sender_role <> 'system' order by m.created_at desc limit 1) lm on true
  where p_status = 'all' or c.status = p_status
  order by c.last_message_at desc;
end;
$$;

create or replace function public.bov_staff_start_conversation(p_email text, p_subject text, p_body text, p_project uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid; c uuid;
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  select id into u from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if u is null then raise exception 'No account found for %. Ask the client to sign up on the website first.', btrim(p_email); end if;
  insert into bov_conversations(client_id, project_id, subject, topic, created_by)
  values (u, p_project, left(btrim(p_subject),200), case when p_project is null then 'general' else 'project' end, auth.uid())
  returning id into c;
  insert into bov_messages(conversation_id, body) values (c, p_body);
  return c;
end;
$$;

create or replace function public.bov_set_conversation_status(p_conversation uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  if p_status not in ('open','closed') then raise exception 'Invalid status'; end if;
  update bov_conversations set status = p_status where id = p_conversation;
end;
$$;

create or replace function public.bov_link_client(p_project uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  select id into u from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if u is null then raise exception 'No account found for %. Ask the client to sign up on the website first.', btrim(p_email); end if;
  insert into bov_project_members(project_id, user_id, added_by) values (p_project, u, auth.uid()) on conflict do nothing;
  return jsonb_build_object('user_id', u, 'name', coalesce(public.bov_display_name(u), btrim(p_email)));
end;
$$;

create or replace function public.bov_unlink_client(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  delete from bov_project_members where project_id = p_project and user_id = p_user;
end;
$$;

create or replace function public.bov_project_clients(p_project uuid)
returns table (user_id uuid, email text, full_name text, organisation text, linked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bov_hub_access() then raise exception 'Staff permission required'; end if;
  return query select m.user_id, u.email::text, public.bov_display_name(m.user_id), a.organisation, m.created_at
    from bov_project_members m join auth.users u on u.id = m.user_id
    left join bov_account_profiles a on a.user_id = m.user_id
    where m.project_id = p_project order by m.created_at;
end;
$$;

revoke all on function public.bov_is_project_member(uuid), public.bov_owns_conversation(uuid), public.bov_display_name(uuid),
  public.bov_start_conversation(text,text,text,uuid), public.bov_my_projects(), public.bov_my_conversations(), public.bov_mark_read(uuid),
  public.bov_staff_inbox(text), public.bov_staff_start_conversation(text,text,text,uuid), public.bov_set_conversation_status(uuid,text),
  public.bov_link_client(uuid,text), public.bov_unlink_client(uuid,uuid), public.bov_project_clients(uuid) from public, anon;
grant execute on function public.bov_is_project_member(uuid), public.bov_owns_conversation(uuid),
  public.bov_start_conversation(text,text,text,uuid), public.bov_my_projects(), public.bov_my_conversations(), public.bov_mark_read(uuid),
  public.bov_staff_inbox(text), public.bov_staff_start_conversation(text,text,text,uuid), public.bov_set_conversation_status(uuid,text),
  public.bov_link_client(uuid,text), public.bov_unlink_client(uuid,uuid), public.bov_project_clients(uuid) to authenticated;

-- ---------- live updates ----------
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.bov_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.bov_conversations; exception when duplicate_object then null; end;
  end if;
end
$rt$;

commit;
