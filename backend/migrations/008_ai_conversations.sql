-- ============================================================================
-- المساعد الذكي (محادثة عامة، مو مقصورة على شرح الموقع بس) - محادثات متعددة
-- محفوظة لكل مستخدم، كل واحدة تقدر تكون عامة أو مربوطة بكتاب (تلخيص).
-- سلسلة المحادثة الفعلية مع Gemini محفوظة عند Google نفسها (interaction id
-- متسلسل)، إحنا بس نخزّن النصوص للعرض + آخر interaction_id عشان نكمل منه.
-- ============================================================================

create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  book_title text,
  last_interaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conversations_user on ai_conversations(user_id, updated_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_conversation on ai_messages(conversation_id, created_at);

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

drop policy if exists ai_conversations_self on ai_conversations;
create policy ai_conversations_self on ai_conversations
  for select using (user_id = auth.uid());

drop policy if exists ai_messages_self on ai_messages;
create policy ai_messages_self on ai_messages
  for select using (
    exists (
      select 1 from ai_conversations
      where ai_conversations.id = ai_messages.conversation_id and ai_conversations.user_id = auth.uid()
    )
  );
