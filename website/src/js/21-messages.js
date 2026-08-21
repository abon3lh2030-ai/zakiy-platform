// ============================================================================
// ---------- الرسائل + التنبيهات ----------
// ============================================================================

let activeThreadUserId = null;

async function refreshUnreadBadge() {
  if (!currentAccessToken) return;
  try {
    const data = await apiCall('GET', '/api/notifications');
    const badge = document.getElementById('messagesUnreadBadge');
    if (data.unread_count > 0) {
      badge.textContent = data.unread_count > 99 ? '99+' : data.unread_count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch { /* غير حرج */ }
}
socket.on('new_notification', () => refreshUnreadBadge());

function showMessagesScreen() {
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('login-form'); hide('signup-form');
  show('sidebar');
  show('step-messages');
  loadConversations();
  loadNotifications();
}

document.getElementById('messagesBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showMessagesScreen();
  updateGlobalBackButton();
});

document.querySelectorAll('#step-messages .role-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('#step-messages .role-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    document.querySelectorAll('#step-messages .msg-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`msgTab-${tabBtn.dataset.msgTab}`).classList.remove('hidden');
    if (tabBtn.dataset.msgTab === 'notifications') loadNotifications();
  });
});

async function loadConversations() {
  const list = document.getElementById('conversationsList');
  list.innerHTML = t('loading');
  try {
    const data = await apiCall('GET', '/api/messages/conversations');
    if (!data.conversations.length) { list.innerHTML = `<p class="desc">${t('no_conversations_yet')}</p>`; return; }
    list.innerHTML = data.conversations.map(c => `
      <div class="friend-row" data-open-thread="${c.user_id}" data-username="${escapeHtml(c.username)}" style="cursor:pointer;">
        <div>
          <div style="font-weight:700;">${escapeHtml(c.username)}${c.unread_count ? ` <span class="unread-badge">${c.unread_count}</span>` : ''}</div>
          <div class="desc" style="margin:2px 0 0;">${escapeHtml((c.last_message || '').slice(0, 60))}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-open-thread]').forEach(row => {
      row.addEventListener('click', () => openThread(row.dataset.openThread, row.dataset.username));
    });
  } catch (e) {
    list.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

async function openThread(userId, username) {
  activeThreadUserId = userId;
  document.getElementById('activeThreadBox').classList.remove('hidden');
  document.getElementById('activeThreadTitle').textContent = username;
  const container = document.getElementById('threadMessages');
  container.innerHTML = '';
  try {
    const data = await apiCall('GET', `/api/messages/thread/${userId}`);
    data.messages.forEach(m => {
      appendChatBubble('threadMessages', m.sender_id === currentUserId ? t('you_label') : username, m.body,
        m.sender_id === currentUserId ? 'me' : 'other');
    });
    refreshUnreadBadge();
    loadConversations();
  } catch (e) {
    showError('threadInput', e.message);
  }
}

async function sendThreadMessage() {
  const input = document.getElementById('threadInput');
  const body = input.value.trim();
  if (!body || !activeThreadUserId) return;
  input.value = '';
  try {
    await apiCall('POST', '/api/messages/send', { recipient_id: activeThreadUserId, body });
    appendChatBubble('threadMessages', t('you_label'), body, 'me');
    loadConversations();
  } catch (e) {
    alert(e.message);
  }
}
document.getElementById('threadSendBtn').addEventListener('click', sendThreadMessage);
document.getElementById('threadInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendThreadMessage(); });

let searchDebounceId = null;
document.getElementById('newConversationSearch').addEventListener('input', () => {
  clearTimeout(searchDebounceId);
  const q = document.getElementById('newConversationSearch').value.trim();
  const results = document.getElementById('newConversationResults');
  if (!q) { results.innerHTML = ''; return; }
  searchDebounceId = setTimeout(async () => {
    try {
      const data = await apiCall('GET', `/api/friends/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = data.results.map(u => `
        <div class="friend-row" data-start-thread="${u.user_id}" data-username="${escapeHtml(u.username)}" style="cursor:pointer;">
          <div style="font-weight:600;">${escapeHtml(u.username)}</div>
          <span class="link-btn">${t('btn_message')}</span>
        </div>
      `).join('') || `<p class="desc">${t('no_users_found')}</p>`;
      results.querySelectorAll('[data-start-thread]').forEach(row => {
        row.addEventListener('click', () => {
          document.getElementById('newConversationSearch').value = '';
          results.innerHTML = '';
          openThread(row.dataset.startThread, row.dataset.username);
        });
      });
    } catch { /* غير حرج */ }
  }, 300);
});

const NOTIF_ICONS = { new_message: '💬', broadcast: '📢', schedule_reminder: '⏰', class_started: '🖍️' };
// العنوان مخزّن دايمًا بصيغة "رسالة جديدة من {الاسم}" - نستخرج الاسم منه
// بدل ما نضيف حقل ثاني بالباك إند لغرض تجميلي بس
function notificationSenderName(title) {
  const parts = title.split('من ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : title;
}
async function loadNotifications() {
  const list = document.getElementById('notificationsList');
  list.innerHTML = t('loading');
  try {
    const data = await apiCall('GET', '/api/notifications');
    if (!data.notifications.length) { list.innerHTML = `<p class="desc">${t('no_notifications_yet')}</p>`; return; }
    list.innerHTML = data.notifications.map(n => `
      <div class="friend-row" style="align-items:flex-start; ${n.read_at ? '' : 'border-color:var(--teal);'}">
        <div>
          <div style="font-weight:700;">${NOTIF_ICONS[n.type] || '🔔'} ${escapeHtml(n.title)}</div>
          ${n.body ? `<div class="desc" style="margin:4px 0;">${escapeHtml(n.body)}</div>` : ''}
          <div class="desc" style="font-size:12px;">${new Date(n.created_at).toLocaleString(currentLang === 'ar' ? 'ar' : 'en')}</div>
          ${n.type === 'schedule_reminder' && n.related_class_id
            ? `<button class="ghost" data-start-class-now="${n.related_class_id}" style="padding:4px 10px; margin-top:6px;">${t('btn_start_now')}</button>`
            : ''}
          ${n.type === 'class_started' && n.related_room_code
            ? `<button class="ghost" data-join-class-now="${n.related_room_code}" style="padding:4px 10px; margin-top:6px;">${t('btn_join_class_now')}</button>`
            : ''}
          ${n.type === 'new_message' && n.sender_id
            ? `<button class="ghost" data-open-thread="${n.sender_id}" data-username="${escapeHtml(notificationSenderName(n.title))}" style="padding:4px 10px; margin-top:6px;">${t('btn_open_conversation')}</button>`
            : ''}
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-start-class-now]').forEach(btn => {
      btn.addEventListener('click', () => goToTeacherClassAndStart(btn.dataset.startClassNow));
    });
    list.querySelectorAll('[data-join-class-now]').forEach(btn => {
      btn.addEventListener('click', () => joinClassByCode(btn.dataset.joinClassNow));
    });
    list.querySelectorAll('[data-open-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        showAccountScreen('step-messages');
        openThread(btn.dataset.openThread, btn.dataset.username);
      });
    });
    apiCall('POST', '/api/notifications/mark-read', {}).then(refreshUnreadBadge).catch(() => {});
  } catch (e) {
    list.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

// من إشعار تذكير الحصة - يوديك للوحة المعلم، يختار الفصل تلقائيًا، ويبدأ
// الدرس المباشر بنفس زر teacherStartClassBtn الموجود
function goToTeacherClassAndStart(classId) {
  routeByRole('teacher');
  setTimeout(() => {
    const select = document.getElementById('teacherClassSelect');
    if ([...select.options].some(o => o.value === classId)) select.value = classId;
    document.getElementById('teacherStartClassBtn').click();
  }, 400);
}

// من إشعار "الحصة بدأت الآن" - ينضم الطالب مباشرة لغرفة المعلم بنفس كود
// الغرفة المرفق بالإشعار، بدون ما يحتاج يكتب الكود يدويًا
function joinClassByCode(roomCode) {
  myName = currentUsername;
  joinErrorTarget = 'roomJoinError';
  socket.emit('join_room', { room_code: roomCode, name: myName, client_id: clientId, token: currentAccessToken });
}

