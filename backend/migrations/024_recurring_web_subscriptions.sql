-- التجديد التلقائي وتجربة الويب المجانية (ميسر).
-- الرموز الحساسة لا تُقرأ من العميل إطلاقًا؛ الباك إند بمفتاح service role فقط.

create table if not exists web_subscription_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text,
  period text check (period is null or period in ('monthly', 'annual')),
  status text not null default 'inactive'
    check (status in ('inactive', 'pending', 'trialing', 'active', 'cancel_at_period_end', 'past_due', 'cancelled')),
  auto_renew boolean not null default false,
  moyasar_token text,
  payment_brand text,
  payment_last_four text,
  current_period_end timestamptz,
  trial_used boolean not null default false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  trial_offer_starts_at timestamptz,
  trial_offer_ends_at timestamptz,
  trial_offer_last_shown_at timestamptz,
  trial_offer_next_at timestamptz,
  trial_offer_impressions integer not null default 0,
  pending_trial_token text,
  pending_trial_plan text,
  pending_trial_period text,
  retry_count integer not null default 0,
  next_charge_at timestamptz,
  next_retry_at timestamptz,
  last_charge_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_web_subscription_billing_due
  on web_subscription_billing(auto_renew, next_charge_at);

create table if not exists subscription_renewal_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  period text not null check (period in ('monthly', 'annual')),
  due_at timestamptz not null,
  attempt_number integer not null default 1,
  amount numeric not null,
  currency text not null default 'SAR',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed')),
  gateway_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, due_at, attempt_number)
);

create index if not exists idx_subscription_renewal_attempts_status
  on subscription_renewal_attempts(status, created_at);

alter table web_subscription_billing enable row level security;
alter table subscription_renewal_attempts enable row level security;

-- لا توجد سياسات وصول للعميل عمدًا. القراءة والكتابة عبر الباك إند فقط.
