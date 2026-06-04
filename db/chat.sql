-- ============================================================
-- Core Hash · Live chat
--
-- One conversation per user: `user_id` is the thread owner (the
-- end-user); `sender_id` is whoever wrote the message (the user
-- themselves or an admin replying). `from_admin` lets the UI render
-- bubbles on the correct side without doing a role lookup per message.
--
-- Realtime: the publication line at the bottom turns on the websocket
-- feed so the widget can subscribe and receive new messages instantly.
-- ============================================================

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  from_admin      boolean not null default false,
  read_by_user    boolean not null default false,
  read_by_admin   boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx
  on public.chat_messages (user_id, created_at);

create index if not exists chat_messages_admin_unread_idx
  on public.chat_messages (user_id) where read_by_admin = false and from_admin = false;


-- ---------- RLS ----------
alter table public.chat_messages enable row level security;

drop policy if exists chat_select_self   on public.chat_messages;
drop policy if exists chat_select_admin  on public.chat_messages;
drop policy if exists chat_insert_user   on public.chat_messages;
drop policy if exists chat_insert_admin  on public.chat_messages;
drop policy if exists chat_update_user   on public.chat_messages;
drop policy if exists chat_update_admin  on public.chat_messages;

-- Users see only their own thread.
create policy chat_select_self on public.chat_messages
  for select to authenticated
  using (auth.uid() = user_id);

-- Admins see every thread.
create policy chat_select_admin on public.chat_messages
  for select to authenticated
  using (public.is_admin());

-- Users post messages into their own thread, as themselves.
create policy chat_insert_user on public.chat_messages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and auth.uid() = sender_id
    and from_admin = false
    and read_by_user = true     -- user has obviously read what they just sent
    and read_by_admin = false
  );

-- Admins reply into any user's thread, as themselves.
create policy chat_insert_admin on public.chat_messages
  for insert to authenticated
  with check (
    public.is_admin()
    and auth.uid() = sender_id
    and from_admin = true
    and read_by_admin = true    -- admin has obviously read what they just sent
    and read_by_user = false
  );

-- Users can flip read_by_user on their own thread (mark-as-read).
create policy chat_update_user on public.chat_messages
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can flip read_by_admin / edit anything for moderation.
create policy chat_update_admin on public.chat_messages
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- Realtime ----------
-- Wire the table into Supabase Realtime so subscribers receive INSERTs
-- on chat_messages instantly via the websocket. Guarded with a DO block
-- because `alter publication … add table` errors if the table is
-- already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end$$;
