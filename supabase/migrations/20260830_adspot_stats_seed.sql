-- Stats seed for the Supabase adspot_* schema.
--
-- Populates reviewers (with complete demographic profiles → leaderboard- and
-- analytics-eligible), brands, ads, questions, ~800 completed reviews with
-- points, redemptions, and an events feed — spread over the last 6 weeks so the
-- Admin and Brand Analytics dashboards, trends, and leaderboard history all have
-- data. Deterministic (setseed) and idempotent (skips if already applied).
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) AFTER the
-- schema + trigger migrations. Demo emails use @adspotdemo.ng (not `.demo`), so
-- they count as real users in stats but are still clearly demo.

do $$
declare
  v_rev      uuid[];
  v_ad       uuid[];
  v_reward   int[];
  v_mult     numeric[];
  v_minwatch int[];
  v_bonus    int[];
begin
  if exists (select 1 from public.adspot_brands where company_name = 'NaijaTel Communications') then
    raise notice 'adspot stats seed already applied — skipping';
    return;
  end if;

  perform setseed(0.4242);

  -- ── Reviewers: auth user + profile + complete demographic profile ──────────
  insert into auth.users (id, email)
  select ('a5e70000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         'reviewer' || i || '@adspotdemo.ng'
  from generate_series(1, 45) i
  on conflict (id) do nothing;

  insert into public.adspot_profiles (id, email, username, role, approval_status)
  select ('a5e70000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         'reviewer' || i || '@adspotdemo.ng', 'reviewer' || i, 'reviewer', 'approved'
  from generate_series(1, 45) i
  on conflict (id) do update set role = 'reviewer', approval_status = 'approved';

  insert into public.adspot_reviewer_profiles (user_id, display_name, gender, age_band, state, employment_status)
  select ('a5e70000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         'Reviewer ' || i,
         (array['male','female'])[1 + floor(random()*2)::int],
         (array['18_24','25_34','35_44','45_54','55_plus'])[1 + floor(random()*5)::int],
         (array['Lagos','FCT – Abuja','Rivers','Kano','Oyo','Enugu'])[1 + floor(random()*6)::int],
         (array['employed','self_employed','student','unemployed'])[1 + floor(random()*4)::int]
  from generate_series(1, 45) i
  on conflict (user_id) do nothing;

  -- ── Brands: auth user + profile + brand row ────────────────────────────────
  insert into auth.users (id, email)
  select ('b5a40000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         'brand' || i || '@adspotdemo.ng'
  from generate_series(1, 4) i
  on conflict (id) do nothing;

  insert into public.adspot_profiles (id, email, username, role, approval_status)
  select ('b5a40000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         'brand' || i || '@adspotdemo.ng', 'brand' || i, 'brand', 'approved'
  from generate_series(1, 4) i
  on conflict (id) do update set role = 'brand', approval_status = 'approved';

  insert into public.adspot_brands (id, user_id, company_name, website)
  select ('b5a4b000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         ('b5a40000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
         (array['NaijaTel Communications','Savanna Foods','Kano Cement Co.','MarketPlace NG'])[i],
         'https://example.test/brand' || i
  from generate_series(1, 4) i
  on conflict (user_id) do nothing;

  -- ── Ads (3 per brand) + questions (3 per ad) ───────────────────────────────
  insert into public.adspot_ads
    (id, brand_id, title, description, asset_url, asset_type, min_watch_seconds,
     point_reward, multiplier_factor, proverb_question, proverb_answer, proverb_bonus_points, status)
  select ('ad000000-0000-4000-8000-' || lpad(to_hex(b*10 + n), 12, '0'))::uuid,
         ('b5a4b000-0000-4000-8000-' || lpad(to_hex(b), 12, '0'))::uuid,
         'Campaign ' || b || '-' || n, 'Demo campaign', 'https://storage.example/ad.mp4', 'video',
         (array[10,15,20,30])[1 + floor(random()*4)::int],
         (array[10,20,30,50])[1 + floor(random()*4)::int],
         (array[1.0,1.0,1.5,2.0])[1 + floor(random()*4)::int],
         'A single tree cannot make a ___', 'forest', 5,
         (array['active','active','active','paused','draft'])[1 + floor(random()*5)::int]
  from generate_series(1, 4) b cross join generate_series(1, 3) n;

  insert into public.adspot_questions (ad_id, sort_order, question_type, question_text, options)
  select a.id, q.n,
         (array['rating','single_choice','yes_no'])[q.n],
         (array['Rate this ad','What stood out most?','Would you consider this brand?'])[q.n],
         (array[null, '["Product","Story","Visuals","Offer"]', '["yes","no"]']::jsonb[])[q.n]
  from public.adspot_ads a
  cross join generate_series(1, 3) q(n)
  where a.title like 'Campaign %';

  -- ── Gather reviewer + active-ad pools for per-row random assignment ────────
  select array_agg(id) into v_rev
  from public.adspot_profiles where role = 'reviewer' and email like '%@adspotdemo.ng';

  select array_agg(id order by id), array_agg(point_reward order by id),
         array_agg(multiplier_factor order by id), array_agg(min_watch_seconds order by id),
         array_agg(proverb_bonus_points order by id)
    into v_ad, v_reward, v_mult, v_minwatch, v_bonus
  from public.adspot_ads where status = 'active';

  -- ── ~800 completed reviews + matching points ledger (6-week spread) ────────
  -- Per-row pseudo-random via hashtext(row index) — a non-correlated random()
  -- would be folded by the planner to one value across all rows.
  with new_sessions as (
    insert into public.adspot_review_sessions
      (user_id, ad_id, status, started_at, completed_at, watch_seconds, points_awarded)
    select v_rev[1 + (abs(hashtext(g::text || 'r')) % array_length(v_rev, 1))],
           v_ad[x.ai],
           'completed',
           x.dt - interval '45 seconds',
           x.dt,
           v_minwatch[x.ai] + (abs(hashtext(g::text || 'w')) % 20),
           round(v_reward[x.ai] * v_mult[x.ai])::int
             + case when (abs(hashtext(g::text || 'p')) % 10) < 6 then v_bonus[x.ai] else 0 end
    from generate_series(1, 800) g
    cross join lateral (
      select 1 + (abs(hashtext(g::text || 'a')) % array_length(v_ad, 1))                as ai,
             now() - ((abs(hashtext(g::text || 'd')) % 42) || ' days')::interval        as dt
    ) x
    returning user_id, points_awarded, completed_at
  )
  insert into public.adspot_points_ledger (user_id, amount, source, description, created_at)
  select user_id, points_awarded, 'review', 'Completed review', completed_at
  from new_sessions
  where points_awarded > 0;

  -- ── Redemptions + matching deductions ──────────────────────────────────────
  insert into public.adspot_redemptions (user_id, points, amount_ngn, status, created_at, updated_at)
  select v_rev[1 + (abs(hashtext(g::text || 'rr')) % array_length(v_rev, 1))],
         x.p, (x.p * 2.0)::numeric, x.s, x.dt, x.dt
  from generate_series(1, 30) g
  cross join lateral (
    select (array[500,1000,1500,2000,3000])[1 + (abs(hashtext(g::text || 'rp')) % 5)]                as p,
           (array['paid','paid','approved','pending','rejected'])[1 + (abs(hashtext(g::text || 'rs')) % 5)] as s,
           now() - ((abs(hashtext(g::text || 'rd')) % 40) || ' days')::interval                       as dt
  ) x;

  insert into public.adspot_points_ledger (user_id, amount, source, description, created_at)
  select user_id, -points, 'redemption', 'Redemption', created_at
  from public.adspot_redemptions where status = 'paid';

  -- ── Events feed (one per completed review) ─────────────────────────────────
  insert into public.adspot_events_log (event_type, actor_id, payload, created_at)
  select 'review_submitted', user_id, jsonb_build_object('adId', ad_id, 'points', points_awarded), completed_at
  from public.adspot_review_sessions
  where status = 'completed' and completed_at is not null;

  raise notice 'adspot stats seed applied.';
end $$;
