-- ============================================================================
-- التحضير الذكي (أداة معلم عامة - أي حساب مسجّل، فردي أو مؤسسي، مو مربوطة
-- بنظام حسابات المدارس) - المعلم يختار المادة/الصف/الوحدة/الدرس، الذكاء
-- الاصطناعي يولّد تحضير كامل (أهداف/تمهيد/خطوات/أنشطة/تقويم/واجب/إثراء)،
-- ويقدر يحفظه ويرجع له لاحقًا (إعادة استخدام). لا علاقة لها بمنصة "مدرستي"
-- الرسمية - أداة ذكيّ مستقلة بالكامل، ما فيها أي تكامل بيانات مع أي جهة
-- خارجية.
-- ============================================================================

create table if not exists lesson_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  grade_level text not null,
  unit text,
  lesson_title text not null,
  -- {objectives: [], intro: "", steps: [], activities: [], assessment: "", homework: "", enrichment: ""}
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lesson_prep_user on lesson_preparations(user_id);

alter table lesson_preparations enable row level security;

drop policy if exists lesson_prep_self on lesson_preparations;
create policy lesson_prep_self on lesson_preparations
  for select using (user_id = auth.uid());
