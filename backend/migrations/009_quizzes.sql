-- ============================================================================
-- دفتر الاختبارات - معلم ينشئ اختبار لفصل كامل (مو لطالب معيّن، مثل الواجبات
-- بعد التبسيط) فيه اسم المادة، وقت محدد بالدقايق، وأسئلة (اختيارات/صح وخطأ/
-- مقالي). يقدر يحط الإجابة الصحيحة لأسئلة الاختيارات وصح وخطأ قبل ما ينشر
-- الاختبار - لو كل الأسئلة إجاباتها محطوطة (يعني ما فيه سؤال مقالي أو سؤال
-- اختيارات بدون إجابة) يتصحح تلقائيًا لحظة التسليم، وإلا يحتاج تصحيح يدوي
-- من المعلم بعدين. الطالب يشوف عدّاد وقت، وأول ما يخلص الوقت يترسل اللي
-- جاوبه تلقائيًا حتى لو ما كمّل. ميزة أدوار مؤسسية بس (معلم/طالب) - محجوبة
-- عن الحسابات الفردية، الإنفاذ عبر require_role("teacher"/"student").
-- ============================================================================

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject text not null,
  title text not null,
  time_limit_minutes int not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quizzes_class on quizzes(class_id);
create index if not exists idx_quizzes_teacher on quizzes(teacher_id);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  order_index int not null default 0,
  question_type text not null check (question_type in ('mcq', 'true_false', 'essay')),
  question_text text not null,
  -- قائمة نصية للاختيارات (mcq بس) - JSON array نصوص
  choices jsonb,
  -- إجابة المعلم الصحيحة: mcq = نفس نص أحد الاختيارات، true_false = 'true'/'false'،
  -- essay دايمًا فاضية (ما فيه تصحيح تلقائي لسؤال مقالي)
  correct_answer text,
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_questions_quiz on quiz_questions(quiz_id, order_index);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz,
  submitted_at timestamptz,
  auto_submitted boolean not null default false,
  -- {question_id: "إجابة الطالب"}
  answers jsonb not null default '{}'::jsonb,
  is_graded boolean not null default false,
  score int,
  total_questions int,
  grade text,
  graded_at timestamptz,
  unique (quiz_id, student_id)
);
create index if not exists idx_quiz_attempts_quiz on quiz_attempts(quiz_id);
create index if not exists idx_quiz_attempts_student on quiz_attempts(student_id);

alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;

drop policy if exists quizzes_teacher_select on quizzes;
create policy quizzes_teacher_select on quizzes
  for select using (teacher_id = auth.uid());

drop policy if exists quizzes_student_select on quizzes;
create policy quizzes_student_select on quizzes
  for select using (
    is_published = true
    and exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.class_id = quizzes.class_id
    )
  );

drop policy if exists quiz_questions_teacher_select on quiz_questions;
create policy quiz_questions_teacher_select on quiz_questions
  for select using (
    exists (select 1 from quizzes where quizzes.id = quiz_questions.quiz_id and quizzes.teacher_id = auth.uid())
  );

drop policy if exists quiz_questions_student_select on quiz_questions;
create policy quiz_questions_student_select on quiz_questions
  for select using (
    exists (
      select 1 from quizzes
      join profiles on profiles.user_id = auth.uid() and profiles.class_id = quizzes.class_id
      where quizzes.id = quiz_questions.quiz_id and quizzes.is_published = true
    )
  );

drop policy if exists quiz_attempts_student_self on quiz_attempts;
create policy quiz_attempts_student_self on quiz_attempts
  for select using (student_id = auth.uid());

drop policy if exists quiz_attempts_teacher_select on quiz_attempts;
create policy quiz_attempts_teacher_select on quiz_attempts
  for select using (
    exists (select 1 from quizzes where quizzes.id = quiz_attempts.quiz_id and quizzes.teacher_id = auth.uid())
  );
