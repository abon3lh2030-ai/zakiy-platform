-- كتالوج الباقات الديناميكي + أكواد الاشتراك أحادية الاستخدام + أكواد الخصم.
-- كل الجداول مقفلة بـ RLS؛ إدارتها واستردادها يتمان من الباك إند فقط.

create table if not exists subscription_plan_catalog (
  plan_key text primary key check (plan_key ~ '^[a-z0-9_]{2,32}$'),
  name_ar text not null,
  name_en text not null,
  price_monthly numeric(10,2) not null default 0 check (price_monthly >= 0),
  price_annual numeric(10,2) not null default 0 check (price_annual >= 0),
  library_limit integer check (library_limit is null or library_limit >= 0),
  solo_daily integer check (solo_daily is null or solo_daily >= 0),
  group_daily integer check (group_daily is null or group_daily >= 0),
  lesson_daily integer check (lesson_daily is null or lesson_daily >= 0),
  ai_assistant_daily integer check (ai_assistant_daily is null or ai_assistant_daily >= 0),
  archive_limit integer check (archive_limit is null or archive_limit >= 0),
  performance_limit integer check (performance_limit is null or performance_limit >= 0),
  promotional_period text check (promotional_period is null or promotional_period in ('monthly','annual')),
  trial_eligible boolean not null default true,
  unlimited_access boolean not null default false,
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into subscription_plan_catalog
  (plan_key,name_ar,name_en,price_monthly,price_annual,library_limit,solo_daily,group_daily,lesson_daily,ai_assistant_daily,archive_limit,performance_limit,promotional_period,trial_eligible,unlimited_access,is_active,is_public,is_system,sort_order)
values
  ('national_day','عرض اليوم الوطني','Saudi National Day Offer',96,96,50,null,null,8,null,null,null,'annual',false,true,true,true,true,5),
  ('free','المجاني','Free',0,0,5,3,1,0,10,8,5,null,false,false,true,true,true,10),
  ('plus','بلس','Plus',19.99,99.99,20,5,3,1,25,15,8,null,true,false,true,true,true,20),
  ('pro','برو','Pro',39.99,199.99,30,10,5,3,40,30,15,null,true,false,true,true,true,30),
  ('ultimate','ألتميت','Ultimate',59.99,299.99,50,null,null,8,null,null,null,null,true,true,true,true,true,40),
  ('owner','مالك التطبيق','App Owner',0,0,null,null,null,null,null,null,null,null,false,true,true,false,true,999)
on conflict (plan_key) do nothing;

create table if not exists subscription_redemption_codes (
  code text primary key check (code ~ '^[A-Z0-9]{10}$'),
  plan_key text not null references subscription_plan_catalog(plan_key),
  period text not null check (period in ('monthly','annual')),
  expires_at timestamptz not null default (now() + interval '1 year'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_redemption_codes_available on subscription_redemption_codes(expires_at) where used_at is null;

create table if not exists subscription_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  discount_percent integer not null check (discount_percent between 1 and 100),
  expires_at timestamptz not null,
  usage_limit integer not null check (usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_discount_codes_lookup on subscription_discount_codes(code, is_active, expires_at);

alter table subscription_orders add column if not exists base_amount numeric(10,2);
alter table subscription_orders add column if not exists discount_code_id uuid references subscription_discount_codes(id) on delete set null;
alter table subscription_orders add column if not exists discount_code text;
alter table subscription_orders add column if not exists discount_percent integer;

create or replace function redeem_subscription_code(p_code text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code subscription_redemption_codes%rowtype;
  v_profile profiles%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_code from subscription_redemption_codes
    where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',false,'error','الكود غير صحيح'); end if;
  if v_code.used_at is not null then return jsonb_build_object('ok',false,'error','تم استخدام هذا الكود سابقًا'); end if;
  if v_code.expires_at <= now() then return jsonb_build_object('ok',false,'error','انتهت صلاحية هذا الكود'); end if;
  if not exists (select 1 from subscription_plan_catalog where plan_key=v_code.plan_key and is_active) then
    return jsonb_build_object('ok',false,'error','الباقة المرتبطة بالكود غير متاحة');
  end if;

  select * into v_profile from profiles where user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'error','الحساب غير موجود'); end if;
  if v_profile.role is not null then return jsonb_build_object('ok',false,'error','حسابات المدارس لا تحتاج كود اشتراك'); end if;

  v_start := case when v_profile.subscription_expires_at is not null and v_profile.subscription_expires_at > now()
    then v_profile.subscription_expires_at else now() end;
  v_end := v_start + case when v_code.period='monthly' then interval '30 days' else interval '365 days' end;

  update subscription_redemption_codes set used_at=now(), used_by=p_user_id where code=v_code.code;
  update profiles set subscription_tier=v_code.plan_key, subscription_period=v_code.period,
    subscription_expires_at=v_end, subscription_source='redemption_code' where user_id=p_user_id;
  update web_subscription_billing set plan=v_code.plan_key, period=v_code.period,
    status='cancel_at_period_end', auto_renew=false, current_period_end=v_end,
    next_charge_at=null, next_retry_at=null, updated_at=now() where user_id=p_user_id;

  return jsonb_build_object('ok',true,'plan',v_code.plan_key,'period',v_code.period,'expires_at',v_end);
end;
$$;

create or replace function consume_subscription_discount(p_discount_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update subscription_discount_codes
    set usage_count = usage_count + 1
    where id = p_discount_id and is_active and expires_at > now() and usage_count < usage_limit;
end;
$$;

alter table subscription_plan_catalog enable row level security;
alter table subscription_redemption_codes enable row level security;
alter table subscription_discount_codes enable row level security;
revoke all on function redeem_subscription_code(text,uuid) from public, anon, authenticated;
grant execute on function redeem_subscription_code(text,uuid) to service_role;
revoke all on function consume_subscription_discount(uuid) from public, anon, authenticated;
grant execute on function consume_subscription_discount(uuid) to service_role;
