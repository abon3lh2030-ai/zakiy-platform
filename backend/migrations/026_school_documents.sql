-- مجلدات ومستندات مشتركة لإدارة كل مدرسة.
-- الملفات نفسها في bucket خاص، والبيانات الوصفية هنا. الوصول الفعلي يمر عبر
-- الباك إند الذي يتحقق من school_id ودور school_admin/school_administration.

create table if not exists school_document_folders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table if not exists school_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  folder_id uuid references school_document_folders(id) on delete set null,
  file_name text not null check (char_length(trim(file_name)) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_document_folders_school
  on school_document_folders(school_id, created_at);
create index if not exists idx_school_documents_school_folder
  on school_documents(school_id, folder_id, created_at desc);

alter table school_document_folders enable row level security;
alter table school_documents enable row level security;

-- خاص لأن روابط التنزيل مؤقتة وموقّعة من الباك إند فقط.
insert into storage.buckets (id, name, public, file_size_limit)
values ('school-documents', 'school-documents', false, 20971520)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;
