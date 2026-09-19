-- تحليلات لوحة الأدمن العامة: آخر نشاط فعلي + أحداث مسار التحويل.
-- آمنة لإعادة التشغيل، وكل القراءة والكتابة تتم من الباك إند بمفتاح service role.

alter table profiles add column if not exists last_active_at timestamptz;
create index if not exists idx_profiles_last_active_at on profiles(last_active_at desc);

create table if not exists platform_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null check (event_name in (
    'trial_offer_viewed',
    'payment_method_added',
    'trial_started',
    'subscription_activated',
    'auto_renew_cancelled',
    'auto_renew_resumed'
  )),
  plan text,
  period text check (period is null or period in ('monthly', 'annual')),
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_analytics_event_time
  on platform_analytics_events(event_name, created_at desc);
create index if not exists idx_platform_analytics_user_time
  on platform_analytics_events(user_id, created_at desc);

alter table platform_analytics_events enable row level security;

-- لا توجد سياسات وصول للعميل عمدًا. الأدمن يقرأها عبر الباك إند فقط.
