-- ============================================================
-- Core Hash · Link deposits to orders
--
-- Run in Supabase → SQL Editor. Safe to re-run (idempotent).
-- Requires db/deposits.sql and db/orders-withdrawals.sql to have run
-- already so the referenced tables exist.
-- ============================================================

-- Add nullable FK so a deposit row can point at the order it pays for.
alter table public.deposits
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists deposits_order_idx on public.deposits (order_id);


-- Replace the user-insert RLS policy so a user can only attach an
-- order_id that belongs to *their* own pending order. Anyone can still
-- create a generic deposit by leaving order_id null.
drop policy if exists deposits_insert_self on public.deposits;

create policy deposits_insert_self on public.deposits
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and amount_btc is null
    and confirmed_at is null
    and confirmed_by is null
    and (
      order_id is null
      or exists (
        select 1 from public.orders o
        where o.id = order_id
          and o.user_id = auth.uid()
      )
    )
  );
