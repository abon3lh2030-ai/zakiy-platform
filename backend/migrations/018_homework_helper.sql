-- ============================================================================
-- مساعد الواجب الذكي (نظير التحضير الذكي، بس للطالب) - أداة معلم مستقلة
-- تمامًا عن مدرستي (بدون أي تكامل بيانات) - الطالب يكتب المادة والصف
-- والموضوع/سؤال الواجب، والذكاء الاصطناعي يشرح ويحل مثال ويعطي أسئلة
-- تدريبية، ويقدر يحفظ الجلسة ويرجع لها بعدين.
-- ============================================================================

create table if not exists homework_helper_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  grade_level text not null,
  topic text not null,
  -- {explanation: "", worked_example: "", practice_questions: [{question, answer}], tips: ""}
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_homework_helper_user on homework_helper_sessions(user_id);

alter table homework_helper_sessions enable row level security;

drop policy if exists homework_helper_self on homework_helper_sessions;
create policy homework_helper_self on homework_helper_sessions
  for select using (user_id = auth.uid());
