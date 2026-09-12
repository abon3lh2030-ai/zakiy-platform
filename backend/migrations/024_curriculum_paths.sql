-- مسارات الكتب المركزية: ينشئها الأدمن العام، وتختار المدرسة مسارًا واحدًا.
-- كتب المسار تبقى مركزية، لذلك تحديثها يظهر تلقائيًا لكل مدرسة مرتبطة به.
create table if not exists curriculum_paths (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists curriculum_path_books (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references curriculum_paths(id) on delete cascade,
  title text not null,
  extracted_text text not null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_curriculum_path_books_path
  on curriculum_path_books(path_id, created_at desc);

alter table schools
  add column if not exists curriculum_path_id uuid references curriculum_paths(id) on delete set null;
create index if not exists idx_schools_curriculum_path on schools(curriculum_path_id);

-- كل التعامل المباشر يمر من الباك إند بمفتاح service role.
alter table curriculum_paths enable row level security;
alter table curriculum_path_books enable row level security;
