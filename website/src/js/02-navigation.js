// ---------- زر الرجوع العام (يظهر بكل مكان إلا الواجهة الرئيسية وتسجيل
// الدخول والاختبار) - نحفظ "لقطة" لكل الشاشات الظاهرة وقت كل تنقل رئيسي،
// وزر الرجوع يرجّع آخر لقطة محفوظة بالضبط بدل ما يخمّن شاشة وحدة ثابتة
const TOP_LEVEL_SCREENS = [
  'mode-select', 'room-mode-select', 'room-create-form', 'room-join-form',
  'step-room', 'step-classroom', 'step-upload', 'step-text', 'step-chat', 'step-summary',
  'step-quiz', 'step-performance', 'step-archive', 'step-friends', 'step-library', 'step-settings',
  'step-profile', 'step-notes', 'step-note-editor', 'step-assignments', 'step-assignment-detail',
  'step-ai-list', 'step-ai-conversation', 'step-ai-book-picker', 'step-ai-book-scope',
  'step-quizzes', 'step-quiz-create', 'step-quiz-detail', 'step-quiz-take', 'step-gradesheet',
  'step-madrasati', 'step-lesson-prep', 'step-enrichment', 'step-results-analysis',
  'step-homework-help', 'step-study-plan', 'step-robotics-lab', 'step-science-lab',
  // لوحات نظام إدارة حسابات المدارس - step-force-password-change مو من ضمنها
  // عمدًا (بوابة صلبة، ما تدخل نظام الرجوع/التنقل العادي)
  'step-admin-dashboard', 'step-school-dashboard', 'step-teacher-dashboard', 'step-student-schedule',
  'step-messages',
];
// step-quiz-take زيها زي step-quiz (اختبار الفردي) - ما نبي زر رجوع يظهر
// وقت اختبار عليه مؤقت شغّال، يقلل احتمال مغادرة غير مقصودة
const BACK_BUTTON_HIDDEN_ON = ['mode-select', 'login-form', 'signup-form', 'step-quiz', 'step-quiz-take'];
let navHistory = [];

function currentVisibleTopLevelScreens() {
  return TOP_LEVEL_SCREENS.filter(id => !document.getElementById(id).classList.contains('hidden'));
}
function pushNavSnapshot() {
  navHistory.push(currentVisibleTopLevelScreens());
}
function updateGlobalBackButton() {
  const visible = currentVisibleTopLevelScreens();
  const shouldShow = navHistory.length > 0 && !visible.some(id => BACK_BUTTON_HIDDEN_ON.includes(id));
  document.getElementById('globalBackBtn').classList.toggle('hidden', !shouldShow);
}

document.getElementById('globalBackBtn').addEventListener('click', () => {
  const prev = navHistory.pop();
  if (!prev) return;
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  prev.forEach(show);
  updateGlobalBackButton();
});

// ---------- الوضع الليلي/النهاري (دارك مود) ----------
function updateDarkModeButtonLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('darkModeIcon').textContent = isDark ? '☀️' : '🌙';
  document.getElementById('darkModeLabel').textContent = t(isDark ? 'nav_light_mode' : 'nav_dark_mode');
}
document.getElementById('darkModeToggleBtn').addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('zakiy-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('zakiy-theme', 'dark');
  }
  updateDarkModeButtonLabel();
});
updateDarkModeButtonLabel(); // يعكس الثيم اللي طُبّق مسبقًا بالسكربت المبكر أول الصفحة

function showError(id, msg) {
  document.getElementById(id).innerHTML = `<div class="error-msg">⚠️ ${msg}</div>`;
}
function clearError(id) {
  document.getElementById(id).innerHTML = '';
}
function setLoading(btn, loading, textDefault) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `${t('loading_processing')}<span class="spinner"></span>` : textDefault;
}
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function appendChatBubble(containerId, whoLabel, text, cls) {
  const container = document.getElementById(containerId);
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${cls}`;
  const whoEl = document.createElement('span');
  whoEl.className = 'who';
  whoEl.textContent = whoLabel;
  const textEl = document.createElement('div');
  textEl.textContent = text;
  bubble.appendChild(whoEl);
  bubble.appendChild(textEl);
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// ---------- تغبيش المحتوى وقت اختبار الفردي ----------
function blurForExam() {
  document.querySelectorAll('.blur-target').forEach(el => el.classList.add('blurred'));
  document.querySelectorAll('.exam-overlay').forEach(el => el.classList.remove('hidden'));
}
function unblurAfterExam() {
  document.querySelectorAll('.blur-target').forEach(el => el.classList.remove('blurred'));
  document.querySelectorAll('.exam-overlay').forEach(el => el.classList.add('hidden'));
}
document.querySelectorAll('.exam-overlay button').forEach(btn => {
  btn.addEventListener('click', () => {
    const reveal = confirm(t('exam_reveal_confirm'));
    if (reveal) {
      const targetId = btn.dataset.target;
      document.getElementById(targetId).classList.remove('blurred');
      btn.closest('.exam-overlay').classList.add('hidden');
    }
  });
});

// يوديك لفورم الانضمام مع تعبئة الكود تلقائيًا - يشتغل من رابط QR (?join=)
// ومن زر "انضم الآن" بدعوة صديق كلاهما
function goToJoinRoomWithCode(code) {
  pushNavSnapshot();
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('login-form'); hide('signup-form');
  show('room-join-form');
  document.getElementById('joinRoomCode').value = code.toUpperCase();
  updateGlobalBackButton();
}

