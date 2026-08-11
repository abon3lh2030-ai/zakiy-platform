-- ============================================================================
-- نظام الاشتراكات (٤ باقات: مجاني/بلس/برو/ألتميت) - يخزّن الباقة الفعّالة
-- لكل حساب فردي بجدول profiles + سجل طلبات دفع (subscription_orders) يخدم
-- تدفّق: الموقع ينشئ طلب معلّق -> بوابة الدفع الخارجية (يربطها صاحب المشروع)
-- تستدعي webhook التأكيد بعد نجاح الدفع فعليًا -> الباك إند يفعّل الباقة.
-- تطبيق iOS يشتري عبر StoreKit مباشرة ثم يزامن النتيجة مع الباك إند
-- (/api/subscription/apple/verify) عشان الحساب يبقى متزامن بين المنصتين.
--
-- حسابات المدارس (role مو فاضي) ما تتأثر بهذا الجدول إطلاقًا - وصولها محكوم
-- بعضوية مدرستها فقط، الباك إند يتجاهل subscription_tier لأي حساب مؤسسي.
-- ============================================================================

alter table profiles add column if not exists subscription_tier text not null default 'free';
alter table profiles add column if not exists subscription_period text;
alter table profiles add column if not exists subscription_expires_at timestamptz;
alter table profiles add column if not exists subscription_source text;

create table if not exists subscription_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  period text not null check (period in ('monthly', 'annual')),
  amount numeric not null,
  currency text not null default 'SAR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  gateway_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists idx_subscription_orders_user on subscription_orders(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS - سياسة SELECT بس (نفس مبدأ الهجرات السابقة: الكتابة كلها عبر الباك
-- إند بمفتاح service role اللي يتخطى RLS أصلًا)
-- ----------------------------------------------------------------------------
alter table subscription_orders enable row level security;

drop policy if exists subscription_orders_self_select on subscription_orders;
create policy subscription_orders_self_select on subscription_orders
  for select using (user_id = auth.uid());
