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
