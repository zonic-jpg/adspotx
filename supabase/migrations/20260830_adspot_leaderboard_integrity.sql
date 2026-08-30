-- Leaderboard integrity (Supabase/adspot_* schema).
--
-- One eligibility rule everywhere (reviewer, not suspended/revoked, not a .demo
-- account, complete demographic profile), ranks computed AFTER filtering with a
-- deterministic tiebreak (so they're contiguous and stable), clean snapshots
-- (delete-then-write, no accumulation), and a finalize step for weekly close.
--
-- Weeks run Monday→Monday in Africa/Lagos (WAT, UTC+1) so the boundary never
-- drifts with the DB session timezone.

-- ── Ranked eligible reviewers for a window ───────────────────────────────────
create or replace function public.adspot_leaderboard_week(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int default 10
)
returns table (
  user_id uuid,
  username text,
  points_total bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select pl.user_id,
           pr.username,
           coalesce(sum(pl.amount), 0)::bigint as points_total,
           min(pl.created_at)                  as first_earned_at
    from public.adspot_points_ledger pl
    join public.adspot_profiles pr          on pr.id = pl.user_id
    join public.adspot_reviewer_profiles rp on rp.user_id = pl.user_id
    where pl.created_at >= p_start
      and pl.created_at <  p_end
      and pl.amount > 0
      and pr.role = 'reviewer'
      and pr.suspended = false
      and coalesce(pr.approval_status, 'approved') <> 'revoked'
      and pr.email not like '%.demo'
      and rp.gender is not null
      and rp.age_band is not null
      and rp.state is not null
      and rp.employment_status is not null
    group by pl.user_id, pr.username
  )
  select user_id,
         username,
         points_total,
         row_number() over (
           order by points_total desc, first_earned_at asc, user_id asc
         ) as rank
  from eligible
  order by rank
  limit case when p_limit is null or p_limit <= 0 then null else p_limit end;
$$;

-- ── A single user's true standing (even outside the top N) ───────────────────
create or replace function public.adspot_leaderboard_user_rank(
  p_user  uuid,
  p_start timestamptz,
  p_end   timestamptz
)
returns table (rank bigint, points_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.rank, w.points_total
  from public.adspot_leaderboard_week(p_start, p_end, null) w
  where w.user_id = p_user;
$$;

-- ── Finalize a week: write the definitive snapshot (delete-then-insert) ───────
create or replace function public.adspot_leaderboard_finalize(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start   timestamptz := (p_week_start::timestamp       at time zone 'Africa/Lagos');
  v_end     timestamptz := ((p_week_start + 7)::timestamp  at time zone 'Africa/Lagos');
  v_entries jsonb;
begin
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'rank',     w.rank,
               'userId',   w.user_id,
               'username', w.username,
               'points',   w.points_total
             ) order by w.rank
           ),
           '[]'::jsonb
         )
    into v_entries
  from public.adspot_leaderboard_week(v_start, v_end, 100) w;

  delete from public.adspot_leaderboard_snapshots where week_start = p_week_start;
  insert into public.adspot_leaderboard_snapshots (week_start, entries)
  values (p_week_start, v_entries);

  return jsonb_array_length(v_entries);
end;
$$;

grant execute on function public.adspot_leaderboard_week(timestamptz, timestamptz, int)      to authenticated, service_role;
grant execute on function public.adspot_leaderboard_user_rank(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.adspot_leaderboard_finalize(date)                            to service_role;

-- ── Weekly finalize via pg_cron (Mon 00:05, finalizes the week just ended) ───
-- Skipped cleanly if pg_cron isn't enabled on this project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'adspot-leaderboard-finalize',
      '5 0 * * 1',
      $cron$ select public.adspot_leaderboard_finalize((date_trunc('week', current_date)::date - 7)) $cron$
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
