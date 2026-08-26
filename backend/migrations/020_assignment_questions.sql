-- ============================================================================
-- الواجب صار فيه نوعين: "ملف" (السلوك القديم - الطالب يرفع ملف) أو "أسئلة"
-- (المعلم يحط أسئلة اختيارات/صح وخطأ/مقالي بالضبط زي الاختبارات، والطالب
-- يجاوب عليها مباشرة بدون رفع ملف - نفس منطق تصحيح الاختبارات التلقائي
-- لو كل الأسئلة إجاباتها محطوطة).
-- ============================================================================

alter table assignments
  add column if not exists submission_type text not null default 'file'
  check (submission_type in ('file', 'questions'));

create table if not exists assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  order_index int not null default 0,
  question_type text not null check (question_type in ('mcq', 'true_false', 'essay')),
  question_text text not null,
  choices jsonb,
  correct_answer text,
  created_at timestamptz not null default now()
);
create index if not exists idx_assignment_questions_assignment on assignment_questions(assignment_id, order_index);

alter table assignment_questions enable row level security;

drop policy if exists assignment_questions_teacher_select on assignment_questions;
create policy assignment_questions_teacher_select on assignment_questions
  for select using (
    exists (
      select 1 from assignments
      where assignments.id = assignment_questions.assignment_id and assignments.teacher_id = auth.uid()
    )
  );

drop policy if exists assignment_questions_student_select on assignment_questions;
create policy assignment_questions_student_select on assignment_questions
  for select using (
    exists (
      select 1 from assignments
      join profiles on profiles.user_id = auth.uid()
      where assignments.id = assignment_questions.assignment_id
        and (
          assignments.target_student_id = auth.uid()
          or (assignments.target_student_id is null and profiles.class_id = assignments.class_id)
        )
    )
  );

-- تسليم من نوع "أسئلة" ما فيه ملف إطلاقًا - لازم نسمح بـ null هنا (كانت
-- not null من migration 007 لما الواجبات كانت ملفات بس)
alter table assignment_submissions alter column file_path drop not null;
alter table assignment_submissions alter column file_name drop not null;

alter table assignment_submissions
  add column if not exists answers jsonb,
  add column if not exists is_auto_graded boolean not null default false,
  add column if not exists score int,
  add column if not exists total_questions int;
