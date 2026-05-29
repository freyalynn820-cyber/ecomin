-- ============================================================
-- Core Hash · Withdrawals + Orders module
--
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent). Depends on db/setup.sql (profiles +
-- is_admin) and db/deposits.sql (the pattern this mirrors).
-- ============================================================


-- ---------- 1. withdrawals ----------
-- A user-initiated cashout request. amount_btc is what gets debited from
-- profiles.balance_btc when an admin approves. tx_hash is filled in by the
-- admin after broadcasting the on-chain transfer (optional).
create table if not exists public.withdrawals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  asset            text not null default 'BTC' check (asset in ('BTC','ETH','USDT_ERC20','USDT_TRC20')),
  network          text not null,
  amount_btc       numeric not null check (amount_btc > 0),
  to_address       text not null,
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
  tx_hash          text,
  rejection_reason text,
  processed_at     timestamptz,
  processed_by     uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists withdrawals_user_idx    on public.withdrawals (user_id);
create index if not exists withdrawals_status_idx  on public.withdrawals (status);
create index if not exists withdrawals_created_idx on public.withdrawals (created_at desc);


-- ---------- 2. orders ----------
-- Captures user purchase intent across the three store surfaces:
--   product_type = 'cloud'      → buy-cloud.html contract
--   product_type = 'asic_buy'   → buy-asics.html unit purchase
--   product_type = 'asic_rent'  → rent-asics.html hosted-rental
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  product_type      text not null check (product_type in ('cloud','asic_buy','asic_rent')),
  product_id        text not null,
  product_name      text not null,
  price_usd         numeric not null check (price_usd >= 0),
  term_months       int,
  units             int not null default 1 check (units > 0),
  site              text,
  status            text not null default 'pending'
                      check (status in ('pending','fulfilled','cancelled')),
  cancellation_reason text,
  fulfilled_at      timestamptz,
  fulfilled_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_user_idx    on public.orders (user_id);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_type_idx    on public.orders (product_type);
create index if not exists orders_created_idx on public.orders (created_at desc);


-- ---------- 3. RLS ----------
alter table public.withdrawals enable row level security;
alter table public.orders      enable row level security;

drop policy if exists withdrawals_select_self  on public.withdrawals;
drop policy if exists withdrawals_select_admin on public.withdrawals;
drop policy if exists withdrawals_insert_self  on public.withdrawals;
drop policy if exists withdrawals_update_admin on public.withdrawals;

create policy withdrawals_select_self on public.withdrawals
  for select to authenticated using (auth.uid() = user_id);

create policy withdrawals_select_admin on public.withdrawals
  for select to authenticated using (public.is_admin());

-- User can request own withdrawal in pending state, no admin metadata pre-set.
create policy withdrawals_insert_self on public.withdrawals
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and processed_at is null
    and processed_by is null
    and tx_hash is null
  );

create policy withdrawals_update_admin on public.withdrawals
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


drop policy if exists orders_select_self  on public.orders;
drop policy if exists orders_select_admin on public.orders;
drop policy if exists orders_insert_self  on public.orders;
drop policy if exists orders_update_admin on public.orders;

create policy orders_select_self on public.orders
  for select to authenticated using (auth.uid() = user_id);

create policy orders_select_admin on public.orders
  for select to authenticated using (public.is_admin());

-- User can place own order in pending state with no admin metadata.
create policy orders_insert_self on public.orders
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and fulfilled_at is null
    and fulfilled_by is null
  );

create policy orders_update_admin on public.orders
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------- 4. Debit balance on withdrawal approval ----------
-- BEFORE-update trigger. When status flips pending → approved, debit
-- balance_btc. Throws if the user doesn't have enough or amount_btc is
-- invalid. Idempotent: only fires on the actual transition.
create or replace function public.debit_on_withdrawal_approve()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare current_balance numeric;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    if new.amount_btc is null or new.amount_btc <= 0 then
      raise exception 'amount_btc must be > 0 to approve a withdrawal';
    end if;

    select balance_btc into current_balance
      from public.profiles where id = new.user_id for update;

    if current_balance is null then
      raise exception 'user profile not found';
    end if;
    if current_balance < new.amount_btc then
      raise exception 'insufficient balance: have %, need %', current_balance, new.amount_btc;
    end if;

    update public.profiles
       set balance_btc = balance_btc - new.amount_btc,
           updated_at  = now()
     where id = new.user_id;

    new.processed_at := coalesce(new.processed_at, now());
    new.processed_by := coalesce(new.processed_by, auth.uid());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_withdrawal_approve on public.withdrawals;
create trigger on_withdrawal_approve
  before update on public.withdrawals
  for each row execute function public.debit_on_withdrawal_approve();


-- ---------- 5. Order timestamping ----------
-- BEFORE-update trigger to stamp fulfilled_at/by when admin fulfills.
create or replace function public.stamp_order_fulfilled()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'fulfilled' and (old.status is distinct from 'fulfilled') then
    new.fulfilled_at := coalesce(new.fulfilled_at, now());
    new.fulfilled_by := coalesce(new.fulfilled_by, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_order_fulfilled on public.orders;
create trigger on_order_fulfilled
  before update on public.orders
  for each row execute function public.stamp_order_fulfilled();
