-- ============================================================================
-- تعدد المعلمين لكل فصل (كل معلم بمادته الخاصة) - يحل محل عمود
-- classes.teacher_id المفرد القديم (يبقى بالجدول بدون حذف، توافقًا مع أي
-- كود/تقرير قديم يقرأه، بس التطبيق ما يعتمد عليه بعد هذا التحديث). المدير/
-- الإدارة يديرون الربط من نفس تبويب "الفصول والجدول": يضيفون معلم+مادة
-- لفصل، يعدّلون المادة، أو يحذفون الربط - وكل معلم يشوف بس محتواه هو
-- (واجباته/اختباراته/درجاته) حتى لو تشارك بفصل مع معلمين ثانين، لأن
-- الواجبات/الاختبارات أصلًا مملوكة لصف teacher_id لا للفصل نفسه.
-- ============================================================================

create table if not exists class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  created_at timestamptz not null default now(),
  unique (class_id, teacher_id, subject)
);
create index if not exists idx_class_teachers_class on class_teachers(class_id);
create index if not exists idx_class_teachers_teacher on class_teachers(teacher_id);

-- ترحيل البيانات القديمة: كل فصل له classes.teacher_id يصير له صف بجدول
-- class_teachers بمادة افتراضية "عام" - يحافظ على استمرارية وصول المعلم
-- الحالي لفصله بدون أي انقطاع خدمة وقت هذا التحديث. المدير يقدر يعدّل
-- المادة لاحقًا من الواجهة.
insert into class_teachers (class_id, teacher_id, subject)
select id, teacher_id, 'عام' from classes where teacher_id is not null
on conflict (class_id, teacher_id, subject) do nothing;

alter table class_teachers enable row level security;

drop policy if exists class_teachers_teacher_select on class_teachers;
create policy class_teachers_teacher_select on class_teachers
  for select using (teacher_id = auth.uid());

drop policy if exists class_teachers_school_select on class_teachers;
create policy class_teachers_school_select on class_teachers
  for select using (
    exists (
      select 1 from classes
      where classes.id = class_teachers.class_id and classes.school_id = auth_school_id()
    )
    or auth_role() = 'admin'
  );

-- تحديث سياسات RLS القديمة اللي كانت تعتمد على classes.teacher_id المفرد -
-- الحين تتحقق من class_teachers بدلًا منه (تعدد معلمين/مواد لكل فصل)
drop policy if exists attendance_teacher_select on session_attendance;
create policy attendance_teacher_select on session_attendance
  for select using (
    auth_role() = 'teacher'
    and class_id in (select class_id from class_teachers where teacher_id = auth.uid())
  );

drop policy if exists manual_attendance_teacher_select on manual_attendance;
create policy manual_attendance_teacher_select on manual_attendance
  for select using (class_id in (select class_id from class_teachers where teacher_id = auth.uid()));

drop policy if exists participation_grades_teacher_select on class_participation_grades;
create policy participation_grades_teacher_select on class_participation_grades
  for select using (
    class_id in (select class_id from class_teachers where teacher_id = auth.uid())
  );
