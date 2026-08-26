-- ============================================================================
-- خطة مذاكرة ذكية (أداة طالب مستقلة عن مدرستي) - الطالب يحط المواد وتاريخ
-- الاختبار والوقت المتاح، والذكاء الاصطناعي يولّد خطة مذاكرة يوم بيوم،
-- يقدر يحفظها ويرجع لها.
-- ============================================================================

create table if not exists study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subjects text not null,
  exam_date date,
  hours_per_day numeric,
  -- {days: [{date_label, tasks: [""]}], general_tips: ""}
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_study_plans_user on study_plans(user_id);

alter table study_plans enable row level security;

drop policy if exists study_plans_self on study_plans;
create policy study_plans_self on study_plans
  for select using (user_id = auth.uid());
