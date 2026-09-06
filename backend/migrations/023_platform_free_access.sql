-- وضع المجانية العامة: صف إعدادات وحيد يتحكم في إلغاء حدود الاشتراكات
-- لكل الحسابات، مع دعم التشغيل الفوري أو الجدولة بين تاريخين.
create table if not exists platform_access_settings (
  singleton boolean primary key default true check (singleton = true),
  free_access_enabled boolean not null default false,
  free_access_starts_at timestamptz,
  free_access_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (
    free_access_starts_at is null
    or free_access_ends_at is null
    or free_access_starts_at < free_access_ends_at
  )
);

insert into platform_access_settings (singleton, free_access_enabled)
values (true, false)
on conflict (singleton) do nothing;

-- الوصول لهذا الجدول يتم فقط من الباك إند بمفتاح service role.
alter table platform_access_settings enable row level security;
