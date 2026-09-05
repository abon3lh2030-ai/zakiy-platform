-- جلسات المختبر الذكي: تحفظ التفكير قبل/أثناء/بعد التجربة، وتغذي ملف الطالب
-- ولوحة تحليلات المعلم بدل الاكتفاء بنتيجة المحاكاة النهائية.
create table if not exists science_lab_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_key text not null default 'reaction_rate_showcase',
  mode text not null default 'guided',
  hypothesis text not null,
  hypothesis_reason text,
  attempts jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  conclusion text,
  misconceptions jsonb not null default '[]'::jsonb,
  score int check (score between 0 and 100),
  understanding_change int,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_science_lab_sessions_user on science_lab_sessions(user_id, created_at desc);
create index if not exists idx_science_lab_sessions_experiment on science_lab_sessions(experiment_key, created_at desc);

create table if not exists student_learning_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null,
  source_key text not null,
  status text not null default 'needs_review' check (status in ('needs_review', 'improving', 'mastered')),
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, concept, source_key)
);
create index if not exists idx_student_learning_insights_user on student_learning_insights(user_id, status);

alter table science_lab_sessions enable row level security;
alter table student_learning_insights enable row level security;

drop policy if exists science_lab_sessions_self on science_lab_sessions;
create policy science_lab_sessions_self on science_lab_sessions
  for select using (user_id = auth.uid());

drop policy if exists student_learning_insights_self on student_learning_insights;
create policy student_learning_insights_self on student_learning_insights
  for select using (user_id = auth.uid());
