-- AdSpot smooth auth: non-recursive RLS helpers + signup trigger from raw_user_meta_data.
-- Prefer this over sole reliance on register-user edge function.
-- Project: bnfbgqtdwyiockkxvapp
-- Paste in Supabase SQL editor if CLI migration is not applied.

-- ── Non-recursive RLS helpers (row_security=off prevents profiles policy stack overflow) ──
create or replace function public.current_role()
returns text language sql stable security definer
set search_path = public set row_security = off as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and suspended = false
      and coalesce(approval_status, 'approved') = 'approved'
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and suspended = false
  );
$$;

create or replace function public.is_brand_user()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'brand' and suspended = false
  );
$$;

create or replace function public.is_reviewer()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'reviewer' and suspended = false
  );
$$;

create or replace function public.owns_brand(bid uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.brands where id = bid and user_id = auth.uid());
$$;

-- ── Signup trigger: profiles + reviewer_profiles / brands from metadata ──────
create or replace function public.handle_new_user()
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

  -- Owner always super_admin + approved
  if v_email = 'oadeagbo@gmail.com' then
    v_role := 'super_admin';
    v_approval := 'approved';
  end if;

  -- Normal reviewer/brand: never pending. Pending is only for shared-admin password path (app-side).
  if v_role in ('reviewer', 'brand') then
    v_approval := 'approved';
  end if;

  base_uname := coalesce(
    nullif(trim(meta->>'username'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'user'
  );
  -- sanitize length for unique username
  base_uname := left(regexp_replace(base_uname, '[^a-zA-Z0-9._+-]', '', 'g'), 20);
  if base_uname = '' then base_uname := 'user'; end if;
  v_username := base_uname;
  suffix := substr(replace(new.id::text, '-', ''), 1, 6);
  if exists (select 1 from public.profiles p where p.username = v_username and p.id <> new.id) then
    v_username := left(base_uname, 13) || '_' || suffix;
  end if;

  v_company := coalesce(
    nullif(trim(meta->>'company_name'), ''),
    nullif(trim(meta->>'companyName'), ''),
    v_username,
    'Brand'
  );

  insert into public.profiles (id, email, username, role, approval_status, suspended)
  values (new.id, v_email, v_username, v_role, v_approval, false)
  on conflict (id) do update set
    email = excluded.email,
    username = case
      when public.profiles.username is null or public.profiles.username = '' then excluded.username
      else public.profiles.username
    end,
    role = case
      when lower(public.profiles.email) = 'oadeagbo@gmail.com' then 'super_admin'
      when public.profiles.role in ('admin', 'super_admin') then public.profiles.role
      else excluded.role
    end,
    approval_status = case
      when lower(public.profiles.email) = 'oadeagbo@gmail.com' then 'approved'
      when public.profiles.role in ('reviewer', 'brand') then 'approved'
      when excluded.role in ('reviewer', 'brand') then 'approved'
      else coalesce(public.profiles.approval_status, excluded.approval_status)
    end,
    suspended = false,
    updated_at = now();

  if v_role = 'reviewer' then
    insert into public.reviewer_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  if v_role = 'brand' then
    if not exists (select 1 from public.brands b where b.user_id = new.id) then
      insert into public.brands (user_id, company_name) values (new.id, v_company);
    end if;
  end if;

  return new;
exception when others then
  -- Never block Auth signup if enrichment fails; edge function / client can retry.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ensure profiles policies stay simple (own row OR security-definer is_admin)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select
  using (public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Owner always in
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
where lower(email) = 'oadeagbo@gmail.com';

insert into public.profiles (id, email, username, role, approval_status, suspended)
select id, email, 'oadeagbo', 'super_admin', 'approved', false
from auth.users
where lower(email) = 'oadeagbo@gmail.com'
on conflict (id) do update set
  role = 'super_admin',
  approval_status = 'approved',
  suspended = false,
  email = excluded.email,
  username = coalesce(public.profiles.username, excluded.username);

-- Heal any reviewer/brand accidentally left pending
update public.profiles
set approval_status = 'approved'
where role in ('reviewer', 'brand')
  and coalesce(approval_status, 'pending') = 'pending';
