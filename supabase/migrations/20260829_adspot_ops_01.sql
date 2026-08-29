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
