-- AdSpot operational schema on shared Zonic Supabase.
-- Uses adspot_* prefixes to avoid MyYanga public.ads / profiles recursion.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT).

-- ── display name for dual brand+reviewer identity ───────────────────────────
alter table public.adspot_reviewer_profiles
  add column if not exists display_name text;

-- ── Core ops tables ─────────────────────────────────────────────────────────
create table if not exists public.adspot_ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.adspot_brands(id) on delete cascade,
  title text not null,
  description text,
  asset_url text not null default 'https://adspotx.netlify.app/placeholder-ad.jpg',
  asset_type text not null default 'image',
  min_watch_seconds integer not null default 15,
  point_reward integer not null default 10,
  multiplier_factor numeric(3,1) not null default 1.0,
  proverb_question text,
  proverb_answer text,
  proverb_bonus_points integer not null default 5,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists adspot_ads_brand_idx on public.adspot_ads (brand_id);
create index if not exists adspot_ads_status_idx on public.adspot_ads (status);

create table if not exists public.adspot_questions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.adspot_ads(id) on delete cascade,
  sort_order integer not null default 0,
  question_type text not null default 'single_choice',
  question_text text not null,
  options jsonb,
  created_at timestamptz not null default now()
);
create index if not exists adspot_questions_ad_idx on public.adspot_questions (ad_id);

create table if not exists public.adspot_review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ad_id uuid not null references public.adspot_ads(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned', 'revoked')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  watch_seconds integer,
  points_awarded integer default 0
);
create index if not exists adspot_review_sessions_user_idx on public.adspot_review_sessions (user_id);
create index if not exists adspot_review_sessions_ad_idx on public.adspot_review_sessions (ad_id);

create table if not exists public.adspot_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  source text not null default 'review',
  description text,
  session_id uuid references public.adspot_review_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists adspot_points_ledger_user_idx on public.adspot_points_ledger (user_id);
create index if not exists adspot_points_ledger_created_idx on public.adspot_points_ledger (created_at desc);

create table if not exists public.adspot_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null,
  amount_ngn numeric(12,2),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adspot_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_ngn numeric(12,2) not null default 0,
  impressions integer not null default 1000,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.adspot_events_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists adspot_events_log_created_idx on public.adspot_events_log (created_at desc);

create table if not exists public.adspot_platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.adspot_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ── RLS (adspot helpers only — never MyYanga is_admin) ──────────────────────
alter table public.adspot_ads enable row level security;
alter table public.adspot_questions enable row level security;
alter table public.adspot_review_sessions enable row level security;
alter table public.adspot_points_ledger enable row level security;
alter table public.adspot_redemptions enable row level security;
alter table public.adspot_packages enable row level security;
alter table public.adspot_events_log enable row level security;
alter table public.adspot_platform_settings enable row level security;
alter table public.adspot_leaderboard_snapshots enable row level security;

drop policy if exists adspot_ads_select on public.adspot_ads;
create policy adspot_ads_select on public.adspot_ads for select using (
  status = 'active'
  or public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_brands b
    where b.id = brand_id and b.user_id = auth.uid()
  )
);

drop policy if exists adspot_ads_write on public.adspot_ads;
create policy adspot_ads_write on public.adspot_ads for all using (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_brands b
    where b.id = brand_id and b.user_id = auth.uid()
  )
) with check (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_brands b
    where b.id = brand_id and b.user_id = auth.uid()
  )
);

drop policy if exists adspot_questions_all on public.adspot_questions;
create policy adspot_questions_all on public.adspot_questions for all using (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_ads a
    join public.adspot_brands b on b.id = a.brand_id
    where a.id = ad_id and (b.user_id = auth.uid() or a.status = 'active')
  )
) with check (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_ads a
    join public.adspot_brands b on b.id = a.brand_id
    where a.id = ad_id and b.user_id = auth.uid()
  )
);

drop policy if exists adspot_sessions_own on public.adspot_review_sessions;
create policy adspot_sessions_own on public.adspot_review_sessions for all
  using (user_id = auth.uid() or public.adspot_is_admin())
  with check (user_id = auth.uid() or public.adspot_is_admin());

drop policy if exists adspot_points_own on public.adspot_points_ledger;
create policy adspot_points_own on public.adspot_points_ledger for select
  using (user_id = auth.uid() or public.adspot_is_admin());
drop policy if exists adspot_points_admin_write on public.adspot_points_ledger;
create policy adspot_points_admin_write on public.adspot_points_ledger for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());
drop policy if exists adspot_points_insert_own on public.adspot_points_ledger;
create policy adspot_points_insert_own on public.adspot_points_ledger for insert
  with check (user_id = auth.uid() or public.adspot_is_admin());

drop policy if exists adspot_redemptions_own on public.adspot_redemptions;
create policy adspot_redemptions_own on public.adspot_redemptions for all
  using (user_id = auth.uid() or public.adspot_is_admin())
  with check (user_id = auth.uid() or public.adspot_is_admin());

drop policy if exists adspot_packages_read on public.adspot_packages;
create policy adspot_packages_read on public.adspot_packages for select using (active = true or public.adspot_is_admin());
drop policy if exists adspot_packages_admin on public.adspot_packages;
create policy adspot_packages_admin on public.adspot_packages for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

drop policy if exists adspot_events_admin on public.adspot_events_log;
create policy adspot_events_admin on public.adspot_events_log for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

drop policy if exists adspot_settings_read on public.adspot_platform_settings;
create policy adspot_settings_read on public.adspot_platform_settings for select using (true);
drop policy if exists adspot_settings_admin on public.adspot_platform_settings;
create policy adspot_settings_admin on public.adspot_platform_settings for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

drop policy if exists adspot_lb_read on public.adspot_leaderboard_snapshots;
create policy adspot_lb_read on public.adspot_leaderboard_snapshots for select using (true);
drop policy if exists adspot_lb_admin on public.adspot_leaderboard_snapshots;
create policy adspot_lb_admin on public.adspot_leaderboard_snapshots for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

grant select, insert, update, delete on public.adspot_ads to authenticated;
grant select, insert, update, delete on public.adspot_questions to authenticated;
grant select, insert, update, delete on public.adspot_review_sessions to authenticated;
grant select, insert, update, delete on public.adspot_points_ledger to authenticated;
grant select, insert, update, delete on public.adspot_redemptions to authenticated;
grant select, insert, update, delete on public.adspot_packages to authenticated;
grant select, insert, update, delete on public.adspot_events_log to authenticated;
grant select, insert, update, delete on public.adspot_platform_settings to authenticated;
grant select, insert, update, delete on public.adspot_leaderboard_snapshots to authenticated;

-- Owner dual identity: brand ComNavig + reviewer display name
insert into public.adspot_brands (user_id, company_name, website)
select id, 'ComNavig', 'https://comnavig.com'
from auth.users where lower(email) = 'oadeagbo@gmail.com'
on conflict (user_id) do update
  set company_name = 'ComNavig', website = 'https://comnavig.com';

insert into public.adspot_reviewer_profiles (user_id, display_name, gender, age_band, state, employment_status)
select id, 'Femi Reviews', 'male', '35_44', 'Lagos', 'self_employed'
from auth.users where lower(email) = 'oadeagbo@gmail.com'
on conflict (user_id) do update
  set display_name = coalesce(nullif(public.adspot_reviewer_profiles.display_name, ''), 'Femi Reviews'),
      gender = coalesce(public.adspot_reviewer_profiles.gender, excluded.gender),
      age_band = coalesce(public.adspot_reviewer_profiles.age_band, excluded.age_band),
      state = coalesce(public.adspot_reviewer_profiles.state, excluded.state),
      updated_at = now();

-- Packages
insert into public.adspot_packages (name, description, price_ngn, impressions, active, sort_order)
select * from (values
  ('Starter Pulse', '1k focused reviews for a single campaign', 45000::numeric, 1000, true, 1),
  ('Growth Wave', '5k reviews with demographic filters', 180000::numeric, 5000, true, 2),
  ('Enterprise Maze', '20k reviews + AI insight pack', 650000::numeric, 20000, true, 3)
) as v(name, description, price_ngn, impressions, active, sort_order)
where not exists (select 1 from public.adspot_packages limit 1);

insert into public.adspot_platform_settings (key, value) values
  ('points_to_ngn', '0.5'::jsonb),
  ('min_redemption_points', '500'::jsonb),
  ('weekly_leaderboard_bonus', '5000'::jsonb)
on conflict (key) do nothing;
