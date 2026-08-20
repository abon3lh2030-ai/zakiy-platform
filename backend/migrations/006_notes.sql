-- ============================================================================
-- دفتر ملاحظات شخصي - مجلدات + ملاحظات (نصية أو تو-دو ليست) + تثبيت + بحث.
-- ميزة حسابات فردية بس (role فاضي) - الباك إند نفسه يمنع أي حساب مؤسسي عبر
-- require_personal_account، هذا الجدول ما فيه أي قيد إضافي يخص الأدوار.
-- ============================================================================

create table if not exists note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_folders_user on note_folders(user_id);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references note_folders(id) on delete set null,
  title text not null default '',
  content text not null default '',
  note_type text not null default 'text' check (note_type in ('text', 'checklist')),
  checklist_items jsonb not null default '[]'::jsonb,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_user on notes(user_id);
create index if not exists idx_notes_user_folder on notes(user_id, folder_id);
create index if not exists idx_notes_user_pinned on notes(user_id, is_pinned);

alter table note_folders enable row level security;
alter table notes enable row level security;

drop policy if exists note_folders_self on note_folders;
create policy note_folders_self on note_folders
  for select using (user_id = auth.uid());

drop policy if exists notes_self on notes;
create policy notes_self on notes
  for select using (user_id = auth.uid());
