-- ============================================================
-- Core Hash · Deposits module
--
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent). Assumes db/setup.sql has been run first
-- (this depends on public.is_admin() and public.profiles).
-- ============================================================

-- ---------- 1. wallet_addresses ----------
-- Admin-curated pool of crypto addresses shown to users on the deposit page.
create table if not exists public.wallet_addresses (
  id         uuid primary key default gen_random_uuid(),
  asset      text not null check (asset in ('BTC','ETH','USDT_ERC20','USDT_TRC20')),
  network    text not null,
  address    text not null,
  label      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_addresses_asset_active_idx
  on public.wallet_addresses (asset, is_active);


-- ---------- 2. deposits ----------
-- User-submitted deposit records. amount is in the asset's own unit
-- (BTC, ETH, USDT). amount_btc is what the admin actually credits to
-- profiles.balance_btc when they confirm; null until confirmed.
create table if not exists public.deposits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  asset            text not null check (asset in ('BTC','ETH','USDT_ERC20','USDT_TRC20')),
  network          text not null,
  amount           numeric not null check (amount > 0),
  to_address       text not null,
  tx_hash          text not null,
  status           text not null default 'pending'
                     check (status in ('pending','confirmed','rejected')),
  amount_btc       numeric,
  rejection_reason text,
  confirmed_at     timestamptz,
  confirmed_by     uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists deposits_user_idx    on public.deposits (user_id);
create index if not exists deposits_status_idx  on public.deposits (status);
create index if not exists deposits_created_idx on public.deposits (created_at desc);


-- ---------- 3. RLS ----------
alter table public.wallet_addresses enable row level security;
alter table public.deposits         enable row level security;

drop policy if exists wallets_select_active on public.wallet_addresses;
drop policy if exists wallets_admin_all     on public.wallet_addresses;

-- Authenticated users can read active wallet addresses (needed by the
-- user-facing deposit form). Admins can read everything.
create policy wallets_select_active on public.wallet_addresses
  for select to authenticated
  using (is_active = true or public.is_admin());

-- Only admins can insert/update/delete addresses.
create policy wallets_admin_all on public.wallet_addresses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


drop policy if exists deposits_select_self  on public.deposits;
drop policy if exists deposits_select_admin on public.deposits;
drop policy if exists deposits_insert_self  on public.deposits;
drop policy if exists deposits_update_admin on public.deposits;

-- A user can see their own deposit history.
create policy deposits_select_self on public.deposits
  for select to authenticated
  using (auth.uid() = user_id);

-- Admins see every deposit.
create policy deposits_select_admin on public.deposits
  for select to authenticated
  using (public.is_admin());

-- A user can submit a deposit for themselves, in pending state, with no
-- credit amount or confirmation metadata pre-filled.
create policy deposits_insert_self on public.deposits
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and amount_btc is null
    and confirmed_at is null
    and confirmed_by is null
  );

-- Only admins can update a deposit (e.g. to confirm or reject).
create policy deposits_update_admin on public.deposits
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- 4. Auto-credit on confirmation ----------
-- When status transitions to 'confirmed', credit profiles.balance_btc by
-- amount_btc atomically, and stamp confirmed_at / confirmed_by if the
-- admin didn't pass them explicitly.
create or replace function public.credit_on_deposit_confirm()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    if new.amount_btc is null or new.amount_btc <= 0 then
      raise exception 'amount_btc must be set and > 0 to confirm a deposit';
    end if;

    update public.profiles
       set balance_btc = balance_btc + new.amount_btc,
           updated_at  = now()
     where id = new.user_id;

    new.confirmed_at := coalesce(new.confirmed_at, now());
    new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_deposit_confirm on public.deposits;
create trigger on_deposit_confirm
  before update on public.deposits
  for each row execute function public.credit_on_deposit_confirm();
