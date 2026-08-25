-- ============================================================================
-- إضافة استهداف كتب مكتبة المدرسة بمعلم معيّن (زيادة على الفصل الموجود) -
-- مدير/إدارة المدرسة يقدر يختار فصل ومعلم مع بعض، أو يسيبهم فاضيين (كل
-- الفصول وكل المعلمين = عام لكل طلاب المدرسة)
-- ============================================================================

alter table school_library_books
  add column if not exists teacher_id uuid references auth.users(id) on delete set null;

create index if not exists idx_school_library_teacher on school_library_books(teacher_id);
