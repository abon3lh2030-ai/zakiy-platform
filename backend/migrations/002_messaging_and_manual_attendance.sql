-- ============================================================================
-- نظام الرسائل + التنبيهات (تذكير حصة/بدء حصة/بث جماعي) + الحضور اليدوي
-- شغّل هذا الملف مرة وحدة كامل عبر Supabase Dashboard → SQL Editor بعد
-- 001_school_accounts.sql (يعتمد على classes/schools/auth_role()/auth_school_id()
-- المُنشأة هناك).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الرسائل المباشرة (ثنائية بين أي مستخدمين - بدون قيد صداقة)
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_messages_sender on messages(sender_id, created_at);
create index if not exists idx_messages_recipient on messages(recipient_id, created_at);

-- ----------------------------------------------------------------------------
-- 2) التنبيهات (رسالة جديدة / بث جماعي / تذكير حصة / بدء حصة) - صف لكل مستلم
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_message', 'broadcast', 'schedule_reminder', 'class_started')),
  title text not null,
  body text,
  sender_id uuid references auth.users(id) on delete set null,
  related_class_id uuid references classes(id) on delete set null,
  related_room_code text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_recipient on notifications(recipient_user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3) حارس عدم تكرار تذكير الحصة (صف وحد لكل حصة/يوم)
-- ----------------------------------------------------------------------------
create table if not exists schedule_reminders_sent (
  schedule_id uuid not null references class_schedule(id) on delete cascade,
  sent_date date not null,
  primary key (schedule_id, sent_date)
);

-- ----------------------------------------------------------------------------
-- 4) الحضور اليدوي (يسجّله المعلم مرة لكل حصة/يوم) - بالإضافة للحضور
--    التلقائي المبني على انضمام غرفة الكلاس المباشر (session_attendance)
-- ----------------------------------------------------------------------------
create table if not exists manual_attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  status text not null check (status in ('present', 'absent', 'late')),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique (class_id, student_id, session_date)
);
create index if not exists idx_manual_attendance_class_date on manual_attendance(class_id, session_date);

-- ----------------------------------------------------------------------------
-- 5) RLS - سياسات SELECT بس (نفس مبدأ الهجرة الأولى: الكتابة كلها عبر
--    الباك إند بمفتاح service role اللي يتخطى RLS أصلًا)
-- ----------------------------------------------------------------------------
alter table messages enable row level security;
alter table notifications enable row level security;
alter table manual_attendance enable row level security;

drop policy if exists messages_participant_select on messages;
create policy messages_participant_select on messages
  for select using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists notifications_self_select on notifications;
create policy notifications_self_select on notifications
  for select using (recipient_user_id = auth.uid());

drop policy if exists manual_attendance_teacher_select on manual_attendance;
create policy manual_attendance_teacher_select on manual_attendance
  for select using (class_id in (select id from classes where teacher_id = auth.uid()));

drop policy if exists manual_attendance_school_staff_select on manual_attendance;
create policy manual_attendance_school_staff_select on manual_attendance
  for select using (
    auth_role() in ('school_admin', 'school_administration')
    and class_id in (select id from classes where school_id = auth_school_id())
  );

drop policy if exists manual_attendance_self_select on manual_attendance;
create policy manual_attendance_self_select on manual_attendance
  for select using (student_id = auth.uid());

-- ============================================================================
-- خلص. بعد التشغيل: الباك إند يقدر يبدأ يستخدم الجداول الجديدة.
-- ============================================================================
