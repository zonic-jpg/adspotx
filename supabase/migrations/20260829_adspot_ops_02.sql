
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
