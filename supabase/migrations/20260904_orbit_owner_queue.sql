-- Owner orbit password can read/decide the approval queue without a JWT.
-- Not an email-only hole: p_password must match the shared orbit password.

create or replace function public.adspot_orbit_owner_ok(p_email text, p_password text)
returns boolean language sql stable set search_path = public as $$
  select lower(trim(coalesce(p_email, ''))) = public.adspot_owner_email()
     and lower(trim(coalesce(p_password, ''))) = 'zonicgate2026';
$$;

create or replace function public.adspot_list_admin_access_requests_orbit(
  p_email text,
  p_password text,
  p_app text default 'adspotx'
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.adspot_orbit_owner_ok(p_email, p_password) then
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

create or replace function public.adspot_decide_admin_access_orbit(
  p_email text,
  p_decision text,
  p_app text default 'adspotx',
  p_owner_email text default null,
  p_password text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_app text := coalesce(nullif(trim(coalesce(p_app, '')), ''), 'adspotx');
  v_status text;
  v_row public.adspot_admin_access_requests%rowtype;
begin
  if not public.adspot_orbit_owner_ok(p_owner_email, p_password) then
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

  insert into public.adspot_admin_access_requests (email, app, status, decided_at)
  values (v_email, v_app, v_status, now())
  on conflict (lower(email), app) do update
    set status = excluded.status,
        decided_at = excluded.decided_at
  returning * into v_row;

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

revoke all on function public.adspot_orbit_owner_ok(text, text) from public, anon;
grant execute on function public.adspot_orbit_owner_ok(text, text) to authenticated;
grant execute on function public.adspot_list_admin_access_requests_orbit(text, text, text) to anon, authenticated;
grant execute on function public.adspot_decide_admin_access_orbit(text, text, text, text, text) to anon, authenticated;
