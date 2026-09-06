-- Owner JWT must count as admin for the approval queue and admin reads.
-- Client-side elevation was painting an admin UI while adspot_is_admin()
-- stayed false (missing/stale adspot_profiles row, or unconfirmed email
-- forcing a no-JWT soft session). Queue RPC then raised 400 and RLS
-- counts painted zeros. Homepage public_stats already saw the real rows.
--
-- Security: owner is recognized only from a valid Auth JWT email
-- (auth.jwt() / auth.uid()). Anon still cannot read the queue.

create or replace function public.adspot_jwt_is_owner()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select auth.uid() is not null
     and lower(coalesce(auth.jwt() ->> 'email', '')) = public.adspot_owner_email();
$$;

create or replace function public.adspot_is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.adspot_jwt_is_owner()
      or exists (
        select 1 from public.adspot_profiles
        where id = auth.uid()
          and role in ('admin', 'super_admin')
          and suspended = false
          and coalesce(approval_status, 'approved') = 'approved'
      );
$$;

create or replace function public.adspot_is_super_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.adspot_jwt_is_owner()
      or exists (
        select 1 from public.adspot_profiles
        where id = auth.uid()
          and role = 'super_admin'
          and suspended = false
      );
$$;

-- Same aggregates the landing page uses, plus admin-only totals.
-- Gated by JWT admin/owner — never an anon email-only hole.
create or replace function public.adspot_admin_stats()
returns jsonb language plpgsql stable security definer
set search_path = public set row_security = off as $$
begin
  if not public.adspot_is_admin() then
    raise exception 'Admin sign-in required to read admin stats';
  end if;
  return jsonb_build_object(
    'totalUsers', (select count(*) from public.adspot_profiles),
    'totalReviewers', (
      select count(*) from public.adspot_profiles
      where role = 'reviewer' and suspended = false
    ),
    'totalBrands', (select count(*) from public.adspot_brands),
    'totalAdmins', (
      select count(*) from public.adspot_profiles
      where role in ('admin', 'super_admin') and suspended = false
    ),
    'totalAds', (select count(*) from public.adspot_ads),
    'activeAds', (select count(*) from public.adspot_ads where status = 'active'),
    'totalCompletions', (
      select count(*) from public.adspot_review_sessions where status = 'completed'
    ),
    'totalAdsCompleted', (
      select count(*) from public.adspot_review_sessions where status = 'completed'
    ),
    'totalPointsIssued', (
      select coalesce(sum(amount), 0) from public.adspot_points_ledger where amount > 0
    ),
    'totalPointsAwarded', (
      select coalesce(sum(amount), 0) from public.adspot_points_ledger where amount > 0
    ),
    'pendingRedemptions', (
      select count(*) from public.adspot_redemptions where status = 'pending'
    ),
    'completedRedemptions', (
      select count(*) from public.adspot_redemptions where status in ('approved', 'paid', 'completed')
    ),
    'totalSessions', (
      select count(*) from public.adspot_review_sessions where status = 'completed'
    )
  );
end $$;

-- Owner Auth must produce a real JWT (unconfirmed email → soft session → queue 400).
update auth.users
set
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where lower(email) = public.adspot_owner_email();

insert into public.adspot_profiles (id, email, username, role, approval_status, suspended)
select
  u.id,
  lower(u.email),
  case
    when exists (
      select 1 from public.adspot_profiles p
      where p.username = 'oadeagbo' and p.id <> u.id
    ) then left('oadeagbo', 13) || '_' || substr(replace(u.id::text, '-', ''), 1, 6)
    else 'oadeagbo'
  end,
  'super_admin',
  'approved',
  false
from auth.users u
where lower(u.email) = public.adspot_owner_email()
on conflict (id) do update set
  role = 'super_admin',
  approval_status = 'approved',
  suspended = false,
  email = excluded.email,
  updated_at = now();

revoke all on function public.adspot_jwt_is_owner() from public, anon;
grant execute on function public.adspot_jwt_is_owner() to authenticated;
revoke all on function public.adspot_list_admin_access_requests(text) from public, anon;
grant execute on function public.adspot_list_admin_access_requests(text) to authenticated;
revoke all on function public.adspot_decide_admin_access(text, text, text) from public, anon;
grant execute on function public.adspot_decide_admin_access(text, text, text) to authenticated;
revoke all on function public.adspot_admin_stats() from public, anon;
grant execute on function public.adspot_admin_stats() to authenticated;
grant execute on function public.adspot_is_admin() to anon, authenticated;
grant execute on function public.adspot_is_super_admin() to anon, authenticated;
