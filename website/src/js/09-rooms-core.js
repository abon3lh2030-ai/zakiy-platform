// ---------- اختيار الوضع ----------
let roomKind = 'quiz'; // 'quiz' | 'classroom' - يحدد نوع الغرفة اللي راح تُنشأ/تُنضم

document.getElementById('modeSoloBtn').addEventListener('click', () => {
  pushNavSnapshot();
  appMode = 'solo';
  // لو المستخدم كان قبل شوي بغرفة/كلاس (مضيف أو منحوه صلاحية) ورجع للرئيسية
  // بدون تحميل الصفحة من جديد، لازم نصفّر هالحالة - وإلا "مشاركة الملخص مع
  // الطلاب"/"ابدأ الاختبار للجميع" تطلع غلط بجلسة فردية جديدة (canManageContent
  // وcurrentRoomCode يفضلون من الغرفة القديمة، ما فيه شي يصفّرهم غير هنا)
  currentRoomCode = null;
  canManageContent = false;
  isHost = false;
  hide('mode-select');
  show('step-upload');
  show('pomodoroWidget');
  updateGlobalBackButton();
  loadUploadLibraryPicker();
});

function openRoomModeSelect(kind) {
  // لازم حساب مسجّل عشان تدخل أي درس مباشر أو جلسة جماعية (إنشاء أو
  // انضمام بكود) - ما فيه دخول كضيف إطلاقًا، نفس القيد اللي الباك إند يفرضه
  if (!requireAuthOrPrompt()) return;
  roomKind = kind;
  const isClassroom = kind === 'classroom';
  document.getElementById('roomModeSelectLabel').textContent = t(isClassroom ? 'room_mode_select_label_classroom' : 'room_mode_select_label_room');
  document.getElementById('roomModeSelectHeading').textContent = t(isClassroom ? 'room_mode_select_heading_classroom' : 'room_mode_select_heading_room');
  document.getElementById('roomCreateFormLabel').textContent = t(isClassroom ? 'room_create_form_label_classroom' : 'room_create_form_label_room');
  document.getElementById('roomCreateFormHeading').textContent = t(isClassroom ? 'room_create_form_heading_classroom' : 'room_create_form_heading_room');
  document.getElementById('roomCreateFormDesc').textContent = t(isClassroom ? 'room_create_form_desc_classroom' : 'room_create_form_desc_room');

  pushNavSnapshot();
  hide('mode-select');
  show('room-mode-select');
  updateGlobalBackButton();
}

document.getElementById('modeRoomBtn').addEventListener('click', () => openRoomModeSelect('quiz'));
document.getElementById('modeClassroomBtn').addEventListener('click', () => openRoomModeSelect('classroom'));

document.getElementById('roomCreateChooseBtn').addEventListener('click', () => {
  pushNavSnapshot();
  hide('room-mode-select');
  show('room-create-form');
  updateGlobalBackButton();
});

document.getElementById('roomJoinChooseBtn').addEventListener('click', () => {
  pushNavSnapshot();
  hide('room-mode-select');
  show('room-join-form');
  updateGlobalBackButton();
});

// ---------- إنشاء / الانضمام لغرفة ----------
document.getElementById('hostCreateBtn').addEventListener('click', async () => {
  const name = document.getElementById('hostNameInput').value.trim();
  clearError('roomCreateError');
  if (!name) { showError('roomCreateError', t('err_name_required')); return; }

  try {
    // لازم حساب مسجّل عشان تنشئ درس مباشر/جلسة جماعية (الباك إند يرفض
    // بدون توكن صالح على أي حال) - كانت هذي الفتحة ناقصة الهيدر أصلًا،
    // فكل حد يقدر ينشئ غرف بلا حدود بغض النظر عن باقته أو تسجيل دخوله
    const res = await fetch(`${API_BASE}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({ room_type: roomKind }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_create_room_failed'));

    myName = name;
    joinErrorTarget = 'roomCreateError';
    socket.emit('join_room', { room_code: data.room_code, name, client_id: clientId, token: currentAccessToken });
  } catch (err) {
    showError('roomCreateError', err.message || t('err_unexpected'));
  }
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('joinRoomCode').value.trim();
  const name = document.getElementById('joinName').value.trim();
  clearError('roomJoinError');
  if (!code || !name) { showError('roomJoinError', t('err_code_name_required')); return; }

  myName = name;
  joinErrorTarget = 'roomJoinError';
  socket.emit('join_room', { room_code: code, name, client_id: clientId, token: currentAccessToken });
});

socket.on('join_error', data => showError(joinErrorTarget, data.error));

// لو socket.io انقطع وأعاد الاتصال تلقائيًا (نت متقطع، Render إلخ)، نرجع
// ننضم لنفس الغرفة بنفس clientId عشان السيرفر يربط sid الجديد بمشاركتنا القديمة -
// وإلا كل رسائل الشات والتسليم بعده بترفض بصمت لأن الـ sid القديم صار ميت
socket.on('connect', () => {
  if (currentRoomCode) {
    socket.emit('join_room', { room_code: currentRoomCode, name: myName, client_id: clientId, token: currentAccessToken });
  }
  // نربط هذا الاتصال بحساب المستخدم (لو مسجّل دخول) عشان يستلم تنبيهاته
  // اللحظية بأي مكان بالموقع - يشمل إعادة الاتصال بعد انقطاع نت
  if (currentAccessToken) {
    socket.emit('register_user', { token: currentAccessToken });
  }
});

socket.on('room_state', data => {
  currentRoomCode = data.room_code;
  isHost = data.is_host;
  canManageContent = data.can_manage_content;
  roomCreatedAt = data.created_at;
  roomKind = data.room_type || 'quiz';
  chatEnabled = data.chat_enabled !== false;
  updateChatUI();

  // نسجّل خطوة تنقّل بس أول مرة يدخل الغرفة فعليًا - مو كل مرة يعيد الاتصال
  // (reconnect) بعد انقطاع نت، عشان زر الرجوع ما يتراكم بخطوات وهمية
  const roomScreenId = roomKind === 'classroom' ? 'step-classroom' : 'step-room';
  const enteringRoomForFirstTime = document.getElementById(roomScreenId).classList.contains('hidden');
  if (enteringRoomForFirstTime) pushNavSnapshot();

  // نخفي كل الشاشات الرئيسية (بدل قائمة يدوية قديمة) - يشمل لوحات المعلم/
  // المدرسة/الأدمن الجديدة، عشان لو معلم بدأ درس مباشر من لوحته ما تبقى
  // ظاهرة "تحت" شاشة الكلاس
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('login-form'); hide('signup-form'); hide('step-force-password-change');
  updateGlobalBackButton();

  if (roomKind === 'classroom') {
    hide('step-room');
    show('step-classroom');
    document.getElementById('classroomCodeBadge').textContent = currentRoomCode;
    enterClassroomVoiceSlot();
    initClassroomState(data);
    return;
  }

  hide('step-classroom');
  show('step-room');
  enterRoomVoiceSlot();
  document.getElementById('roomCodeBadge').textContent = currentRoomCode;
  startRoomElapsedTimer();

  if (data.quiz && !quizHasStarted) {
    // انضم بعد ما الاختبار بدأ فعليًا (حالة نادرة)، أو رجع بعد إعادة اتصال ولسا
    // ما بدأ الاختبار عنده محليًا - نعامله كأن الحدث وصله الحين
    handleQuizStarted({
      quiz: data.quiz,
      started_at: data.quiz_started_at,
      duration_minutes: data.duration_minutes,
    });
  } else if (!data.quiz && canManageContent && !uploadedFilename) {
    if (isHost) appMode = 'room-host';
    show('step-upload');
    loadUploadLibraryPicker();
  }
  // ملاحظة: لو quizHasStarted أصلًا شغال محليًا، ما نعيد استدعاء handleQuizStarted
  // عند إعادة الاتصال عشان ما نمسح إجابات المستخدم أو نعيد المؤقت من الصفر

  if (data.shared_summary) showSharedSummary(data.shared_summary);
});

function startRoomElapsedTimer() {
  if (roomElapsedIntervalId) clearInterval(roomElapsedIntervalId);
  roomElapsedIntervalId = setInterval(() => {
    const elapsed = Math.floor(Date.now() / 1000 - roomCreatedAt);
    document.getElementById('roomElapsedTimer').textContent = `${t('room_elapsed_prefix')}${formatTime(elapsed)}`;
  }, 1000);
}

// ---------- الكلاس المباشر (سبورة + رفع يد + لفة حظ + كتم) ----------
let classCurrentlyStarted = false;
let classroomRaisedHandIds = [];
let classroomParticipantsCache = [];
let classroomCtx = null;
let classroomDrawing = false;
let classroomCurrentColor = '#1B2A4A';
let classroomErasing = false;
let classroomTextMode = false;
let classroomMoveMode = false;
let classroomSelectedStrokeId = null;
let classroomBoardStrokes = [];
let handRaised = false;
let luckyDrawSpinIntervalId = null;

function enterClassroomVoiceSlot() {
  const voiceSlot = document.getElementById('classroomVoiceSlot');
  const voiceBox = document.getElementById('voiceChatBox');
  if (voiceBox.parentElement !== voiceSlot) voiceSlot.appendChild(voiceBox);
  const summarySlot = document.getElementById('classroomSummarySlot');
  const summaryBox = document.getElementById('sharedSummaryBox');
  if (summaryBox.parentElement !== summarySlot) summarySlot.appendChild(summaryBox);
  const chatSlot = document.getElementById('classroomChatSlot');
  const chatBox = document.getElementById('roomChatBox');
  if (chatBox.parentElement !== chatSlot) chatSlot.appendChild(chatBox);
}
function enterRoomVoiceSlot() {
  const slot = document.getElementById('participantsSection');
  const summaryBox = document.getElementById('sharedSummaryBox');
  if (summaryBox.parentElement !== slot) slot.insertBefore(summaryBox, slot.firstChild.nextSibling);
  const box = document.getElementById('voiceChatBox');
  if (box.parentElement !== slot) slot.appendChild(box);
  const chatBox = document.getElementById('roomChatBox');
  if (chatBox.parentElement !== slot) slot.insertBefore(chatBox, box);
}

// تحدّث كل عناصر الواجهة اللي تعتمد على "هل أنا مدرس/مفوّض له صلاحية الكتابة
// الحين" - تُستدعى أول ما ندخل الكلاس، وبرضو لحظيًا لو المضيف منح/سحب
// الصلاحية وأنت بنفس الكلاس (بدون ما تحتاج تعيد الانضمام)
function updateClassroomPermissionUI() {
  const isTeacher = canManageContent;
  document.getElementById('startClassBtn').classList.toggle('hidden', !isTeacher || classCurrentlyStarted);
  document.getElementById('classroomWaiting').classList.toggle('hidden', isTeacher || classCurrentlyStarted);
  document.getElementById('classroomTeacherToolbar').classList.toggle('hidden', !isTeacher);
  document.getElementById('raiseHandBtn').classList.toggle('hidden', isTeacher);
  document.getElementById('raiseHandBtn').textContent = t(handRaised ? 'btn_lower_hand' : 'btn_raise_hand');
  document.getElementById('luckyDrawSection').classList.toggle('hidden', !isTeacher);
  document.getElementById('startClassroomQuizBtn').classList.toggle('hidden', !isTeacher || quizHasStarted);
}

function initClassroomState(data) {
  classCurrentlyStarted = !!data.class_started;
  classroomBoardStrokes = data.board_strokes || [];
  classroomRaisedHandIds = data.raised_hands || [];
  handRaised = classroomRaisedHandIds.includes(clientId);
  classroomMoveMode = false;
  classroomSelectedStrokeId = null;

  document.getElementById('classroomBoardArea').classList.toggle('hidden', !classCurrentlyStarted);
  updateClassroomPermissionUI();
  hide('luckyDrawDisplay');

  if (classCurrentlyStarted) setupClassroomCanvas();
  renderRaisedHands();
}

document.getElementById('startClassBtn').addEventListener('click', () => {
  socket.emit('start_class', { room_code: currentRoomCode });
});
socket.on('class_started_event', () => {
  classCurrentlyStarted = true;
  hide('startClassBtn');
  hide('classroomWaiting');
  show('classroomBoardArea');
  setupClassroomCanvas();
});

// المدرس/المفوّض له يقدر يبدأ اختبار للطلاب من جوا الكلاس - يعيد استخدام نفس
// مسار الرفع/التلخيص/توليد الاختبار الموجود أصلًا للغرفة الجماعية بالضبط
// (step-upload/step-text/step-summary/step-quiz)، بدون ما يخفي السبورة
document.getElementById('startClassroomQuizBtn').addEventListener('click', () => {
  appMode = 'room-host';
  show('step-upload');
  loadUploadLibraryPicker();
  document.getElementById('step-upload').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('raiseHandBtn').addEventListener('click', () => {
  handRaised = !handRaised;
  document.getElementById('raiseHandBtn').textContent = t(handRaised ? 'btn_lower_hand' : 'btn_raise_hand');
  socket.emit('raise_hand', { room_code: currentRoomCode });
});

socket.on('hands_update', data => {
  classroomRaisedHandIds = (data.raised || []).map(h => h.client_id);
  (data.raised || []).forEach(h => {
    if (!classroomParticipantsCache.find(p => p.client_id === h.client_id)) {
      classroomParticipantsCache.push({ client_id: h.client_id, name: h.name });
    }
  });
  handRaised = classroomRaisedHandIds.includes(clientId);
  document.getElementById('raiseHandBtn').textContent = t(handRaised ? 'btn_lower_hand' : 'btn_raise_hand');
  renderRaisedHands();
});

function renderRaisedHands() {
  const container = document.getElementById('raisedHandsList');
  const luckyBtn = document.getElementById('luckyDrawBtn');
  if (!classroomRaisedHandIds.length) {
    container.innerHTML = `<p class="desc">${t('raised_hands_empty')}</p>`;
    if (luckyBtn) luckyBtn.classList.add('hidden');
    return;
  }
  if (luckyBtn && canManageContent) luckyBtn.classList.remove('hidden');
  container.innerHTML = classroomRaisedHandIds.map(cid => {
    const p = classroomParticipantsCache.find(x => x.client_id === cid);
    return `<div class="hand-raised-row"><span>🙋 ${p ? p.name : t('generic_student')}</span></div>`;
  }).join('');
}

function renderClassroomParticipants(leaderboard) {
  classroomParticipantsCache = leaderboard;
  const container = document.getElementById('classroomParticipantsList');
  container.innerHTML = leaderboard.map(p => `
    <div class="leaderboard-row">
      <span class="name">${p.name}${p.is_co_host ? ' 🖊️' : ''}${p.in_voice ? ' 🎙️' : ''}${classroomRaisedHandIds.includes(p.client_id) ? ' 🙋' : ''}</span>
      ${isHost && p.sid !== socket.id
        ? `<button class="ghost grant-board-btn" data-sid="${p.sid}" data-granted="${p.is_co_host}" style="padding:5px 10px; font-size:12px;">${p.is_co_host ? t('btn_revoke_board_permission') : t('btn_grant_board_permission')}</button>`
        : ''}
      ${isHost && p.sid !== socket.id
        ? `<button class="ghost force-mute-btn" data-sid="${p.sid}" style="padding:5px 10px; font-size:12px;">🔇 ${t('btn_mute_short')}</button>`
        : ''}
    </div>
  `).join('');
  container.querySelectorAll('.grant-board-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const event = btn.dataset.granted === 'true' ? 'revoke_permission' : 'grant_permission';
      socket.emit(event, { room_code: currentRoomCode, sid: btn.dataset.sid });
    });
  });
  container.querySelectorAll('.force-mute-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('force_mute_participant', { room_code: currentRoomCode, sid: btn.dataset.sid });
    });
  });
  renderRaisedHands();
}

socket.on('force_muted', () => {
  forceMuteVoiceForExam();
  alert(t('force_muted_alert'));
});

