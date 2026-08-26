-- ============================================================================
-- إصلاح عاجل: تصادم أسماء جداول بين ميزتين مختلفتين تمامًا كلاهما اسمه
-- "quiz_attempts":
--   ١) الجدول الأصلي (سابق لنظام المدارس بالكامل) - يسجّل نتيجة أي اختبار
--      شخصي/جماعي/غرفة (user_id, mode, score, total, time_taken,
--      wrong_topics, created_at) - يُستخدم بلوحة "أدائي" والبروفايل الشخصي
--      وأداء المعلم لطلابه (_compute_performance_summary).
--   ٢) migration 009_quizzes.sql (دفتر اختبارات المدرسة) استخدمت نفس الاسم
--      بالخطأ بدون تحقق من وجود جدول سابق بنفس الاسم. لما صار خطأ جزئي
--      بتلك الـ migration سابقًا بهذي الجلسة وانحلّ بـ drop+recreate،
--      انحذف الجدول الأصلي فعليًا واستُبدل بمخطط اختبارات المدرسة -
--      فانكسرت لوحة الأداء والبروفايل لأي حساب (فردي أو مدرسي) بالكامل،
--      لأن الكود صار يقرأ أعمدة (user_id/total/time_taken/created_at/mode)
--      من جدول ما عادت فيه هذي الأعمدة إطلاقًا.
--
-- ⚠️ بيانات الأداء الشخصي (نتائج الاختبارات الفردية/الجماعية) اللي كانت
-- مخزّنة بالجدول الأصلي قبل هذا الحادث انحذفت فعليًا ولا يمكن استرجاعها من
-- هنا - لو عندك نسخة احتياطية (Backup) بلوحة تحكم Supabase من قبل هذا
-- التاريخ ممكن تسترجعها منها، وإلا الحل هنا يوقف الضرر بس ما يرجّع القديم.
--
-- الحل: نفصل الاثنين نهائيًا بجدولين مختلفين، وما نلمس مخطط اختبارات
-- المدرسة (بياناته الحالية تبقى زي ما هي، بس باسم جدول جديد).
-- ============================================================================

alter table quiz_attempts rename to school_quiz_attempts;

-- تسمية السياسات القديمة نفسها بقيت "quiz_attempts_..." بعد الـ rename (Postgres
-- يحافظ عليها تلقائيًا، بس الاسم صار مضلّل) - نعيد تسميتها بس، بدون أي تغيير
-- بمنطقها. بـ DO block عشان لو الاسم مو مطابق (اختلاف طفيف بتشغيل سابق) ما
-- يوقف باقي السكربت الأهم تحته
do $$
begin
  alter policy quiz_attempts_student_self on school_quiz_attempts rename to school_quiz_attempts_student_self;
exception when undefined_object then null;
end $$;
do $$
begin
  alter policy quiz_attempts_teacher_select on school_quiz_attempts rename to school_quiz_attempts_teacher_select;
exception when undefined_object then null;
end $$;

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'solo',
  score int not null default 0,
  total int not null default 0,
  time_taken int not null default 0,
  wrong_topics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_quiz_attempts_user on quiz_attempts(user_id);
create index if not exists idx_quiz_attempts_created on quiz_attempts(created_at);

alter table quiz_attempts enable row level security;
drop policy if exists quiz_attempts_self_select on quiz_attempts;
create policy quiz_attempts_self_select on quiz_attempts
  for select using (user_id = auth.uid());
