-- AdSpotX partners + rewards on shared Zonic Supabase (adspot_* prefix).
-- Idempotent. Soft-session / client also falls back to localStorage if missing.

create table if not exists public.adspot_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  outlet_type text not null default 'newspaper',
  website text,
  contact_email text,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.adspot_partner_integrations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null unique references public.adspot_partners(id) on delete cascade,
  adspot_linked boolean not null default false,
  api_key text,
  webhook_url text,
  embed_config jsonb,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adspot_partner_integrations_linked_idx
  on public.adspot_partner_integrations (adspot_linked)
  where adspot_linked = true;

create table if not exists public.adspot_ad_rewards (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.adspot_ads(id) on delete cascade,
  type text not null default 'general' check (type in ('wildcard', 'general')),
  title text not null,
  description text not null default '',
  reward_value_text text not null default '',
  discount_code text,
  max_claims integer,
  claims_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists adspot_ad_rewards_ad_idx on public.adspot_ad_rewards (ad_id);

create table if not exists public.adspot_reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.adspot_ad_rewards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redemption_code text not null,
  claimed_at timestamptz not null default now(),
  unique (reward_id, user_id)
);
create index if not exists adspot_reward_claims_user_idx on public.adspot_reward_claims (user_id);

-- Richer reviewer profile fields (Profile page / deep analytics)
alter table public.adspot_reviewer_profiles
  add column if not exists display_name text,
  add column if not exists city text,
  add column if not exists education_level text,
  add column if not exists income_band text,
  add column if not exists occupation_sector text,
  add column if not exists device_type text,
  add column if not exists marital_status text,
  add column if not exists interests text[];

alter table public.adspot_review_sessions
  add column if not exists comment text;

alter table public.adspot_partners enable row level security;
alter table public.adspot_partner_integrations enable row level security;
alter table public.adspot_ad_rewards enable row level security;
alter table public.adspot_reward_claims enable row level security;

drop policy if exists adspot_partners_read on public.adspot_partners;
create policy adspot_partners_read on public.adspot_partners for select using (true);

drop policy if exists adspot_partners_admin on public.adspot_partners;
create policy adspot_partners_admin on public.adspot_partners for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

drop policy if exists adspot_partner_integrations_read on public.adspot_partner_integrations;
create policy adspot_partner_integrations_read on public.adspot_partner_integrations for select using (true);

drop policy if exists adspot_partner_integrations_admin on public.adspot_partner_integrations;
create policy adspot_partner_integrations_admin on public.adspot_partner_integrations for all
  using (public.adspot_is_admin()) with check (public.adspot_is_admin());

drop policy if exists adspot_ad_rewards_select on public.adspot_ad_rewards;
create policy adspot_ad_rewards_select on public.adspot_ad_rewards for select using (
  is_active = true or public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_ads a
    join public.adspot_brands b on b.id = a.brand_id
    where a.id = ad_id and b.user_id = auth.uid()
  )
);

drop policy if exists adspot_ad_rewards_write on public.adspot_ad_rewards;
create policy adspot_ad_rewards_write on public.adspot_ad_rewards for all using (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_ads a
    join public.adspot_brands b on b.id = a.brand_id
    where a.id = ad_id and b.user_id = auth.uid()
  )
) with check (
  public.adspot_is_admin()
  or exists (
    select 1 from public.adspot_ads a
    join public.adspot_brands b on b.id = a.brand_id
    where a.id = ad_id and b.user_id = auth.uid()
  )
);

drop policy if exists adspot_reward_claims_own on public.adspot_reward_claims;
create policy adspot_reward_claims_own on public.adspot_reward_claims for all
  using (user_id = auth.uid() or public.adspot_is_admin())
  with check (user_id = auth.uid() or public.adspot_is_admin());

grant select, insert, update, delete on public.adspot_partners to authenticated;
grant select, insert, update, delete on public.adspot_partner_integrations to authenticated;
grant select, insert, update, delete on public.adspot_ad_rewards to authenticated;
grant select, insert, update, delete on public.adspot_reward_claims to authenticated;
grant select on public.adspot_partners to anon;
grant select on public.adspot_partner_integrations to anon;

-- Seed audit / demo partner used by partner portal IntegrateAdSpotButton
insert into public.adspot_partners (id, name, outlet_type, website, contact_email, region)
values (
  '00000000-0000-4000-8000-000000000001',
  'Audit Daily (demo)',
  'newspaper',
  'https://audit.example',
  'partners@audit.example',
  'Lagos'
)
on conflict (id) do nothing;

insert into public.adspot_partner_integrations (partner_id, adspot_linked)
values ('00000000-0000-4000-8000-000000000001', false)
on conflict (partner_id) do nothing;

-- Storage bucket for brand uploads (public read)
insert into storage.buckets (id, name, public)
values ('adspot-assets', 'adspot-assets', true)
on conflict (id) do update set public = true;

drop policy if exists adspot_assets_public_read on storage.objects;
create policy adspot_assets_public_read on storage.objects for select
  using (bucket_id = 'adspot-assets');

drop policy if exists adspot_assets_auth_write on storage.objects;
create policy adspot_assets_auth_write on storage.objects for insert
  with check (bucket_id = 'adspot-assets' and auth.role() = 'authenticated');

drop policy if exists adspot_assets_auth_update on storage.objects;
create policy adspot_assets_auth_update on storage.objects for update
  using (bucket_id = 'adspot-assets' and auth.role() = 'authenticated');
