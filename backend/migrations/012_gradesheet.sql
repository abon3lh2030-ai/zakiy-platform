-- ============================================================================
-- كشف الدرجات (المعلم بس) - المشاركة والمهام الأدائية يحطهم المعلم يدويًا
-- لكل طالب بفصله، بينما درجتي الواجبات والاختبارات تُحسب تلقائيًا من
-- الدرجات الموجودة أصلًا بجدولي assignment_submissions/quiz_attempts -
-- ما نكرر تخزينها هنا. المجموع نفسه ما يُخزَّن إطلاقًا، يُحسب لحظيًا وقت
-- العرض (مجموع الأربع أعمدة) عشان يبقى مطابق دايمًا، المعلم ما يقدر يعدّله.
-- ============================================================================

create table if not exists class_participation_grades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  participation numeric not null default 0,
  performance_tasks numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (class_id, student_id)
);
create index if not exists idx_participation_grades_class on class_participation_grades(class_id);
create index if not exists idx_participation_grades_student on class_participation_grades(student_id);

alter table class_participation_grades enable row level security;

drop policy if exists participation_grades_teacher_select on class_participation_grades;
create policy participation_grades_teacher_select on class_participation_grades
  for select using (
    exists (
      select 1 from classes
      where classes.id = class_participation_grades.class_id and classes.teacher_id = auth.uid()
    )
  );

drop policy if exists participation_grades_student_self on class_participation_grades;
create policy participation_grades_student_self on class_participation_grades
  for select using (student_id = auth.uid());
