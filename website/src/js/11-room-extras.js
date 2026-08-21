// ---------- لفة الحظ ----------
document.getElementById('luckyDrawBtn').addEventListener('click', () => {
  if (!classroomRaisedHandIds.length) return;
  runLuckyDrawSpin();
  socket.emit('lucky_draw', { room_code: currentRoomCode });
});

function runLuckyDrawSpin() {
  const display = document.getElementById('luckyDrawDisplay');
  display.classList.remove('winner');
  show('luckyDrawDisplay');
  const names = classroomRaisedHandIds.map(cid => {
    const p = classroomParticipantsCache.find(x => x.client_id === cid);
    return p ? p.name : t('generic_student');
  });
  let i = 0;
  clearInterval(luckyDrawSpinIntervalId);
  luckyDrawSpinIntervalId = setInterval(() => {
    display.textContent = '🎡 ' + names[i % names.length];
    i++;
  }, 100);
}
socket.on('lucky_draw_result', data => {
  clearInterval(luckyDrawSpinIntervalId);
  const display = document.getElementById('luckyDrawDisplay');
  display.textContent = `🎉 ${data.winner_name}`;
  display.classList.add('winner');
  show('luckyDrawDisplay');
});
socket.on('lucky_draw_error', data => {
  clearInterval(luckyDrawSpinIntervalId);
  alert(data.error || t('err_lucky_draw_failed'));
});

// ---------- لوحة الصدارة / المشاركين ----------
const MEDALS = ['🥇', '🥈', '🥉'];
function renderPodium(leaderboard) {
  const podium = document.getElementById('podiumContainer');
  const top3 = leaderboard.filter(p => p.finished).slice(0, 3);
  if (!top3.length) { podium.classList.add('hidden'); podium.innerHTML = ''; return; }

  podium.classList.remove('hidden');
  podium.innerHTML = top3.map((p, i) => `
    <div class="podium-card">
      <div class="medal">${MEDALS[i]}</div>
      <div class="p-name">${p.name}</div>
      <div class="p-score">${p.score} / ${p.total}</div>
      <div class="p-time">⏱️ ${formatTime(p.time_taken)}</div>
    </div>
  `).join('');
}

function renderLeaderboard(leaderboard) {
  renderPodium(leaderboard);
  const container = document.getElementById('leaderboardContainer');
  container.innerHTML = leaderboard.map((p, i) => `
    <div class="leaderboard-row ${p.finished ? 'finished' : ''}">
      <span class="rank">${i + 1}</span>
      <span class="name">${p.name}${p.is_co_host ? ' 🔑' : ''}${p.in_voice ? ' 🎙️' : ''}</span>
      ${p.finished
        ? `<span class="score">${p.score} / ${p.total} ✅ — ⏱️ ${formatTime(p.time_taken)}</span>`
        : `<span class="status">${quizHasStarted ? t('status_still_solving') : t('status_waiting_quiz')}</span>`}
      ${isHost && p.sid !== socket.id && !quizHasStarted
        ? `<button class="ghost grant-btn" data-sid="${p.sid}" data-granted="${p.is_co_host}" style="padding:5px 10px; font-size:12px;">${p.is_co_host ? t('btn_revoke_permission') : t('btn_grant_permission')}</button>`
        : ''}
      ${isHost && p.sid !== socket.id
        ? `<button class="ghost kick-btn" data-sid="${p.sid}" style="padding:5px 12px; font-size:12.5px;">🚫 ${t('btn_kick')}</button>`
        : ''}
    </div>
  `).join('');

  if (isHost) {
    container.querySelectorAll('.kick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('kick_participant', { room_code: currentRoomCode, sid: btn.dataset.sid });
      });
    });
    container.querySelectorAll('.grant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const event = btn.dataset.granted === 'true' ? 'revoke_permission' : 'grant_permission';
        socket.emit(event, { room_code: currentRoomCode, sid: btn.dataset.sid });
      });
    });
  }
}
socket.on('leaderboard_update', data => {
  if (roomKind === 'classroom') {
    renderClassroomParticipants(data.leaderboard);
    return;
  }
  renderLeaderboard(data.leaderboard);
  if (quizFinished && currentRoomCode) updateMyResultBox(data.leaderboard);
});

// ---------- تقييم الجلسة التلقائي (فردي وجماعي) ----------
function ratingHtml(rating) {
  if (!rating || !rating.stars) return '';
  const filled = '★'.repeat(rating.stars);
  const empty = '☆'.repeat(5 - rating.stars);
  return `<div class="session-rating"><span class="stars">${filled}${empty}</span> ${rating.label}${rating.fast ? `<span class="fast-badge">⚡ ${t('rating_fast')}</span>` : ''}</div>`;
}

let latestRoomRating = null;
socket.on('session_rating', data => {
  latestRoomRating = data;
  const box = document.getElementById('myResultBox');
  const banner = box.querySelector('.my-result-banner');
  if (!box.classList.contains('hidden') && banner) {
    const existing = box.querySelector('.session-rating');
    if (existing) existing.remove();
    banner.insertAdjacentHTML('beforeend', ratingHtml(latestRoomRating));
  }
});

function updateMyResultBox(leaderboard) {
  const myIndex = leaderboard.findIndex(p => p.sid === socket.id);
  if (myIndex === -1) return;
  const me = leaderboard[myIndex];
  const box = document.getElementById('myResultBox');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="my-result-banner">
      <div>${t('your_score')}</div>
      <div class="big">${me.score} / ${me.total}</div>
      <div>⏱️ ${t('time_label')}: ${formatTime(me.time_taken)} — ${t('your_rank')}: #${myIndex + 1}</div>
      ${ratingHtml(latestRoomRating)}
    </div>
  `;
}

socket.on('kicked', () => {
  alert(t('kicked_alert'));
  location.reload();
});

// ---------- منح/سحب صلاحية الرفع والتوليد وبدء الاختبار (كويز) / الكتابة بالسبورة (كلاس) ----------
socket.on('permission_granted', () => {
  canManageContent = true;
  updateChatUI();
  if (roomKind === 'classroom') {
    updateClassroomPermissionUI();
    return;
  }
  if (!uploadedFilename && !quizHasStarted) {
    show('step-upload');
    loadUploadLibraryPicker();
    document.getElementById('step-upload').scrollIntoView({ behavior: 'smooth' });
  }
});
socket.on('permission_revoked', () => {
  canManageContent = false;
  updateChatUI();
  if (roomKind === 'classroom') {
    updateClassroomPermissionUI();
    return;
  }
  if (!isHost && !quizHasStarted) {
    hide('step-upload'); hide('step-text'); hide('step-chat'); hide('step-summary');
    hide('step-quiz'); hide('hostQuizControls'); hide('shareSummaryBtn');
  }
});

// ---------- شات الغرفة ----------
socket.on('chat_message', data => {
  const cls = data.name === myName ? 'me' : 'other';
  appendChatBubble('chatMessages', data.name, data.message, cls);
});

// زر قفل/فتح الشات - يظهر بس للمدرس/الهوست (أو منضم منحه صلاحية)، ولما يكون
// الشات مقفول ينختفي صندوق الكتابة عن الجميع (نفس ما الباك إند يفرضه أصلًا)
function updateChatUI() {
  const toggleBtn = document.getElementById('chatToggleBtn');
  toggleBtn.classList.toggle('hidden', !canManageContent);
  toggleBtn.textContent = t(chatEnabled ? 'btn_chat_lock' : 'btn_chat_unlock');
  document.getElementById('chatInputRow').classList.toggle('hidden', !chatEnabled);
  document.getElementById('chatLockedNote').classList.toggle('hidden', chatEnabled);
}
document.getElementById('chatToggleBtn').addEventListener('click', () => {
  if (!currentRoomCode) return;
  socket.emit('toggle_chat', { room_code: currentRoomCode });
});
socket.on('chat_state', data => {
  chatEnabled = !!data.enabled;
  updateChatUI();
});

function sendRoomChat() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message || !currentRoomCode) return;
  socket.emit('chat_message', { room_code: currentRoomCode, message });
  input.value = '';
  clearTimeout(typingTimeoutId);
  socket.emit('stop_typing', { room_code: currentRoomCode });
}
document.getElementById('chatSendBtn').addEventListener('click', sendRoomChat);
document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendRoomChat();
});

// ---------- مؤشر "فلان يكتب الآن..." بشات الغرفة ----------
let typingTimeoutId = null;
const typingPeers = new Map(); // الاسم -> معرّف مؤقت انتهاء الصلاحية (احتياط لو ما وصل stop_typing)

function renderTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  const names = [...typingPeers.keys()];
  if (!names.length) { el.textContent = ''; return; }
  el.textContent = names.length === 1
    ? t('typing_one', { name: names[0] })
    : t('typing_many', { names: names.join(currentLang === 'ar' ? '، ' : ', ') });
}

document.getElementById('chatInput').addEventListener('input', () => {
  if (!currentRoomCode) return;
  socket.emit('typing', { room_code: currentRoomCode });
  clearTimeout(typingTimeoutId);
  typingTimeoutId = setTimeout(() => {
    socket.emit('stop_typing', { room_code: currentRoomCode });
  }, 2000);
});

socket.on('user_typing', data => {
  clearTimeout(typingPeers.get(data.name));
  typingPeers.set(data.name, setTimeout(() => {
    typingPeers.delete(data.name);
    renderTypingIndicator();
  }, 3000));
  renderTypingIndicator();
});

socket.on('user_stop_typing', data => {
  clearTimeout(typingPeers.get(data.name));
  typingPeers.delete(data.name);
  renderTypingIndicator();
});

// ---------- الهوست: مشاركة الملخص مع المنضمين ----------
document.getElementById('shareSummaryBtn').addEventListener('click', () => {
  const summary = document.getElementById('summaryText').textContent;
  if (!summary || !currentRoomCode) return;
  socket.emit('share_summary', { room_code: currentRoomCode, summary });

  const btn = document.getElementById('shareSummaryBtn');
  const original = btn.textContent;
  btn.textContent = `✅ ${t('summary_shared_done')}`;
  setTimeout(() => { btn.textContent = original; }, 2000);
});

function showSharedSummary(summary) {
  document.getElementById('sharedSummaryText').textContent = summary;
  show('sharedSummaryBox');
}
socket.on('summary_shared', data => showSharedSummary(data.summary));

