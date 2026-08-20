-- ============================================================================
-- دفتر الواجبات - معلم ينشئ واجب لفصله (لطالب وحد أو لكل طلاب الفصل)، والطالب
-- يسلّم ملف + ملاحظة اختيارية. المعلم يشوف مين سلّم ومين لا، ويحط درجة.
-- ميزة أدوار مؤسسية بس (معلم/طالب) - محجوبة تمامًا عن الحسابات الفردية،
-- الإنفاذ الفعلي بالباك إند عبر require_role("teacher"/"student").
-- ملفات التسليم تُخزَّن بـ Supabase Storage (bucket خاص "assignment-submissions"،
-- مو القرص المحلي - القرص المحلي بسيرفر Render المجاني غير دائم ويُمسح مع أي
-- إعادة نشر، ما يصلح لملفات لازم تبقى لأسابيع).
-- ============================================================================

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  -- فاضي = واجب لكل طلاب الفصل، وإلا واجب لطالب معيّن بس
  target_student_id uuid references auth.users(id) on delete cascade,
  subject text not null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_assignments_class on assignments(class_id);
create index if not exists idx_assignments_teacher on assignments(teacher_id);
create index if not exists idx_assignments_target_student on assignments(target_student_id);

create table if not exists assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  note text,
  submitted_at timestamptz not null default now(),
  grade text,
  graded_at timestamptz,
  unique (assignment_id, student_id)
);
create index if not exists idx_submissions_assignment on assignment_submissions(assignment_id);
create index if not exists idx_submissions_student on assignment_submissions(student_id);

alter table assignments enable row level security;
alter table assignment_submissions enable row level security;

drop policy if exists assignments_teacher_select on assignments;
create policy assignments_teacher_select on assignments
  for select using (teacher_id = auth.uid());

drop policy if exists assignments_student_select on assignments;
create policy assignments_student_select on assignments
  for select using (
    target_student_id = auth.uid()
    or (
      target_student_id is null
      and exists (
        select 1 from profiles
        where profiles.user_id = auth.uid() and profiles.class_id = assignments.class_id
      )
    )
  );

drop policy if exists submissions_student_self on assignment_submissions;
create policy submissions_student_self on assignment_submissions
  for select using (student_id = auth.uid());

drop policy if exists submissions_teacher_select on assignment_submissions;
create policy submissions_teacher_select on assignment_submissions
  for select using (
    exists (
      select 1 from assignments
      where assignments.id = assignment_submissions.assignment_id and assignments.teacher_id = auth.uid()
    )
  );
