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
