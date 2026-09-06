create table if not exists public.adspot_answers (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid not null references public.adspot_review_sessions(id) on delete cascade,
  question_id uuid not null references public.adspot_questions(id) on delete cascade,
  answer_text text,
  answer_value text,
  created_at timestamptz not null default now()
);
create index if not exists adspot_answers_session_idx on public.adspot_answers (review_session_id);
create index if not exists adspot_answers_question_idx on public.adspot_answers (question_id);
alter table public.adspot_answers enable row level security;
drop policy if exists "adspot_answers_own_read" on public.adspot_answers;
create policy "adspot_answers_own_read" on public.adspot_answers
  for select using (
    exists (select 1 from public.adspot_review_sessions s where s.id = review_session_id and s.user_id = auth.uid())
    or public.adspot_is_admin()
  );
grant select on public.adspot_answers to authenticated;
grant all on public.adspot_answers to service_role;
