-- ============================================================================
-- مكتبة المدرسة - مدير/إدارة المدرسة يضيف كتاب لفصل معيّن أو لكل فصول
-- المدرسة (class_id فاضي = كل الفصول)، وأي طالب بالفصل المستهدف يشوف
-- الكتاب تلقائيًا بمكتبته الشخصية (مدموج مع كتبه الخاصة عبر GET /api/library)
-- بدون أي نسخ فعلي - القراءة حيّة من هذا الجدول مباشرة، فينضم للطالب حتى
-- لو صار عضو بالفصل بعد إضافة الكتاب.
-- ============================================================================

create table if not exists school_library_books (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  -- فاضي = يظهر لكل طلاب المدرسة، وإلا طلاب هذا الفصل بس
  class_id uuid references classes(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  extracted_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_school_library_school on school_library_books(school_id);
create index if not exists idx_school_library_class on school_library_books(class_id);

alter table school_library_books enable row level security;

drop policy if exists school_library_admin_select on school_library_books;
create policy school_library_admin_select on school_library_books
  for select using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.school_id = school_library_books.school_id
        and profiles.role in ('school_admin', 'school_administration')
    )
  );

drop policy if exists school_library_student_select on school_library_books;
create policy school_library_student_select on school_library_books
  for select using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid() and profiles.role = 'student'
        and profiles.school_id = school_library_books.school_id
        and (school_library_books.class_id is null or profiles.class_id = school_library_books.class_id)
    )
  );
