-- ============================================================
-- Core Hash · Mining Vaults module
--
-- Run in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
-- Depends on db/setup.sql (profiles + is_admin).
--
-- A "vault" is a user-locked BTC position that earns interest at a
-- fixed APY. The user can close it at any time to return principal +
-- accrued interest back to profiles.balance_btc.
-- ============================================================

-- ---------- 1. vaults ----------
create table if not exists public.vaults (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  principal_btc  numeric not null check (principal_btc >= 0.001),
  apy            numeric not null default 0.083 check (apy > 0 and apy < 1),
  status         text not null default 'active' check (status in ('active','closed')),
  started_at     timestamptz not null default now(),
  closed_at      timestamptz,
  payout_btc     numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists vaults_user_idx    on public.vaults (user_id);
create index if not exists vaults_status_idx  on public.vaults (status);
create index if not exists vaults_created_idx on public.vaults (created_at desc);


-- ---------- 2. RLS ----------
alter table public.vaults enable row level security;

drop policy if exists vaults_select_self   on public.vaults;
drop policy if exists vaults_select_admin  on public.vaults;
drop policy if exists vaults_insert_self   on public.vaults;
drop policy if exists vaults_close_self    on public.vaults;
drop policy if exists vaults_admin_update  on public.vaults;

-- Users can see their own vaults.
create policy vaults_select_self on public.vaults
  for select to authenticated
  using (auth.uid() = user_id);

-- Admins can see all (for support).
create policy vaults_select_admin on public.vaults
  for select to authenticated
  using (public.is_admin());

-- Users can open a vault for themselves. status must be 'active' with
-- no close metadata pre-set. The debit-on-open trigger handles the
-- balance bookkeeping.
create policy vaults_insert_self on public.vaults
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'active'
    and closed_at is null
    and payout_btc is null
  );

-- A user can close their OWN vault by updating the status. The trigger
-- below computes the payout and credits balance_btc atomically.
create policy vaults_close_self on public.vaults
  for update to authenticated
  using (auth.uid() = user_id and status = 'active')
  with check (auth.uid() = user_id and status = 'closed');

-- Admins can update any vault (e.g. to refund / adjust).
create policy vaults_admin_update on public.vaults
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- 3. Debit balance on opening a vault ----------
-- BEFORE INSERT: subtract principal_btc from profiles.balance_btc.
-- Throws if the user can't afford it, which rolls back the insert.
create or replace function public.debit_on_vault_open()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare current_balance numeric;
begin
  select balance_btc into current_balance
    from public.profiles where id = new.user_id for update;

  if current_balance is null then
    raise exception 'user profile not found';
  end if;
  if current_balance < new.principal_btc then
    raise exception 'insufficient balance: have %, need %', current_balance, new.principal_btc;
  end if;

  update public.profiles
     set balance_btc = balance_btc - new.principal_btc,
         updated_at  = now()
   where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists on_vault_open on public.vaults;
create trigger on_vault_open
  before insert on public.vaults
  for each row execute function public.debit_on_vault_open();


-- ---------- 4. Credit balance on closing a vault ----------
-- BEFORE UPDATE: when status flips active → closed, compute payout =
-- principal × (1 + APY × elapsed_years) and credit it back. Idempotent:
-- only fires on the actual transition.
create or replace function public.credit_on_vault_close()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare elapsed_years numeric;
        computed_payout numeric;
begin
  if new.status = 'closed' and (old.status is distinct from 'closed') then
    elapsed_years := extract(epoch from (coalesce(new.closed_at, now()) - old.started_at)) / 31557600.0;
    computed_payout := round(old.principal_btc * (1 + old.apy * elapsed_years), 8);

    update public.profiles
       set balance_btc = balance_btc + computed_payout,
           updated_at  = now()
     where id = old.user_id;

    new.payout_btc := computed_payout;
    new.closed_at  := coalesce(new.closed_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_vault_close on public.vaults;
create trigger on_vault_close
  before update on public.vaults
  for each row execute function public.credit_on_vault_close();
