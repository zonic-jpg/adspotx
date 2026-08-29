-- AdSpot Supabase RLS — paste-ready migration
-- Run in Supabase SQL editor AFTER existing Drizzle tables exist (or alongside schema bootstrap).
-- Auth: Supabase auth.users + public.profiles (replaces legacy users.password_hash for runtime)

-- ── Profiles (auth extension) ───────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  role text not null default 'reviewer'
    check (role in ('reviewer', 'brand', 'admin', 'super_admin')),
  suspended boolean not null default false,
  approval_status text check (approval_status in ('approved', 'pending', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(email);

-- Auto-create bare profile on signup (register-user edge function sets role)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, role, approval_status)
  values (
    new.id,
    coalesce(new.email, ''),
    split_part(coalesce(new.email, new.id::text), '@', 1),
    'reviewer',
    'approved'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS helper functions ────────────────────────────────────────────────────
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and suspended = false
      and coalesce(approval_status, 'approved') = 'approved'
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and suspended = false
  );
$$;

create or replace function public.is_brand_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'brand' and suspended = false
  );
$$;

create or replace function public.is_reviewer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'reviewer' and suspended = false
  );
$$;

create or replace function public.owns_brand(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brands where id = bid and user_id = auth.uid());
$$;

-- ── Enable RLS on all tables ────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.reviewer_profiles enable row level security;
alter table public.ads enable row level security;
alter table public.questions enable row level security;
alter table public.review_sessions enable row level security;
alter table public.answers enable row level security;
alter table public.points_ledger enable row level security;
alter table public.redemptions enable row level security;
alter table public.leaderboard_snapshots enable row level security;
alter table public.ad_rewards enable row level security;
alter table public.reward_claims enable row level security;
alter table public.gift_catalog enable row level security;
alter table public.gift_grants enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.fraud_flags enable row level security;
alter table public.fraud_rules enable row level security;
alter table public.device_signals enable row level security;
alter table public.events_log enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_settings enable row level security;
alter table public.ad_packages enable row level security;
alter table public.network_partners enable row level security;
alter table public.partner_integrations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles for select
  using (public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── brands ──────────────────────────────────────────────────────────────────
drop policy if exists brands_select_own on public.brands;
create policy brands_select_own on public.brands for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists brands_insert_own on public.brands;
create policy brands_insert_own on public.brands for insert
  with check (user_id = auth.uid());

drop policy if exists brands_update_own on public.brands;
create policy brands_update_own on public.brands for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists brands_admin on public.brands;
create policy brands_admin on public.brands for all
  using (public.is_admin()) with check (public.is_admin());

-- ── reviewer_profiles ───────────────────────────────────────────────────────
drop policy if exists reviewer_profiles_own on public.reviewer_profiles;
create policy reviewer_profiles_own on public.reviewer_profiles for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── ads ─────────────────────────────────────────────────────────────────────
drop policy if exists ads_public_active on public.ads;
create policy ads_public_active on public.ads for select
  using (status = 'active' or public.is_admin() or public.owns_brand(brand_id));

drop policy if exists ads_brand_write on public.ads;
create policy ads_brand_write on public.ads for insert
  with check (public.owns_brand(brand_id) or public.is_admin());

drop policy if exists ads_brand_update on public.ads;
create policy ads_brand_update on public.ads for update
  using (public.owns_brand(brand_id) or public.is_admin())
  with check (public.owns_brand(brand_id) or public.is_admin());

drop policy if exists ads_brand_delete on public.ads;
create policy ads_brand_delete on public.ads for delete
  using (public.owns_brand(brand_id) or public.is_admin());

-- ── questions ─────────────────────────────────────────────────────────────────
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select using (true);

drop policy if exists questions_brand_write on public.questions;
create policy questions_brand_write on public.questions for all
  using (
    exists (select 1 from public.ads a join public.brands b on b.id = a.brand_id
            where a.id = ad_id and (b.user_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.ads a join public.brands b on b.id = a.brand_id
            where a.id = ad_id and (b.user_id = auth.uid() or public.is_admin()))
  );

-- ── review_sessions ───────────────────────────────────────────────────────────
drop policy if exists review_sessions_own on public.review_sessions;
create policy review_sessions_own on public.review_sessions for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.ads a join public.brands b on b.id = a.brand_id
               where a.id = ad_id and b.user_id = auth.uid())
  );

drop policy if exists review_sessions_insert on public.review_sessions;
create policy review_sessions_insert on public.review_sessions for insert
  with check (user_id = auth.uid() and public.is_reviewer());

-- Service role / edge functions bypass RLS for completion writes

-- ── answers ───────────────────────────────────────────────────────────────────
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select
  using (
    exists (select 1 from public.review_sessions rs where rs.id = review_session_id
            and (rs.user_id = auth.uid() or public.is_admin()))
    or exists (select 1 from public.review_sessions rs join public.ads a on a.id = rs.ad_id
               join public.brands b on b.id = a.brand_id
               where rs.id = review_session_id and b.user_id = auth.uid())
  );

-- ── points_ledger (append-only for users; admin read) ─────────────────────────
drop policy if exists points_ledger_own_read on public.points_ledger;
create policy points_ledger_own_read on public.points_ledger for select
  using (user_id = auth.uid() or public.is_admin());

-- Inserts only via service_role edge functions (no client insert policy)

-- ── redemptions ───────────────────────────────────────────────────────────────
drop policy if exists redemptions_own on public.redemptions;
create policy redemptions_own on public.redemptions for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists redemptions_insert on public.redemptions;
create policy redemptions_insert on public.redemptions for insert
  with check (user_id = auth.uid() and public.is_reviewer());

-- Status updates via edge function (admin)

-- ── leaderboard_snapshots ─────────────────────────────────────────────────────
drop policy if exists leaderboard_read on public.leaderboard_snapshots;
create policy leaderboard_read on public.leaderboard_snapshots for select
  using (auth.uid() is not null);

-- ── ad_rewards ────────────────────────────────────────────────────────────────
drop policy if exists ad_rewards_brand on public.ad_rewards;
create policy ad_rewards_brand on public.ad_rewards for all
  using (
    exists (select 1 from public.ads a join public.brands b on b.id = a.brand_id
            where a.id = ad_id and (b.user_id = auth.uid() or public.is_admin()))
  )
  with check (
    exists (select 1 from public.ads a join public.brands b on b.id = a.brand_id
            where a.id = ad_id and (b.user_id = auth.uid() or public.is_admin()))
  );

drop policy if exists ad_rewards_read on public.ad_rewards;
create policy ad_rewards_read on public.ad_rewards for select
  using (active = true or public.is_admin());

-- ── reward_claims ─────────────────────────────────────────────────────────────
drop policy if exists reward_claims_own on public.reward_claims;
create policy reward_claims_own on public.reward_claims for select
  using (user_id = auth.uid() or public.is_admin());

-- Claims via edge function only

-- ── gifts ─────────────────────────────────────────────────────────────────────
drop policy if exists gift_catalog_read on public.gift_catalog;
create policy gift_catalog_read on public.gift_catalog for select
  using (active = true or public.is_admin() or public.is_brand_user());

drop policy if exists gift_catalog_admin on public.gift_catalog;
create policy gift_catalog_admin on public.gift_catalog for all
  using (public.is_admin() or public.is_brand_user())
  with check (public.is_admin() or public.is_brand_user());

drop policy if exists gift_grants_own on public.gift_grants;
create policy gift_grants_own on public.gift_grants for select
  using (user_id = auth.uid() or public.is_admin());

-- ── referrals ─────────────────────────────────────────────────────────────────
drop policy if exists referral_codes_own on public.referral_codes;
create policy referral_codes_own on public.referral_codes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists referrals_own on public.referrals;
create policy referrals_own on public.referrals for select
  using (inviter_id = auth.uid() or invitee_id = auth.uid() or public.is_admin());

-- ── fraud ─────────────────────────────────────────────────────────────────────
drop policy if exists fraud_flags_admin on public.fraud_flags;
create policy fraud_flags_admin on public.fraud_flags for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists fraud_rules_admin on public.fraud_rules;
create policy fraud_rules_admin on public.fraud_rules for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists device_signals_admin on public.device_signals;
create policy device_signals_admin on public.device_signals for select
  using (public.is_admin());

-- ── events_log ────────────────────────────────────────────────────────────────
drop policy if exists events_log_admin on public.events_log;
create policy events_log_admin on public.events_log for select
  using (public.is_admin());

-- ── notifications ─────────────────────────────────────────────────────────────
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── platform_settings ─────────────────────────────────────────────────────────
drop policy if exists settings_read on public.platform_settings;
create policy settings_read on public.platform_settings for select
  using (true);

drop policy if exists settings_admin on public.platform_settings;
create policy settings_admin on public.platform_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ── ad_packages ───────────────────────────────────────────────────────────────
drop policy if exists packages_public on public.ad_packages;
create policy packages_public on public.ad_packages for select
  using (active = true or public.is_admin());

drop policy if exists packages_admin on public.ad_packages;
create policy packages_admin on public.ad_packages for all
  using (public.is_admin()) with check (public.is_admin());

-- ── partners (restrict public activate — admin only for writes) ───────────────
drop policy if exists partners_public_read on public.network_partners;
create policy partners_public_read on public.network_partners for select using (true);

drop policy if exists partners_admin on public.network_partners;
create policy partners_admin on public.network_partners for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists partner_integrations_admin on public.partner_integrations;
create policy partner_integrations_admin on public.partner_integrations for all
  using (public.is_admin()) with check (public.is_admin());

-- ── conversations / messages (future) ─────────────────────────────────────────
drop policy if exists conversations_participant on public.conversations;
create policy conversations_participant on public.conversations for all
  using (auth.uid() = any(participant_ids)) with check (auth.uid() = any(participant_ids));

drop policy if exists messages_participant on public.messages;
create policy messages_participant on public.messages for all
  using (
    exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids))
  )
  with check (
    exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids))
  );

-- ── Storage buckets (run separately in dashboard or via SQL) ─────────────────
-- insert into storage.buckets (id, name, public) values ('ad-assets', 'ad-assets', true);
-- create policy "brand upload" on storage.objects for insert with check (bucket_id = 'ad-assets' and public.is_brand_user());

-- Owner seed (run once after migration — set password via Supabase Auth dashboard):
-- oadeagbo@gmail.com → profiles.role = 'super_admin', approval_status = 'approved'
