-- AdSpot auth on shared Zonic Supabase (myyangax project bnfbgqtdwyiockkxvapp).
-- MUST NOT replace MyYanga public.profiles / handle_new_user.
-- Creates adspot_* tables + separate trigger from raw_user_meta_data.

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.adspot_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null,
  role text not null default 'reviewer'
    check (role in ('reviewer', 'brand', 'admin', 'super_admin')),
  suspended boolean not null default false,
  approval_status text check (approval_status in ('approved', 'pending', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists adspot_profiles_username_uidx on public.adspot_profiles (username);
create index if not exists adspot_profiles_role_idx on public.adspot_profiles (role);
create index if not exists adspot_profiles_email_idx on public.adspot_profiles (email);

create table if not exists public.adspot_brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  website text,
  logo_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists adspot_brands_user_uidx on public.adspot_brands (user_id);

create table if not exists public.adspot_reviewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gender text,
  age_band text,
  state text,
  employment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists adspot_reviewer_profiles_user_uidx on public.adspot_reviewer_profiles (user_id);

-- ── Non-recursive RLS helpers (AdSpot-only) ─────────────────────────────────
create or replace function public.adspot_current_role()
returns text language sql stable security definer
set search_path = public set row_security = off as $$
  select role from public.adspot_profiles where id = auth.uid();
$$;

create or replace function public.adspot_is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.adspot_profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and suspended = false
      and coalesce(approval_status, 'approved') = 'approved'
  );
$$;

create or replace function public.adspot_is_super_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.adspot_profiles
    where id = auth.uid() and role = 'super_admin' and suspended = false
  );
$$;

-- ── Signup trigger (does NOT replace MyYanga handle_new_user) ───────────────
create or replace function public.adspot_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_username text;
  v_company text;
  v_email text;
  v_approval text := 'approved';
  base_uname text;
  suffix text;
begin
  v_email := lower(coalesce(new.email, ''));

  v_role := lower(coalesce(
    nullif(meta->>'role', ''),
    nullif(meta->>'user_role', ''),
    'reviewer'
  ));
  if v_role not in ('reviewer', 'brand', 'admin', 'super_admin') then
    v_role := 'reviewer';
  end if;

  if v_email = 'oadeagbo@gmail.com' then
    v_role := 'super_admin';
    v_approval := 'approved';
  end if;

  if v_role in ('reviewer', 'brand') then
    v_approval := 'approved';
  end if;

  base_uname := coalesce(
    nullif(trim(meta->>'username'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'user'
  );
  base_uname := left(regexp_replace(base_uname, '[^a-zA-Z0-9._+-]', '', 'g'), 20);
  if base_uname = '' then base_uname := 'user'; end if;
  v_username := base_uname;
  suffix := substr(replace(new.id::text, '-', ''), 1, 6);
  if exists (select 1 from public.adspot_profiles p where p.username = v_username and p.id <> new.id) then
    v_username := left(base_uname, 13) || '_' || suffix;
  end if;

  v_company := coalesce(
    nullif(trim(meta->>'company_name'), ''),
    nullif(trim(meta->>'companyName'), ''),
    v_username,
    'Brand'
  );

  insert into public.adspot_profiles (id, email, username, role, approval_status, suspended)
  values (new.id, v_email, v_username, v_role, v_approval, false)
  on conflict (id) do update set
    email = excluded.email,
    username = case
      when public.adspot_profiles.username is null or public.adspot_profiles.username = '' then excluded.username
      else public.adspot_profiles.username
    end,
    role = case
      when lower(public.adspot_profiles.email) = 'oadeagbo@gmail.com' then 'super_admin'
      when public.adspot_profiles.role in ('admin', 'super_admin') then public.adspot_profiles.role
      else excluded.role
    end,
    approval_status = case
      when lower(public.adspot_profiles.email) = 'oadeagbo@gmail.com' then 'approved'
      when public.adspot_profiles.role in ('reviewer', 'brand') then 'approved'
      when excluded.role in ('reviewer', 'brand') then 'approved'
      else coalesce(public.adspot_profiles.approval_status, excluded.approval_status)
    end,
    suspended = false,
    updated_at = now();

  if v_role = 'reviewer' then
    insert into public.adspot_reviewer_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  if v_role = 'brand' then
    insert into public.adspot_brands (user_id, company_name)
    values (new.id, v_company)
    on conflict (user_id) do update
      set company_name = coalesce(nullif(excluded.company_name, ''), public.adspot_brands.company_name);
  end if;

  return new;
exception when others then
  raise warning 'adspot_handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists adspot_on_auth_user_created on auth.users;
create trigger adspot_on_auth_user_created
  after insert on auth.users
  for each row execute function public.adspot_handle_new_user();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.adspot_profiles enable row level security;
alter table public.adspot_brands enable row level security;
alter table public.adspot_reviewer_profiles enable row level security;

drop policy if exists adspot_profiles_select_own on public.adspot_profiles;
create policy adspot_profiles_select_own on public.adspot_profiles for select
  using (id = auth.uid() or public.adspot_is_admin());

drop policy if exists adspot_profiles_update_own on public.adspot_profiles;
create policy adspot_profiles_update_own on public.adspot_profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists adspot_profiles_admin_all on public.adspot_profiles;
create policy adspot_profiles_admin_all on public.adspot_profiles for all
  using (public.adspot_is_super_admin()) with check (public.adspot_is_super_admin());

drop policy if exists adspot_brands_own on public.adspot_brands;
create policy adspot_brands_own on public.adspot_brands for all
  using (user_id = auth.uid() or public.adspot_is_admin())
  with check (user_id = auth.uid() or public.adspot_is_admin());

drop policy if exists adspot_reviewer_profiles_own on public.adspot_reviewer_profiles;
create policy adspot_reviewer_profiles_own on public.adspot_reviewer_profiles for all
  using (user_id = auth.uid() or public.adspot_is_admin())
  with check (user_id = auth.uid() or public.adspot_is_admin());

-- Owner always in
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
where lower(email) = 'oadeagbo@gmail.com';

insert into public.adspot_profiles (id, email, username, role, approval_status, suspended)
select id, email, 'oadeagbo', 'super_admin', 'approved', false
from auth.users
where lower(email) = 'oadeagbo@gmail.com'
on conflict (id) do update set
  role = 'super_admin',
  approval_status = 'approved',
  suspended = false,
  email = excluded.email,
  username = coalesce(public.adspot_profiles.username, excluded.username);

update public.adspot_profiles
set approval_status = 'approved'
where role in ('reviewer', 'brand')
  and coalesce(approval_status, 'pending') = 'pending';
