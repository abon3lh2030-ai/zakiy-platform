-- ============================================================================
-- الواجبات والاختبارات: خيار المنصة - "ذكي" (الوضع الحالي، بدون أي تغيير
-- على الإطلاق) أو "مدرستي" (المعلم يحط رابط الواجب/الاختبار اللي سواه
-- بمنصة مدرستي - أو رابط منصة مدرستي الرسمي لو ما سواه بعد - والطالب يفتح
-- نفس الرابط بدل ما يحل جوه ذكي؛ ما فيه أي تتبع تسليم/تصحيح لأنه بالكامل
-- خارج ذكي).
-- ============================================================================

alter table assignments
  add column if not exists platform text not null default 'zakiy'
  check (platform in ('zakiy', 'madrasati'));
alter table assignments add column if not exists external_link text;

alter table quizzes
  add column if not exists platform text not null default 'zakiy'
  check (platform in ('zakiy', 'madrasati'));
alter table quizzes add column if not exists external_link text;
-- وقت الاختبار بالدقايق ما له معنى لاختبار مدرستي (يُحل بره ذكي بالكامل)
alter table quizzes alter column time_limit_minutes drop not null;
