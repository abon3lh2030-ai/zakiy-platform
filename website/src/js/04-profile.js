// ---------- شاشات الحساب (أدائي / الأرشيف / الأصدقاء / مكتبتي) - كل وحدة
// مستقلة بزر سايد بار خاص فيها، بدل ما تكون تبويبات جوا شاشة وحدة ----------
const ACCOUNT_SCREENS = ['step-performance', 'step-archive', 'step-friends', 'step-library', 'step-settings', 'step-profile', 'step-notes', 'step-note-editor', 'step-assignments', 'step-assignment-detail', 'step-ai-list', 'step-ai-conversation', 'step-ai-book-picker', 'step-ai-book-scope', 'step-quizzes', 'step-quiz-create', 'step-quiz-detail', 'step-quiz-take', 'step-gradesheet', 'step-madrasati', 'step-lesson-prep', 'step-enrichment', 'step-results-analysis', 'step-homework-help', 'step-study-plan'];
function showAccountScreen(id) {
  ['login-form', 'signup-form', 'step-force-password-change', 'mode-select', 'room-mode-select', 'room-create-form',
   'room-join-form', 'step-room', 'step-classroom', 'step-upload', 'step-text', 'step-chat', 'step-summary', 'step-quiz',
   'step-admin-dashboard', 'step-school-dashboard', 'step-teacher-dashboard', 'step-student-schedule', 'step-messages',
   ...ACCOUNT_SCREENS]
    .forEach(hide);
  show(id);
}
function showPerformanceDashboard() { showAccountScreen('step-performance'); }
function showLibraryScreen() { showAccountScreen('step-library'); }
function showArchiveScreen() { showAccountScreen('step-archive'); }
function showFriendsScreen() { showAccountScreen('step-friends'); }
function showSettingsScreen() { showAccountScreen('step-settings'); loadSubscriptionSection(); }
function showProfileScreen() { showAccountScreen('step-profile'); }
function showNotesScreen() { showAccountScreen('step-notes'); loadNotesScreen(); }
function showAssignmentsScreen() { showAccountScreen('step-assignments'); loadAssignmentsScreen(); }
function showAiListScreen() { showAccountScreen('step-ai-list'); loadAiConversationsList(); }
function showQuizzesScreen() { showAccountScreen('step-quizzes'); loadQuizzesScreen(); }
function showGradesheetScreen() { showAccountScreen('step-gradesheet'); loadGradesheetScreen(); }
function showMadrasatiScreen() { showAccountScreen('step-madrasati'); loadMadrasatiScreen(); }

// ---------- صفحة البروفايل (بروفايلك أو بروفايل شخص ثاني) ----------
async function showProfileScreen(userId) {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showAccountScreen('step-profile');
  updateGlobalBackButton();

  document.getElementById('profileUsername').textContent = '...';
  document.getElementById('profileAvatar').textContent = '';
  hide('profileSchool'); hide('profileBio'); hide('profilePrivateNotice'); hide('profileNoSectionsNotice');
  hide('profileShowQrBtn'); hide('profileAddFriendBtn'); hide('profileFriendBadge');
  ['profilePerformanceSection', 'profileLibrarySection', 'profileArchiveSection', 'profileFriendsSection'].forEach(hide);

  try {
    const res = await fetch(`${API_BASE}/api/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_unexpected'));
    renderProfile(data);
  } catch (err) {
    document.getElementById('profileUsername').textContent = err.message || t('err_unexpected');
  }
}

function renderProfile(data) {
  document.getElementById('profileUsername').textContent = data.username;
  document.getElementById('profileAvatar').textContent = (data.username || '?').trim().charAt(0).toUpperCase();

  if (data.is_owner) {
    show('profileShowQrBtn');
    document.getElementById('profileShowQrBtn').onclick = () => openProfileQrModal(data.user_id, data.username);
  } else if (data.friend_status !== 'self') {
    renderProfileFriendAction(data);
  }

  if (data.is_private && !data.is_owner) {
    show('profilePrivateNotice');
    return;
  }

  if (data.school_name) { document.getElementById('profileSchool').textContent = `🏫 ${data.school_name}`; show('profileSchool'); }
  if (data.bio) { document.getElementById('profileBio').textContent = data.bio; show('profileBio'); }

  let anySectionShown = false;

  if (data.performance) {
    anySectionShown = true;
    show('profilePerformanceSection');
    document.getElementById('profileStatAttempts').textContent = data.performance.attempts_count;
    document.getElementById('profileStatAvg').textContent = `${data.performance.avg_score}%`;
    document.getElementById('profileStatMinutes').textContent = data.performance.total_study_minutes;
    if (data.performance.current_streak >= 3) {
      document.getElementById('profileStreakText').textContent = t('streak_days_suffix', { n: data.performance.current_streak });
      show('profileStreakBadge');
    } else {
      hide('profileStreakBadge');
    }
  }

  if (data.library) {
    anySectionShown = true;
    show('profileLibrarySection');
    const listEl = document.getElementById('profileLibraryList');
    listEl.innerHTML = data.library.count
      ? data.library.titles.map(title => `<div class="profile-library-row">📄 ${title}</div>`).join('')
      : `<p class="desc">${t('library_empty')}</p>`;
  }

  if (data.archive) {
    anySectionShown = true;
    show('profileArchiveSection');
    const listEl = document.getElementById('profileArchiveList');
    listEl.innerHTML = data.archive.length
      ? data.archive.map(archiveSessionCardHtml).join('')
      : `<p class="desc">${t('archive_empty')}</p>`;
  }

  if (data.friends) {
    anySectionShown = true;
    show('profileFriendsSection');
    const listEl = document.getElementById('profileFriendsListDisplay');
    listEl.innerHTML = data.friends.count
      ? data.friends.list.map(f => `<div class="profile-friend-row view-profile-link" data-id="${f.user_id}" style="cursor:pointer;">👤 ${f.username}</div>`).join('')
      : `<p class="desc">${t('friends_list_empty')}</p>`;
    wireViewProfileLinks(listEl);
  }

  if (!anySectionShown && !data.is_owner) show('profileNoSectionsNotice');
}

function renderProfileFriendAction(data) {
  const btn = document.getElementById('profileAddFriendBtn');
  const badge = document.getElementById('profileFriendBadge');
  if (data.friend_status === 'friends') {
    badge.textContent = `✅ ${t('friend_status_friends')}`;
    show('profileFriendBadge');
  } else if (data.friend_status === 'pending_sent') {
    badge.textContent = `⏳ ${t('friend_status_pending_sent')}`;
    show('profileFriendBadge');
  } else if (data.friend_status === 'pending_received') {
    badge.textContent = `📨 ${t('friend_status_pending_received')}`;
    show('profileFriendBadge');
  } else {
    show('profileAddFriendBtn');
    btn.disabled = false;
    btn.textContent = t('btn_add_friend_short');
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/api/friends/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
          body: JSON.stringify({ to_user_id: data.user_id }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        btn.textContent = `✅ ${t('friend_request_sent')}`;
      } catch (err) {
        btn.disabled = false;
        alert(err.message || t('err_friend_request_failed'));
      }
    };
  }
}

function goToHomeScreen() {
  pushNavSnapshot();
  if (currentUserRole && INSTITUTIONAL_DASHBOARD_SCREENS[currentUserRole]) {
    routeByRole(currentUserRole);
  } else {
    TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
    hide('login-form'); hide('signup-form');
    show('mode-select');
  }
  updateGlobalBackButton();
}
document.getElementById('homeBtn').addEventListener('click', goToHomeScreen);

document.getElementById('performanceBtn').addEventListener('click', async () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showPerformanceDashboard();
  updateGlobalBackButton();
  if (currentUsername) {
    document.getElementById('performanceHeading').textContent = t('performance_heading_named', { name: currentUsername });
  }
  try {
    const res = await fetch(`${API_BASE}/api/performance`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_fetch_performance'));
    renderPerformance(data);
  } catch (err) {
    document.getElementById('performanceEmptyState').textContent = err.message || t('err_unexpected');
    show('performanceEmptyState');
    hide('performanceContent');
  }
});

document.getElementById('archiveBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showArchiveScreen();
  updateGlobalBackButton();
  loadArchive();
});
document.getElementById('friendsBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showFriendsScreen();
  updateGlobalBackButton();
  loadFriends();
});
document.getElementById('notesBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showNotesScreen();
  updateGlobalBackButton();
});
document.getElementById('assignmentsBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showAssignmentsScreen();
  updateGlobalBackButton();
});
document.getElementById('quizzesBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showQuizzesScreen();
  updateGlobalBackButton();
});
document.getElementById('gradesheetBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showGradesheetScreen();
  updateGlobalBackButton();
});
document.getElementById('madrasatiBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showMadrasatiScreen();
  updateGlobalBackButton();
});

async function loadArchive() {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderArchive(data.sessions || []);
  } catch (err) {
    document.getElementById('archiveList').innerHTML = '';
  }
}

// يبني سطر مشارك واحد: الاسم + شارة 👑 للمضيف + الدرجة إن وجدت (اختبار
// انعقد) - يشتغل بالأرشيف الشخصي وبقسم الأرشيف داخل صفحة البروفايل كلاهما
function archiveParticipantLine(p) {
  const hostTag = p.is_host ? ' 👑' : '';
  const scoreTag = (p.total != null && p.total > 0) ? ` — ${p.score} / ${p.total}` : '';
  return `${p.name || t('archive_unknown')}${hostTag}${scoreTag}`;
}

function archiveSessionCardHtml(s) {
  const typeLabel = s.room_type === 'classroom' ? t('mode_classroom') : t('mode_room');
  const date = s.created_at ? new Date(s.created_at).toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US') : '';
  const participants = s.participants || [];
  const rows = participants.length
    ? participants.map(p => `<div class="profile-archive-row"><span class="archive-participant${p.is_host ? ' is-host' : ''}">${archiveParticipantLine(p)}</span></div>`).join('')
    : `<p class="desc">${t('archive_no_one')}</p>`;
  return `
    <div class="archive-row" style="flex-direction:column; align-items:stretch;">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <strong>${typeLabel} — ${s.room_code}</strong>
        <span class="desc">${date}</span>
      </div>
      <span class="desc" style="margin:6px 0 8px;">${t('archive_host_prefix')}: ${s.host_name || t('archive_unknown')}</span>
      ${rows}
    </div>
  `;
}

function renderArchive(sessions) {
  if (!sessions.length) {
    show('archiveEmptyState');
    document.getElementById('archiveList').innerHTML = '';
    return;
  }
  hide('archiveEmptyState');
  document.getElementById('archiveList').innerHTML = sessions.map(archiveSessionCardHtml).join('');
}

