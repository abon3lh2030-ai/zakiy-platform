-- ============================================================================
-- إنفاذ فعلي (سيرفري) لحدود الباقات على الموقع - قبل هذا كانت الحدود تُعرض
-- بس بالباقات (subscription_plans) بدون أي منع فعلي. جدول usage_events يسجّل
-- كل استخدام محدود (مذاكرة فردية/غرفة جماعية/درس مباشر) عشان نحسب استهلاك
-- اليوم قبل ما نسمح بإجراء جديد. حد "المكتبة" منفصل - يتحسب مباشرة من عدد
-- صفوف جدول library الفعلي (سقف تخزين كلي، مو يومي)، ما يحتاج جدول هنا.
-- ============================================================================

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('solo_session', 'group_room', 'live_lesson')),
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_events_user_action_day on usage_events(user_id, action, created_at desc);

alter table usage_events enable row level security;

drop policy if exists usage_events_self_select on usage_events;
create policy usage_events_self_select on usage_events
  for select using (user_id = auth.uid());
