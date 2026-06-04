-- ============================================================
-- Core Hash · Anonymous (visitor) chat support
--
-- Run AFTER db/chat.sql. Adds:
--   - visitor_id / visitor_name / visitor_email columns
--   - relaxes user_id NOT NULL (visitor threads have user_id=null)
--   - RLS policies that let unauthenticated visitors send + read
--     messages tagged with their own visitor_id
--
-- Trust model for anonymous threads: visitor_id is a random UUID
-- generated client-side and stored in localStorage. Anyone with the
-- UUID can read the thread, but 128-bit randomness makes guessing
-- another visitor's UUID effectively impossible.
-- ============================================================

alter table public.chat_messages alter column user_id drop not null;

alter table public.chat_messages add column if not exists visitor_id    text;
alter table public.chat_messages add column if not exists visitor_name  text;
alter table public.chat_messages add column if not exists visitor_email text;

-- Every message must belong to either an authenticated user or a visitor.
alter table public.chat_messages drop constraint if exists chat_messages_owner_check;
alter table public.chat_messages add constraint chat_messages_owner_check
  check (user_id is not null or visitor_id is not null);

create index if not exists chat_messages_visitor_idx
  on public.chat_messages (visitor_id, created_at);


-- ---------- Visitor-side RLS ----------
-- Anon role can SELECT any visitor-owned row (filtering happens client-
-- side by visitor_id; the UUID acts as a capability token).
drop policy if exists chat_select_visitor on public.chat_messages;
create policy chat_select_visitor on public.chat_messages
  for select to anon, authenticated
  using (user_id is null and visitor_id is not null);

-- Anon role can INSERT a message as a visitor.
drop policy if exists chat_insert_visitor on public.chat_messages;
create policy chat_insert_visitor on public.chat_messages
  for insert to anon, authenticated
  with check (
    user_id is null
    and visitor_id is not null
    and length(visitor_id) between 8 and 128
    and from_admin = false
    and read_by_user = true
    and read_by_admin = false
    and (sender_id is null)        -- visitors have no auth identity
  );

-- Anon role can UPDATE only the read_by_user flag on their thread.
drop policy if exists chat_update_visitor on public.chat_messages;
create policy chat_update_visitor on public.chat_messages
  for update to anon, authenticated
  using (user_id is null and visitor_id is not null)
  with check (user_id is null and visitor_id is not null);


-- ---------- Existing user-thread insert policy needs sender_id update ----------
-- Visitors leave sender_id null, so we must also re-allow null sender on
-- visitor inserts. The previous policy required auth.uid() = sender_id,
-- which would reject visitor inserts.
-- The chat_insert_user policy from db/chat.sql still applies to auth
-- users — no change needed there.

-- Allow sender_id to be NULL when it's a visitor message.
alter table public.chat_messages alter column sender_id drop not null;
