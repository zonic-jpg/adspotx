-- ComNavig 20 campaigns + analytics volume (run AFTER ops schema)
do $$
declare
  v_owner uuid;
  v_brand uuid;
  titles text[] := array[
    'Navigate the AI Maze — Enterprise Brief','Vendor-Neutral AI Strategy Workshop',
    'Share Your AI Challenge','AI Value Realization Series','Board-Ready AI Governance Pack',
    'Global Knowledge Alliances Spotlight','Independent by Design — ComNavig',
    'From Pilot to Production: AI ROI','ICT Modernization for African Enterprises',
    'AI Risk & Compliance Readiness','Data Foundation for Generative AI',
    'Executive AI Immersion Day','Cloud + AI Operating Model',
    'Customer Experience Reinvention with AI','Supply Chain Intelligence Playbook',
    'Finance Ops Automation Briefing','Talent & Change for AI Adoption',
    'Security Architecture for AI Systems','Partner Ecosystem Advantage',
    'ComNavig Track Record Highlights'
  ];
  i int; ad_id uuid;
begin
  select id into v_owner from auth.users where lower(email)='oadeagbo@gmail.com' limit 1;
  if v_owner is null then raise notice 'owner missing'; return; end if;

  insert into public.adspot_brands (user_id, company_name, website)
  values (v_owner, 'ComNavig', 'https://comnavig.com')
  on conflict (user_id) do update
    set company_name='ComNavig', website='https://comnavig.com'
  returning id into v_brand;
  select id into v_brand from public.adspot_brands where user_id=v_owner;

  delete from public.adspot_ads
  where brand_id=v_brand and description like '%[comnavig-seed]%';

  for i in 1..20 loop
    insert into public.adspot_ads (
      brand_id, title, description, asset_url, asset_type,
      min_watch_seconds, point_reward, multiplier_factor, status,
      proverb_question, proverb_answer, proverb_bonus_points
    ) values (
      v_brand, titles[i],
      'Independent ICT/AI advisory. Navigate the AI Maze. [comnavig-seed]',
      'https://adspotx.netlify.app/hero-demo.mp4', 'video',
      12+(i%8), 8+(i%7), 1.0,
      case when i<=16 then 'active' when i<=18 then 'paused' else 'draft' end,
      'What makes ComNavig unique?', 'vendor neutrality', 5
    ) returning id into ad_id;

    insert into public.adspot_questions (ad_id, sort_order, question_type, question_text, options)
    values
      (ad_id, 0, 'single_choice', 'How clear was the value proposition?',
       '["Very clear","Somewhat clear","Unclear","Not relevant"]'::jsonb),
      (ad_id, 1, 'single_choice', 'Would you recommend this to a peer CIO?',
       '["Definitely","Probably","Unsure","No"]'::jsonb);
  end loop;

  insert into public.adspot_reviewer_profiles (user_id, display_name, gender, age_band, state, employment_status)
  values (v_owner, 'Femi Reviews', 'male', '35_44', 'Lagos', 'self_employed')
  on conflict (user_id) do update set display_name='Femi Reviews', updated_at=now();

  insert into public.adspot_points_ledger (user_id, amount, source, description)
  select v_owner, 120+(g*17), 'review', 'Weekly review bonus seed'
  from generate_series(1,12) g
  where not exists (
    select 1 from public.adspot_points_ledger
    where user_id=v_owner and description='Weekly review bonus seed' limit 1
  );

  insert into public.adspot_review_sessions (user_id, ad_id, status, started_at, completed_at, watch_seconds, points_awarded)
  select v_owner, a.id, 'completed',
         now()-((row_number() over ())||' hours')::interval,
         now()-((row_number() over ())||' hours')::interval + interval '2 minutes',
         20, a.point_reward
  from public.adspot_ads a
  where a.brand_id=v_brand and a.status='active' limit 40;

  insert into public.adspot_events_log (event_type, actor_id, payload)
  select 'admin.seed.complete', v_owner, jsonb_build_object('brand','ComNavig','ads',20)
  where not exists (select 1 from public.adspot_events_log where event_type='admin.seed.complete' limit 1);

  insert into public.adspot_redemptions (user_id, points, amount_ngn, status)
  select v_owner, 500, 250, 'pending'
  where not exists (select 1 from public.adspot_redemptions where user_id=v_owner and status='pending' limit 1);

  insert into public.adspot_redemptions (user_id, points, amount_ngn, status)
  select v_owner, 1000, 500, 'paid'
  where not exists (select 1 from public.adspot_redemptions where user_id=v_owner and status='paid' limit 1);

  insert into public.adspot_leaderboard_snapshots (week_start, entries)
  values (
    date_trunc('week', now())::date,
    jsonb_build_array(
      jsonb_build_object('rank',1,'userId',v_owner,'username','Femi Reviews','points',2400),
      jsonb_build_object('rank',2,'userId',null,'username','AdaReviews','points',2100),
      jsonb_build_object('rank',3,'userId',null,'username','KemiWatcher','points',1800),
      jsonb_build_object('rank',4,'userId',null,'username','TundeEarns','points',1500),
      jsonb_build_object('rank',5,'userId',null,'username','ChiomaPulse','points',1200)
    )
  );

  insert into public.adspot_events_log (event_type, actor_id, payload, created_at)
  select
    (array['review.complete','brand.ad.create','admin.points.grant','admin.user.create'])[1+(g%4)],
    v_owner, jsonb_build_object('n', g),
    now()-(g||' days')::interval
  from generate_series(1,60) g;
end $$;
