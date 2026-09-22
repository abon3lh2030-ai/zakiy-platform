// ============================================================================
// ---------- صفحات المنصة المستقلة ----------
// كل ملف HTML للمسارات يحمل نفس تطبيق ذكيّ ثم يفتح القسم المطلوب بعد استعادة
// جلسة Supabase. بهذه الطريقة يبقى السايد بار موحدًا، وتعمل الروابط المباشرة
// والتحديث وزر الرجوع، بدون نسخ منطق كل ميزة في أكثر من مكان.
// ============================================================================
const ZAKIY_PAGE_BY_BUTTON = {
  homeBtn: 'index.html',
  messagesBtn: 'messages.html',
  performanceBtn: 'performance.html',
  archiveBtn: 'archive.html',
  friendsBtn: 'friends.html',
  sidebarLibraryBtn: 'library.html',
  notesBtn: 'notes.html',
  sidebarAiHelpBtn: 'ai-assistant.html',
  smartQuranBtn: 'smart-quran.html',
  sidebarHandwritingBtn: 'handwriting.html',
  madrasatiBtn: 'madrasati.html',
  roboticsLabBtn: 'robotics-lab.html',
  scienceLabBtn: 'science-lab.html',
  studentScheduleNavBtn: 'schedule.html',
  assignmentsBtn: 'assignments.html',
  quizzesBtn: 'quizzes.html',
  gradesheetBtn: 'gradesheet.html',
  settingsBtn: 'settings.html',
  modeSoloBtn: 'solo-study.html',
  modeRoomBtn: 'group-study.html',
  modeClassroomBtn: 'live-class.html',
};

const ZAKIY_ENTRY_BUTTON = {
  messages: 'messagesBtn', performance: 'performanceBtn', archive: 'archiveBtn',
  friends: 'friendsBtn', library: 'sidebarLibraryBtn', notes: 'notesBtn',
  'ai-assistant': 'sidebarAiHelpBtn', 'smart-quran': 'smartQuranBtn',
  handwriting: 'sidebarHandwritingBtn', madrasati: 'madrasatiBtn',
  'robotics-lab': 'roboticsLabBtn', 'science-lab': 'scienceLabBtn',
  schedule: 'studentScheduleNavBtn', assignments: 'assignmentsBtn',
  quizzes: 'quizzesBtn', gradesheet: 'gradesheetBtn', settings: 'settingsBtn',
  'solo-study': 'modeSoloBtn', 'group-study': 'modeRoomBtn',
  'live-class': 'modeClassroomBtn',
};

let zakiyOpeningEntryPage = false;
let zakiyEntryPageOpened = false;
const zakiyRequestedEntryPage = window.ZAKIY_ENTRY_ROUTE
  || new URLSearchParams(location.search).get('entry')
  || '';

Object.entries(ZAKIY_PAGE_BY_BUTTON).forEach(([buttonId, page]) => {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.addEventListener('click', event => {
    if (zakiyOpeningEntryPage) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const route = Object.entries(ZAKIY_ENTRY_BUTTON).find(([, id]) => id === buttonId)?.[0];
    location.href = route ? `index.html?entry=${encodeURIComponent(route)}` : page;
  }, true);
});

function openZakiyEntryPage() {
  if (!zakiyRequestedEntryPage || zakiyEntryPageOpened || !currentAccessToken) return false;
  const buttonId = ZAKIY_ENTRY_BUTTON[zakiyRequestedEntryPage];
  if (!buttonId) return false;
  const button = document.getElementById(buttonId);
  if (!button || button.classList.contains('hidden')) return false;
  zakiyEntryPageOpened = true;
  zakiyOpeningEntryPage = true;
  button.click();
  zakiyOpeningEntryPage = false;
  const pageLabel = button.querySelector('.label')?.textContent?.trim()
    || button.textContent?.trim();
  if (pageLabel) document.title = `${pageLabel} — ذكيّ`;
  document.querySelectorAll('.sidebar-btn').forEach(item => item.classList.toggle('page-active', item.id === buttonId));
  const routePage = ZAKIY_PAGE_BY_BUTTON[buttonId];
  if (routePage && location.pathname.split('/').pop() !== routePage) {
    history.replaceState({ zakiyEntryRoute: zakiyRequestedEntryPage }, '', routePage);
  }
  return true;
}

if (zakiyRequestedEntryPage) {
  // استعادة الجلسة وجلب دور الحساب غير متزامنين؛ ننتظر إلى أن يظهر السايد بار
  // والزر المسموح لهذا الحساب، ثم نفتح الصفحة مرة واحدة فقط.
  let attempts = 0;
  const entryTimer = setInterval(() => {
    attempts += 1;
    if (openZakiyEntryPage() || attempts >= 200) clearInterval(entryTimer);
  }, 100);
  openZakiyEntryPage();
}

// أول رجوع داخل صفحة قسم مستقلة يعيد المستخدم للرئيسية الفعلية بدل إبقائه
// على رابط القسم بينما الواجهة تعرض الصفحة الرئيسية.
if (zakiyRequestedEntryPage) {
  const backButton = document.getElementById('globalBackBtn');
  backButton?.addEventListener('click', event => {
    if (!zakiyEntryPageOpened || (typeof navHistory !== 'undefined' && navHistory.length > 1)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = 'index.html';
  }, true);
}
