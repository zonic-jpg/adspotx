/**
 * Netlify function: apply AdSpot ops schema + seed via Supabase Management API.
 * Auth: owner JWT (Supabase) OR x-adspot-migrate-key header matching MIGRATE_KEY env.
 * Env: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (default bnfbgqtdwyiockkxvapp)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "oadeagbo@gmail.com";
const REF = process.env.SUPABASE_PROJECT_REF || "bnfbgqtdwyiockkxvapp";
const SB_URL = process.env.VITE_SUPABASE_URL || "https://bnfbgqtdwyiockkxvapp.supabase.co";
const ANON = process.env.VITE_SUPABASE_ANON_KEY || "";

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, x-adspot-migrate-key",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function assertOwner(event) {
  const migrateKey = event.headers["x-adspot-migrate-key"] || event.headers["X-Adspot-Migrate-Key"];
  if (migrateKey && process.env.MIGRATE_KEY && migrateKey === process.env.MIGRATE_KEY) return true;

  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !ANON) return false;
  const jwt = auth.slice(7);
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) return false;
  const user = await r.json();
  return String(user.email || "").toLowerCase() === OWNER;
}

function loadSql() {
  return `-- AdSpot operational schema on shared Zonic Supabase.
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


-- ComNavig 20 campaigns + analytics volume (run AFTER ops schema migration)
-- Idempotent: deletes prior ComNavig seed ads tagged in description.

do $$
declare
  v_owner uuid;
  v_brand uuid;
  v_titles text[] := array[
    'Navigate the AI Maze — Enterprise Brief',
    'Vendor-Neutral AI Strategy Workshop',
    'Share Your AI Challenge',
    'AI Value Realization Series',
    'Board-Ready AI Governance Pack',
    'Global Knowledge Alliances Spotlight',
    'Independent by Design — ComNavig',
    'From Pilot to Production: AI ROI',
    'ICT Modernization for African Enterprises',
    'AI Risk & Compliance Readiness',
    'Data Foundation for Generative AI',
    'Executive AI Immersion Day',
    'Cloud + AI Operating Model',
    'Customer Experience Reinvention with AI',
    'Supply Chain Intelligence Playbook',
    'Finance Ops Automation Briefing',
    'Talent & Change for AI Adoption',
    'Security Architecture for AI Systems',
    'Partner Ecosystem Advantage',
    'ComNavig Track Record Highlights'
  ];
  v_descs text[] := array[
    'Help enterprise leaders cut through vendor noise and choose an AI path that creates durable value.',
    'A hands-on workshop for CIOs mapping use-cases without locking into a single vendor stack.',
    'Invite decision-makers to share their toughest AI challenge with independent advisers.',
    'Short series on turning AI experiments into measurable P&L outcomes.',
    'Framework boards use to oversee AI risk, ethics, and investment priorities.',
    'How ComNavig''s global expert network accelerates delivery without bias.',
    'Why independence matters when every hyperscaler sells the same story.',
    'Case-led creative on moving beyond pilots into production value.',
    'Modernize core ICT while preparing the organization for AI at scale.',
    'Practical controls for regulated industries adopting generative AI.',
    'Clean data, clear ownership — the unglamorous work behind AI wins.',
    'One-day immersion for CXO teams under pressure to show AI progress.',
    'Operating model patterns that keep cloud and AI spend under control.',
    'Reinvent CX journeys with AI that customers actually trust.',
    'Visibility and prediction across complex African supply networks.',
    'Automate finance ops without creating black-box risk.',
    'Change management that makes AI stick with frontline teams.',
    'Threat models and architecture patterns for AI-enabled systems.',
    'How alliances amplify delivery capacity for ambitious programs.',
    'Selected outcomes from ComNavig advisory engagements.'
  ];
  i int;
  ad_id uuid;
  reviewer_ids uuid[];
  rid uuid;
begin
  select id into v_owner from auth.users where lower(email) = 'oadeagbo@gmail.com' limit 1;
  if v_owner is null then
    raise notice 'owner missing';
    return;
  end if;

  insert into public.adspot_brands (user_id, company_name, website)
  values (v_owner, 'ComNavig', 'https://comnavig.com')
  on conflict (user_id) do update
    set company_name = 'ComNavig', website = 'https://comnavig.com'
  returning id into v_brand;

  select id into v_brand from public.adspot_brands where user_id = v_owner;

  delete from public.adspot_ads
  where brand_id = v_brand and description like '%[comnavig-seed]%';

  for i in 1..20 loop
    insert into public.adspot_ads (
      brand_id, title, description, asset_url, asset_type,
      min_watch_seconds, point_reward, multiplier_factor, status,
      proverb_question, proverb_answer, proverb_bonus_points
    ) values (
      v_brand,
      v_titles[i],
      v_descs[i] || ' [comnavig-seed]',
      'https://adspotx.netlify.app/hero-demo.mp4',
      'video',
      12 + (i % 8),
      8 + (i % 7),
      1.0,
      case when i <= 16 then 'active' when i <= 18 then 'paused' else 'draft' end,
      'What makes ComNavig unique?',
      'vendor neutrality',
      5
    ) returning id into ad_id;

    insert into public.adspot_questions (ad_id, sort_order, question_type, question_text, options)
    values
      (ad_id, 0, 'single_choice', 'How clear was the value proposition?',
        '["Very clear","Somewhat clear","Unclear","Not relevant"]'::jsonb),
      (ad_id, 1, 'single_choice', 'Would you recommend this to a peer CIO?',
        '["Definitely","Probably","Unsure","No"]'::jsonb);
  end loop;

  -- Ensure owner reviewer display name + points for leaderboard
  insert into public.adspot_reviewer_profiles (user_id, display_name, gender, age_band, state, employment_status)
  values (v_owner, 'Femi Reviews', 'male', '35_44', 'Lagos', 'self_employed')
  on conflict (user_id) do update
    set display_name = 'Femi Reviews', updated_at = now();

  -- Mock reviewers (profiles only if auth users exist — skip creating auth users here)
  -- Seed points + sessions for owner and any existing reviewers
  insert into public.adspot_points_ledger (user_id, amount, source, description)
  select v_owner, 120 + (g * 17), 'review', 'Weekly review bonus seed'
  from generate_series(1, 12) g
  where not exists (
    select 1 from public.adspot_points_ledger
    where user_id = v_owner and description = 'Weekly review bonus seed'
    limit 1
  );

  -- Sessions volume against ComNavig ads
  insert into public.adspot_review_sessions (user_id, ad_id, status, started_at, completed_at, watch_seconds, points_awarded)
  select v_owner, a.id, 'completed',
         now() - ((row_number() over ()) || ' hours')::interval,
         now() - ((row_number() over ()) || ' hours')::interval + interval '2 minutes',
         20, a.point_reward
  from public.adspot_ads a
  where a.brand_id = v_brand and a.status = 'active'
  limit 40;

  -- Extra brands for admin lists (synthetic profile rows only if we have spare users — skip)
  insert into public.adspot_events_log (event_type, actor_id, payload)
  select 'admin.seed.complete', v_owner, jsonb_build_object('brand', 'ComNavig', 'ads', 20)
  where not exists (
    select 1 from public.adspot_events_log where event_type = 'admin.seed.complete' limit 1
  );

  insert into public.adspot_redemptions (user_id, points, amount_ngn, status)
  select v_owner, 500, 250, 'pending'
  where not exists (
    select 1 from public.adspot_redemptions where user_id = v_owner and status = 'pending' limit 1
  );

  insert into public.adspot_redemptions (user_id, points, amount_ngn, status)
  select v_owner, 1000, 500, 'paid'
  where not exists (
    select 1 from public.adspot_redemptions where user_id = v_owner and status = 'paid' limit 1
  );

  -- Leaderboard snapshot with display name
  insert into public.adspot_leaderboard_snapshots (week_start, entries)
  values (
    date_trunc('week', now())::date,
    jsonb_build_array(
      jsonb_build_object('rank', 1, 'userId', v_owner, 'username', 'Femi Reviews', 'points', 2400),
      jsonb_build_object('rank', 2, 'userId', null, 'username', 'AdaReviews', 'points', 2100),
      jsonb_build_object('rank', 3, 'userId', null, 'username', 'KemiWatches', 'points', 1800),
      jsonb_build_object('rank', 4, 'userId', null, 'username', 'TundeEarns', 'points', 1500),
      jsonb_build_object('rank', 5, 'userId', null, 'username', 'ChiomaPulse', 'points', 1200)
    )
  );

  -- Demo users volume in events for analytics charts
  insert into public.adspot_events_log (event_type, actor_id, payload, created_at)
  select
    (array['review.complete','brand.ad.create','admin.points.grant','admin.user.create'])[1 + (g % 4)],
    v_owner,
    jsonb_build_object('n', g),
    now() - (g || ' days')::interval
  from generate_series(1, 60) g;
end $$;
`;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return cors(204, {});
  if (event.httpMethod !== "POST") return cors(405, { error: "method_not_allowed" });

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return cors(503, { error: "missing_SUPABASE_ACCESS_TOKEN" });

  const ok = await assertOwner(event);
  if (!ok) return cors(403, { error: "forbidden", message: "Owner only" });

  let sql = loadSql();
  // Allow body.query override for seed-only follow-ups
  try {
    const body = JSON.parse(event.body || "{}");
    if (body.query && typeof body.query === "string" && body.query.length < 800000) {
      sql = body.query;
    }
  } catch {
    /* ignore */
  }
  if (!sql) return cors(500, { error: "sql_not_found" });

  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 2000) };
  }
  if (!res.ok) return cors(res.status, { error: "sql_failed", detail: parsed });
  return cors(200, { ok: true, result: parsed });
}
