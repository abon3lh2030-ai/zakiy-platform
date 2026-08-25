-- ============================================================================
-- جدولة اختيارية لوقت بداية/نهاية الواجبات والاختبارات - المعلم يقدر يحدد
-- متى يبدأ الواجب/الاختبار (قبله الطالب يشوفه بس ما يقدر يسلّم/يبدأ) ومتى
-- يقفل (بعده ما يقدر يسلّم/يبدأ). كلاهما اختياري - فاضي = بدون قيد زمني
-- (نفس السلوك القديم قبل هذا التحديث، توافقًا تامًا مع الصفوف الموجودة).
-- ============================================================================

alter table assignments add column if not exists open_at timestamptz;
alter table assignments add column if not exists close_at timestamptz;

alter table quizzes add column if not exists open_at timestamptz;
alter table quizzes add column if not exists close_at timestamptz;
