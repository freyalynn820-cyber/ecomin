-- ============================================================
-- Eco Mining · Supabase setup
--
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
-- ============================================================

-- ---------- 1. profiles table ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  first_name      text,
  last_name       text,
  role            text not null default 'user',
  status          text not null default 'active'
                    check (status in ('active', 'unverified', 'banned')),
  mining_power_th numeric not null default 0,
  balance_btc     numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_email_idx  on public.profiles (email);
create index if not exists profiles_role_idx   on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);


-- ---------- 2. is_admin() helper ----------
-- Reads role from the JWT's app_metadata claim (set by Supabase Auth).
-- app_metadata is server-controlled (not editable from the browser),
-- so this is a real authorization check.
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;


-- ---------- 3. Row Level Security ----------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self  on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_self  on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

-- A user can read their own row.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (auth.uid() = id);

-- An admin can read every row.
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

-- A user can update their own profile (e.g. first_name / last_name).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- An admin can update any profile.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- An admin can delete a profile (the auth.users row stays — delete that
-- separately via Supabase dashboard or admin API if needed).
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.is_admin());


-- ---------- 4. Auto-create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_app_meta_data  ->> 'role', 'user'),
    case when new.email_confirmed_at is null then 'unverified' else 'active' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------- 5. Sync profile when auth.users changes ----------
-- Keeps profiles.role in sync when an admin runs an UPDATE on raw_app_meta_data,
-- and flips status from 'unverified' → 'active' when an email gets confirmed.
create or replace function public.handle_user_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (old.raw_app_meta_data ->> 'role') is distinct from (new.raw_app_meta_data ->> 'role') then
    update public.profiles
       set role = coalesce(new.raw_app_meta_data ->> 'role', 'user'),
           updated_at = now()
     where id = new.id;
  end if;

  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
       set status = 'active', updated_at = now()
     where id = new.id and status = 'unverified';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_update();


-- ---------- 6. Backfill profiles for existing users ----------
insert into public.profiles (id, email, first_name, last_name, role, status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'first_name', ''),
  coalesce(u.raw_user_meta_data ->> 'last_name', ''),
  coalesce(u.raw_app_meta_data  ->> 'role', 'user'),
  case when u.email_confirmed_at is null then 'unverified' else 'active' end
from auth.users u
on conflict (id) do nothing;
