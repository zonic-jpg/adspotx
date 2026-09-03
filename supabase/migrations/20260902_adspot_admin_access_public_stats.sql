-- Server-backed ADMINTESTER approval queue, public landing stats, and the
-- storage bucket brand uploads write to.
--
-- Three defects share one cause: work that has to be visible across devices
-- was living either in the requester's own browser or behind RLS that anon
-- can never satisfy.
--
--   1. A pending admin request was only written to localStorage on the
--      tester's device, so the owner's queue — reading localStorage on a
--      different device — was structurally always empty.
--   2. The landing stats read adspot_profiles / adspot_brands /
--      adspot_review_sessions / adspot_points_ledger directly as anon. Those
--      policies require auth.uid() or adspot_is_admin(), so a visitor always
--      counted zero no matter how much real data existed.
--   3. Ad asset uploads target the `adspot-assets` bucket, which was never
--      created, so every brand upload failed with "Bucket not found".
--
-- The queue and the stats now go through security-definer RPCs, so neither
-- table needs to be readable by anon.

-- ── Owner identity ──────────────────────────────────────────────────────────

create or replace function public.adspot_owner_email()
returns text language sql stable set search_path = public as $$
  select lower(coalesce(
    (select value #>> '{}' from public.adspot_platform_settings where key = 'owner_email'),
    'oadeagbo@gmail.com'
  ));
$$;

-- ── Approval queue ──────────────────────────────────────────────────────────

create table if not exists public.adspot_admin_access_requests (
  id bigserial primary key,
  email text not null,
  identity text,
  app text not null default 'adspotx',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  note text
);

create unique index if not exists adspot_admin_access_requests_email_app
  on public.adspot_admin_access_requests (lower(email), app);

alter table public.adspot_admin_access_requests enable row level security;

-- Reads go through list_admin_access_requests(); this policy only backs
-- direct admin queries (e.g. SQL editor), never anon.
drop policy if exists adspot_admin_access_requests_admin_read
  on public.adspot_admin_access_requests;
create policy adspot_admin_access_requests_admin_read
  on public.adspot_admin_access_requests
  for select using (public.adspot_is_admin());

comment on table public.adspot_admin_access_requests is
  'Cross-device ADMINTESTER approval queue. Written via adspot_request_admin_access(), decided via adspot_decide_admin_access().';

-- Anyone may ask for access. Asking reveals nothing about the platform.
create or replace function public.adspot_request_admin_access(
  p_email text,
  p_identity text default null,
  p_app text default 'adspotx'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_app text := coalesce(nullif(trim(coalesce(p_app, '')), ''), 'adspotx');
  v_row public.adspot_admin_access_requests%rowtype;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid email address is required to request access';
  end if;
  if v_email = public.adspot_owner_email() then
    return jsonb_build_object('status', 'owner', 'email', v_email);
  end if;

  select * into v_row from public.adspot_admin_access_requests
   where lower(email) = v_email and app = v_app;

  if v_row.id is null then
    insert into public.adspot_admin_access_requests (email, identity, app)
    values (v_email, nullif(trim(coalesce(p_identity, '')), ''), v_app)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'email', v_row.email,
    'requested_at', v_row.requested_at
  );
end $$;

-- Lets a tester learn they were approved without exposing the table.
create or replace function public.adspot_admin_access_status(
  p_email text,
  p_app text default 'adspotx'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_app text := coalesce(nullif(trim(coalesce(p_app, '')), ''), 'adspotx');
  v_row public.adspot_admin_access_requests%rowtype;
begin
  if v_email = '' then
    return jsonb_build_object('status', 'none');
  end if;
  if v_email = public.adspot_owner_email() then
    return jsonb_build_object('status', 'owner', 'email', v_email);
  end if;

  select * into v_row from public.adspot_admin_access_requests
   where lower(email) = v_email and app = v_app;

  if v_row.id is null then
    return jsonb_build_object('status', 'none', 'email', v_email);
  end if;
  return jsonb_build_object(
    'status', v_row.status,
    'email', v_row.email,
    'requested_at', v_row.requested_at,
    'decided_at', v_row.decided_at
  );
end $$;

create or replace function public.adspot_list_admin_access_requests(
  p_app text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.adspot_is_admin() then
    raise exception 'Admin sign-in required to read the approval queue';
  end if;
  return jsonb_build_object(
    'pending', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc), '[]'::jsonb)
      from public.adspot_admin_access_requests r
      where r.status = 'pending' and (p_app is null or r.app = p_app)
    ),
    'approved', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.decided_at desc nulls last), '[]'::jsonb)
      from public.adspot_admin_access_requests r
      where r.status = 'approved' and (p_app is null or r.app = p_app)
    ),
    'revoked', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.decided_at desc nulls last), '[]'::jsonb)
      from public.adspot_admin_access_requests r
      where r.status = 'revoked' and (p_app is null or r.app = p_app)
    )
  );
end $$;

-- Approving also promotes any real adspot_profiles row for that email, so
-- "approved" means the tester can actually sign in and use admin reads.
create or replace function public.adspot_decide_admin_access(
  p_email text,
  p_decision text,
  p_app text default 'adspotx'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_app text := coalesce(nullif(trim(coalesce(p_app, '')), ''), 'adspotx');
  v_status text;
  v_row public.adspot_admin_access_requests%rowtype;
begin
  if not (public.adspot_is_super_admin()
          or lower(coalesce((select email from auth.users where id = auth.uid()), ''))
             = public.adspot_owner_email()) then
    raise exception 'Only the owner can approve or reject admin access';
  end if;
  if v_email = '' then
    raise exception 'A valid email address is required';
  end if;
  if v_email = public.adspot_owner_email() then
    raise exception 'The owner account cannot be changed here';
  end if;

  v_status := case lower(trim(coalesce(p_decision, '')))
    when 'approve' then 'approved'
    when 'approved' then 'approved'
    when 'reject' then 'revoked'
    when 'revoke' then 'revoked'
    when 'revoked' then 'revoked'
    when 'pending' then 'pending'
    else null
  end;
  if v_status is null then
    raise exception 'Decision must be approve, reject, or pending';
  end if;

  insert into public.adspot_admin_access_requests (email, app, status, decided_at, decided_by)
  values (v_email, v_app, v_status, now(), auth.uid())
  on conflict (lower(email), app) do update
    set status = excluded.status,
        decided_at = excluded.decided_at,
        decided_by = excluded.decided_by
  returning * into v_row;

  -- Keep the real profile in step so approval grants actual access.
  if v_status = 'approved' then
    update public.adspot_profiles
       set role = case when role in ('admin', 'super_admin') then role else 'admin' end,
           approval_status = 'approved',
           suspended = false,
           updated_at = now()
     where lower(email) = v_email;
  elsif v_status = 'revoked' then
    update public.adspot_profiles
       set approval_status = 'revoked',
           updated_at = now()
     where lower(email) = v_email;
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'email', v_row.email,
    'decided_at', v_row.decided_at
  );
end $$;

-- ── Public landing stats ────────────────────────────────────────────────────
--
-- Aggregates only. No row ever leaves this function, so anon may call it
-- without any of the underlying policies being relaxed.
create or replace function public.adspot_public_stats()
returns jsonb language sql stable security definer
set search_path = public set row_security = off as $$
  select jsonb_build_object(
    'totalReviewers', (
      select count(*) from public.adspot_profiles where role = 'reviewer' and suspended = false
    ),
    'totalBrands', (select count(*) from public.adspot_brands),
    'totalAdsCompleted', (
      select count(*) from public.adspot_review_sessions where status = 'completed'
    ),
    'totalPointsAwarded', (
      select coalesce(sum(amount), 0) from public.adspot_points_ledger where amount > 0
    ),
    'activeAds', (select count(*) from public.adspot_ads where status = 'active'),
    'avgPointsPerAd', (
      select coalesce(round(avg(point_reward))::int, 0) from public.adspot_ads where status = 'active'
    )
  );
$$;

revoke all on function public.adspot_decide_admin_access(text, text, text) from anon;
grant execute on function public.adspot_request_admin_access(text, text, text) to anon, authenticated;
grant execute on function public.adspot_admin_access_status(text, text) to anon, authenticated;
grant execute on function public.adspot_list_admin_access_requests(text) to authenticated;
grant execute on function public.adspot_decide_admin_access(text, text, text) to authenticated;
grant execute on function public.adspot_public_stats() to anon, authenticated;
grant execute on function public.adspot_owner_email() to anon, authenticated;

-- ── Ad asset storage limits ─────────────────────────────────────────────────
--
-- The bucket and its read/write policies are created by
-- 20260830_adspot_partners_rewards.sql; that file simply was never in the
-- deploy list, which is why every brand upload failed with "Bucket not
-- found". Creating it here too would duplicate those policies, so this only
-- sets the ceiling the Create Campaign form advertises (100 MB, image or
-- video) and adds the delete policy the original file omitted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adspot-assets',
  'adspot-assets',
  true,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
        'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 104857600,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists adspot_assets_owner_delete on storage.objects;
create policy adspot_assets_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'adspot-assets' and (owner = auth.uid() or public.adspot_is_admin()));
