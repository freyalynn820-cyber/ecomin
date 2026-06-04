-- ============================================================
-- Core Hash · Admin email notifications
--
-- Wires Postgres triggers to a Supabase Edge Function ("notify-admin")
-- which actually sends the email via Gmail SMTP. The function URL +
-- shared secret live here as Postgres GUCs so we don't redeploy SQL
-- when they change.
--
-- BEFORE running this file:
--   1. Deploy supabase/functions/notify-admin/index.ts
--   2. Edit the two constants inside notify_admin() in step 1 below
--      (fn_url + secret) to match your project + WEBHOOK_SECRET.
--   3. Make sure the `pg_net` extension is enabled (Database →
--      Extensions → search "pg_net" → Enable).
-- ============================================================

-- ---------- 1. notify_admin(event, subject, lines[]) ----------
-- Single entry point all triggers call. Fire-and-forget; failures are
-- swallowed so a bad SMTP run doesn't break the parent INSERT.
--
-- ⚠️ Before running this file, replace the two literals below:
--   - FN_URL: the URL of your deployed Edge Function
--     ('https://<your-project-ref>.supabase.co/functions/v1/notify-admin')
--   - SECRET: the same random string you set as WEBHOOK_SECRET on the
--     Edge Function (e.g. `supabase secrets set WEBHOOK_SECRET=…`)
create or replace function public.notify_admin(
  event text,
  subject text,
  lines text[]
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  fn_url constant text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-admin';
  secret constant text := 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';
begin
  if fn_url like 'https://YOUR-PROJECT-REF%' or secret = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING' then
    -- Not configured yet — silently skip so signups don't fail.
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := jsonb_build_object(
      'event',   event,
      'subject', subject,
      'lines',   to_jsonb(lines)
    )
  );
exception when others then
  -- never block the parent transaction on a notification failure
  return;
end;
$$;


-- ---------- 2. Triggers per event ----------

-- 2a) New user signup ------------------------------------------------
create or replace function public.notify_on_signup()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify_admin(
    'signup',
    '[Core Hash] New user signup',
    array[
      'A new user has just signed up.',
      '',
      'Email: ' || coalesce(new.email, '(unknown)'),
      'User ID: ' || new.id::text
    ]
  );
  return new;
end;
$$;

drop trigger if exists notify_on_user_signup on auth.users;
create trigger notify_on_user_signup
  after insert on auth.users
  for each row execute function public.notify_on_signup();


-- 2b) New deposit ----------------------------------------------------
create or replace function public.notify_on_deposit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare email text;
begin
  select p.email into email from public.profiles p where p.id = new.user_id;
  perform public.notify_admin(
    'deposit',
    '[Core Hash] New deposit submitted',
    array[
      'A user has submitted a new deposit.',
      '',
      'User: ' || coalesce(email, new.user_id::text),
      'Asset: ' || new.asset,
      'Amount: ' || new.amount::text,
      'To address: ' || new.to_address,
      'Tx hash: ' || new.tx_hash,
      '',
      'Review it in the admin panel: https://corehash.cc/admin/'
    ]
  );
  return new;
end;
$$;

drop trigger if exists notify_on_deposit_insert on public.deposits;
create trigger notify_on_deposit_insert
  after insert on public.deposits
  for each row execute function public.notify_on_deposit();


-- 2c) New withdrawal -------------------------------------------------
create or replace function public.notify_on_withdrawal()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare email text;
begin
  select p.email into email from public.profiles p where p.id = new.user_id;
  perform public.notify_admin(
    'withdrawal',
    '[Core Hash] New withdrawal request',
    array[
      'A user has requested a withdrawal.',
      '',
      'User: ' || coalesce(email, new.user_id::text),
      'Amount: ' || new.amount_btc::text || ' BTC',
      'To address: ' || new.to_address,
      '',
      'Approve or reject at https://corehash.cc/admin/'
    ]
  );
  return new;
end;
$$;

drop trigger if exists notify_on_withdrawal_insert on public.withdrawals;
create trigger notify_on_withdrawal_insert
  after insert on public.withdrawals
  for each row execute function public.notify_on_withdrawal();


-- 2d) New order ------------------------------------------------------
create or replace function public.notify_on_order()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare email text;
begin
  select p.email into email from public.profiles p where p.id = new.user_id;
  perform public.notify_admin(
    'order',
    '[Core Hash] New ' || new.product_type || ' order',
    array[
      'A user has placed a store order.',
      '',
      'User: ' || coalesce(email, new.user_id::text),
      'Product: ' || new.product_name,
      'Type: ' || new.product_type,
      'Price: $' || new.price_usd::text,
      '',
      'Fulfill at https://corehash.cc/admin/'
    ]
  );
  return new;
end;
$$;

drop trigger if exists notify_on_order_insert on public.orders;
create trigger notify_on_order_insert
  after insert on public.orders
  for each row execute function public.notify_on_order();


-- 2e) New chat message from a user ----------------------------------
create or replace function public.notify_on_chat()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare email text;
begin
  -- only notify on user-sent messages, not admin replies
  if new.from_admin then return new; end if;
  select p.email into email from public.profiles p where p.id = new.user_id;
  perform public.notify_admin(
    'chat',
    '[Core Hash] New chat message',
    array[
      'A user has sent a chat message.',
      '',
      'User: ' || coalesce(email, new.user_id::text),
      'Message: ' || new.body,
      '',
      'Reply at https://corehash.cc/admin/ → Chat'
    ]
  );
  return new;
end;
$$;

drop trigger if exists notify_on_chat_insert on public.chat_messages;
create trigger notify_on_chat_insert
  after insert on public.chat_messages
  for each row execute function public.notify_on_chat();
