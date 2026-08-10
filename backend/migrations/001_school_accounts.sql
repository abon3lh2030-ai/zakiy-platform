-- ============================================================================
-- نظام إدارة حسابات متعدد المدارس (٥ أدوار) — Admin / School Admin /
-- School Administration / Teacher / Student
--
-- شغّل هذا الملف مرة وحدة كامل عبر Supabase Dashboard → SQL Editor.
-- آمن يُعاد تشغيله بفضل IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object،
-- بس المفروض تشغّله مرة وحدة بالإنتاج.
--
-- ملاحظة مهمة: كل الكتابة الفعلية بالتطبيق تمر عبر الباك إند (Flask) بمفتاح
-- service role اللي يتخطى RLS أصلًا. سياسات RLS هنا طبقة حماية إضافية
-- (defense-in-depth) لو تحدّث الفرونت إند مستقبلًا يكلم Supabase مباشرة،
-- مو الآلية الأساسية للتحقق من الصلاحيات.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) الجداول الجديدة
-- ----------------------------------------------------------------------------

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_accounts int not null default 0,
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'inactive', 'expired')),
  subscription_package text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  teacher_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index if not exists idx_classes_school on classes(school_id);
create index if not exists idx_classes_teacher on classes(teacher_id);

create table if not exists class_schedule (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  subject text,
  created_at timestamptz not null default now()
);
create index if not exists idx_schedule_class on class_schedule(class_id);

-- لا يوجد رابط مباشر لغرف الكلاس المباشر بقاعدة البيانات (الغرف بالذاكرة بس)،
-- فهذا الجدول هو أثر دائم وحيد لـ"مين انضم لأي غرفة مرتبطة بفصل ومتى" - يُستخدم
-- لحساب الحضور تلقائيًا من النشاط الفعلي بدل تسجيل يدوي.
create table if not exists session_attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete set null,
  room_code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_at_time text,
  joined_at timestamptz not null default now()
);
create index if not exists idx_attendance_class_day on session_attendance(class_id, joined_at);
create index if not exists idx_attendance_user_day on session_attendance(user_id, joined_at);

-- ----------------------------------------------------------------------------
-- 2) تعديل profiles - role يبقى NULL لكل الحسابات الحالية/التسجيل الذاتي
--    المستقبلي، وهذا بالضبط اللي يميّز "حساب مؤسسي" عن "حساب مستهلك عادي"
-- ----------------------------------------------------------------------------

alter table profiles add column if not exists role text
  check (role is null or role in ('admin', 'school_admin', 'school_administration', 'teacher', 'student'));
alter table profiles add column if not exists school_id uuid references schools(id) on delete cascade;
alter table profiles add column if not exists class_id uuid references classes(id) on delete set null;
alter table profiles add column if not exists must_change_password boolean not null default false;

create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_profiles_school on profiles(school_id);
create index if not exists idx_profiles_class on profiles(class_id);

-- فريدية اسم المستخدم: تأكدنا إن profiles.username غير فريد فعليًا بالبيانات
-- الحالية (١١٠ صف / ٨٦ اسم فريد بس) - فلا نقدر نضيف UNIQUE عام بدون ما نكسر
-- حسابات حقيقية. الحل: فهرس فريد جزئي على role='student' بس، لأن الطلاب هم
-- الوحيدين اللي يسجّلون دخول باسم المستخدم (بريد اصطناعي)، وكل صف جديد بهالدور
-- يُنشأ حصرًا عبر مسار الإضافة بالجملة اللي يتحكم فيه.
create unique index if not exists idx_profiles_username_student_unique
  on profiles (lower(username)) where role = 'student';

-- School Admin واحد بس لكل مدرسة (ينشئه Admin العام وقت إنشاء المدرسة)
create unique index if not exists idx_one_school_admin_per_school
  on profiles(school_id) where role = 'school_admin';

-- ----------------------------------------------------------------------------
-- 3) دوال مساعدة لـ RLS (security definer عشان تتفادى تكرار recursive بالسياسات)
-- ----------------------------------------------------------------------------

create or replace function auth_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where user_id = auth.uid() $$;

create or replace function auth_school_id() returns uuid
language sql stable security definer set search_path = public as
$$ select school_id from profiles where user_id = auth.uid() $$;

-- ----------------------------------------------------------------------------
-- 4) RLS - تفعيل + سياسات SELECT بس (لا سياسات كتابة لـ authenticated؛ الكتابة
--    كلها عبر الباك إند بمفتاح service role اللي يتخطى RLS، فمنع الكتابة
--    المباشرة هو السلوك الصحيح افتراضيًا)
-- ----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table schools enable row level security;
alter table classes enable row level security;
alter table class_schedule enable row level security;
alter table session_attendance enable row level security;

drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles
  for select using (user_id = auth.uid());

drop policy if exists profiles_school_staff_select on profiles;
create policy profiles_school_staff_select on profiles
  for select using (
    auth_role() in ('school_admin', 'school_administration', 'teacher')
    and school_id = auth_school_id()
  );

drop policy if exists profiles_admin_select on profiles;
create policy profiles_admin_select on profiles
  for select using (auth_role() = 'admin');

drop policy if exists schools_own_select on schools;
create policy schools_own_select on schools
  for select using (id = auth_school_id() or auth_role() = 'admin');

drop policy if exists classes_school_select on classes;
create policy classes_school_select on classes
  for select using (school_id = auth_school_id() or auth_role() = 'admin');

drop policy if exists schedule_school_select on class_schedule;
create policy schedule_school_select on class_schedule
  for select using (
    class_id in (select id from classes where school_id = auth_school_id())
    or auth_role() = 'admin'
  );

drop policy if exists attendance_self_select on session_attendance;
create policy attendance_self_select on session_attendance
  for select using (user_id = auth.uid());

drop policy if exists attendance_teacher_select on session_attendance;
create policy attendance_teacher_select on session_attendance
  for select using (
    auth_role() = 'teacher'
    and class_id in (select id from classes where teacher_id = auth.uid())
  );

drop policy if exists attendance_school_staff_select on session_attendance;
create policy attendance_school_staff_select on session_attendance
  for select using (
    auth_role() in ('school_admin', 'school_administration')
    and class_id in (select id from classes where school_id = auth_school_id())
  );

-- ============================================================================
-- خلص. بعد التشغيل: الباك إند يقدر يبدأ يستخدم الأعمدة/الجداول الجديدة.
-- ============================================================================
