-- Hotfix: stop profiles/is_admin RLS recursion (stack depth exceeded).
-- Run in Supabase SQL editor for project bnfbgqtdwyiockkxvapp.

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

-- Confirm owner Auth email (do NOT rewrite password hashes here — use Auth Admin /
-- /tmp/adspot-ensure-owner-auth.sh so GoTrue hashing stays correct).
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
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
