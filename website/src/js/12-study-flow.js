// ---------- Step 1: Upload (فردي أو الهوست) ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileChip = document.getElementById('fileChip');
const fileName = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const removeFile = document.getElementById('removeFile');

let selectedFile = null;

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (file.type !== 'application/pdf') {
    showError('uploadError', t('err_must_be_pdf'));
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  fileChip.classList.add('show');
  uploadBtn.disabled = false;
  clearError('uploadError');
}

removeFile.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileChip.classList.remove('show');
  uploadBtn.disabled = true;
});

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  clearError('uploadError');
  setLoading(uploadBtn, true, t('btn_upload_process'));

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    // "مذاكرة فردية" بس (appMode==='solo' وما فيه غرفة) تحسب من حد الباقة
    // اليومي - رفع مادة داخل غرفة أنشأها المضيف أصلًا ما يُحسب مرة ثانية
    // (انفحص وقت إنشاء الغرفة نفسها)
    if (appMode === 'solo' && !currentRoomCode) formData.append('context', 'solo');

    const uploadRes = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST', body: formData,
      headers: currentAccessToken ? { 'Authorization': `Bearer ${currentAccessToken}` } : {},
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      if (uploadRes.status === 402) offerTrialAtPaywall();
      throw new Error(uploadData.error || t('err_upload_failed'));
    }

    uploadedFilename = uploadData.filename;

    const extractRes = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadedFilename })
    });
    const extractData = await extractRes.json();
    if (!extractRes.ok) throw new Error(extractData.error || t('err_extract_failed'));

    setStudyText(extractData.text);
    show('step-text');
    if (appMode === 'solo') show('step-chat');
    if (currentAccessToken) show('saveToLibraryBtn');
    document.getElementById('step-text').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError('uploadError', err.message || t('err_server_down'));
  } finally {
    setLoading(uploadBtn, false, t('btn_upload_process'));
  }
});

// ---------- شات الذكاء الاصطناعي (فردي) ----------
document.getElementById('aiChatSendBtn').addEventListener('click', sendAIChat);
document.getElementById('aiChatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendAIChat();
});

async function sendAIChat(options = {}) {
  if (!options || options instanceof Event) options = {};
  const input = document.getElementById('aiChatInput');
  const message = (options.message || input.value).trim();
  if (!message) return null;
  clearError('aiChatError');
  appendChatBubble('aiChatMessages', t('chat_you'), message, 'me');
  input.value = '';

  try {
    const body = { message, lang: currentLang, voice_mode: Boolean(options.voiceMode) };
    if (chatInteractionId) {
      body.interaction_id = chatInteractionId;
    } else {
      if (!extractedText) throw new Error(t('study_scope_pick_one'));
      body.context = extractedText;
      if (currentUsername) body.name = currentUsername;
    }

    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_chat_failed'));

    chatInteractionId = data.interaction_id;
    appendChatBubble('aiChatMessages', t('chat_zakiy'), data.reply, 'ai');
    return data.reply;
  } catch (err) {
    showError('aiChatError', err.message || t('err_unexpected'));
    return null;
  }
}

// ---------- Step 2: Summarize ----------
const summarizeBtn = document.getElementById('summarizeBtn');
summarizeBtn.addEventListener('click', async () => {
  clearError('summarizeError');
  setLoading(summarizeBtn, true, t('btn_summarize'));

  try {
    const res = await fetch(`${API_BASE}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: extractedText, lang: currentLang })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_summarize_failed'));

    document.getElementById('summaryText').textContent = data.summary;
    show('step-summary');
    if (canManageContent && currentRoomCode) show('shareSummaryBtn');
    document.getElementById('step-summary').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError('summarizeError', err.message || t('err_unexpected'));
  } finally {
    setLoading(summarizeBtn, false, t('btn_summarize'));
  }
});

// ---------- Step 3: Generate quiz ----------
const quizBtn = document.getElementById('quizBtn');
quizBtn.addEventListener('click', async () => {
  clearError('quizError');
  setLoading(quizBtn, true, t('btn_generate_quiz'));

  try {
    let numQuestions = parseInt(document.getElementById('numQuestionsInput').value, 10);
    if (isNaN(numQuestions)) numQuestions = 5;
    numQuestions = Math.min(20, Math.max(5, numQuestions));

    const res = await fetch(`${API_BASE}/api/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: extractedText, num_questions: numQuestions, lang: currentLang })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_quiz_gen_failed'));

    let raw = data.quiz_raw.trim();
    raw = raw.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    quizData = JSON.parse(raw);

    renderQuiz();
    show('step-quiz');
    updateGlobalBackButton();
    if (canManageContent && currentRoomCode) show('hostQuizControls');
    if (appMode === 'solo') {
      quizStartTime = Date.now() / 1000;
      blurForExam();
    }
    document.getElementById('step-quiz').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError('quizError', t('err_quiz_gen_parse_failed'));
  } finally {
    setLoading(quizBtn, false, t('btn_generate_quiz'));
  }
});

function renderQuiz() {
  const container = document.getElementById('quizContainer');
  container.innerHTML = '';
  quizData.forEach((q, i) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'question';
    qDiv.innerHTML = `
      <div class="q-num">${t('question_label', { n: i + 1 })}</div>
      <div class="q-text">${q.question}</div>
      <div class="options" data-qindex="${i}">
        ${q.options.map(opt => `<div class="option" data-value="${opt}">${opt}</div>`).join('')}
      </div>
      <div class="explanation hidden" id="explanation-${i}"></div>
    `;
    container.appendChild(qDiv);
  });

  container.querySelectorAll('.option').forEach(opt => {
    opt.addEventListener('click', () => {
      const parent = opt.parentElement;
      parent.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

// ---------- الهوست: بدء الاختبار للجميع ----------
document.getElementById('hostStartQuizBtn').addEventListener('click', () => {
  const duration = parseFloat(document.getElementById('quizDurationInput').value);
  clearError('hostStartQuizError');

  if (!duration || duration <= 0) {
    showError('hostStartQuizError', t('err_valid_duration_required'));
    return;
  }

  socket.emit('start_quiz', {
    room_code: currentRoomCode,
    quiz: quizData,
    duration_minutes: duration,
  });
});

// ---------- بدء الاختبار (يوصل للجميع بمن فيهم الهوست) ----------
function handleQuizStarted(data) {
  quizData = data.quiz;
  quizHasStarted = true;
  quizFinished = false;
  quizStartTime = data.started_at;
  quizDeadline = data.started_at + data.duration_minutes * 60;
  latestRoomRating = null;

  renderQuiz();
  hide('step-upload'); hide('step-text'); hide('step-chat'); hide('step-summary'); hide('hostQuizControls');
  hide('startClassroomQuizBtn');
  show('step-quiz');
  updateGlobalBackButton();
  document.getElementById('checkBtn').disabled = false;

  show('quizCountdownBadge');
  startQuizCountdown();

  // بالجماعي: الشات وقائمة المشاركين تختفي بالكامل وقت ما الشخص نفسه يحل، وترجع له بعد ما يسلّم
  hide('participantsSection');
  show('inQuizNote');
  document.getElementById('myResultBox').classList.add('hidden');

  // كتم المايك إجباريًا وقت الاختبار عشان محد يقدر يسولف إجابات صوتيًا
  forceMuteVoiceForExam();

  document.getElementById('step-quiz').scrollIntoView({ behavior: 'smooth' });
}
socket.on('quiz_started', handleQuizStarted);

function tickQuizCountdown() {
  const remaining = Math.floor(quizDeadline - Date.now() / 1000);
  const badge = document.getElementById('quizCountdownBadge');
  if (remaining <= 0) {
    badge.textContent = `⏱️ ${t('time_up')}`;
    clearInterval(quizCountdownIntervalId);
    if (!quizFinished) finishQuiz();
    return;
  }
  badge.textContent = `⏱️ ${t('time_remaining')}: ${formatTime(remaining)}`;
}

function startQuizCountdown() {
  if (quizCountdownIntervalId) clearInterval(quizCountdownIntervalId);
  tickQuizCountdown(); // يعرض الوقت فورًا بدل ما يفضل فاضي ثانية كاملة قبل أول تحديث
  quizCountdownIntervalId = setInterval(tickQuizCountdown, 1000);
}

// ---------- تصحيح الاختبار وإرسال النتيجة ----------
function finishQuiz() {
  if (quizFinished) return;
  quizFinished = true;
  if (quizCountdownIntervalId) clearInterval(quizCountdownIntervalId);

  let correct = 0;
  const wrongTopics = [];
  document.querySelectorAll('.options').forEach((group, i) => {
    const selected = group.querySelector('.option.selected');
    const correctAnswer = quizData[i].correct_answer;
    group.querySelectorAll('.option').forEach(opt => {
      opt.style.pointerEvents = 'none';
      if (opt.dataset.value === correctAnswer) opt.classList.add('correct');
      else if (opt === selected) opt.classList.add('wrong');
    });
    if (selected && selected.dataset.value === correctAnswer) {
      correct++;
    } else if (quizData[i].topic) {
      wrongTopics.push(quizData[i].topic);
    }

    if (quizData[i].explanation) {
      const explanationEl = document.getElementById(`explanation-${i}`);
      explanationEl.textContent = `💡 ${quizData[i].explanation}`;
      explanationEl.classList.remove('hidden');
    }
  });

  const timeTaken = quizStartTime ? Math.max(0, Math.floor(Date.now() / 1000 - quizStartTime)) : 0;

  const banner = document.createElement('div');
  banner.className = 'score-banner';
  banner.innerHTML = `<div>${t('your_score')}</div><div class="big">${correct} / ${quizData.length}</div><div>⏱️ ${t('time_taken_label')}: ${formatTime(timeTaken)}</div>`;
  document.getElementById('quizContainer').prepend(banner);
  document.getElementById('checkBtn').disabled = true;

  if (currentAccessToken) {
    // تسجيل نتيجة المحاولة لتحليل الأداء - ما نكسر تجربة المستخدم لو فشل الطلب
    fetch(`${API_BASE}/api/quiz-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({
        mode: currentRoomCode ? 'room' : 'solo',
        score: correct,
        total: quizData.length,
        time_taken: timeTaken,
        wrong_topics: wrongTopics,
      }),
    })
      .then(res => res.json())
      .then(data => {
        // بالجماعي التقييم يجيك عبر socket (session_rating) مربوط بحدث submit_score
        // نفسه - هنا نعرضه بس بالفردي عشان ما يتكرر
        if (!currentRoomCode && data && data.rating) {
          banner.insertAdjacentHTML('beforeend', ratingHtml(data.rating));
        }
      })
      .catch(() => {});
  }

  if (currentRoomCode) {
    socket.emit('submit_score', { room_code: currentRoomCode, score: correct, total: quizData.length, time_taken: timeTaken });
    // ترجع له الشات وقائمة المشاركين والبودّيوم بعد ما يسلّم
    show('participantsSection');
    hide('inQuizNote');
  } else {
    unblurAfterExam();
  }
}
document.getElementById('checkBtn').addEventListener('click', finishQuiz);

// ---------- Restart ----------
document.getElementById('restartBtn').addEventListener('click', () => location.reload());

// ---------- نطاق المذاكرة: الطالب يختار الوحدات/الفصول بأرقامها قبل التلخيص ----------
let fullExtractedText = '';
let studyScopeMode = 'full';
let studyScopeParts = [];

const STUDY_ORDINALS = {
  'حادي عشر': 11, 'ثاني عشر': 12, 'اول': 1, 'اولي': 1, 'ول': 1, 'ولي': 1, 'ثاني': 2, 'ثانيه': 2, 'ثالث': 3, 'ثالثه': 3,
  'رابع': 4, 'رابعه': 4, 'خامس': 5, 'خامسه': 5, 'سادس': 6, 'سادسه': 6, 'سابع': 7, 'سابعه': 7,
  'ثامن': 8, 'ثامنه': 8, 'تاسع': 9, 'تاسعه': 9, 'عاشر': 10, 'عاشره': 10,
};
const STUDY_NUM = '(\\d{1,3}|(?:ال)?(?:حادي عشر|ثاني عشر|ولي|ول|اولي|اول|ثانيه|ثاني|ثالثه|ثالث|رابعه|رابع|خامسه|خامس|سادسه|سادس|سابعه|سابع|ثامنه|ثامن|تاسعه|تاسع|عاشره|عاشر))';
const STUDY_KW = '(الوحده|الفصل|unit|chapter)';
const STUDY_END = '(?=$|[\\s:：\\-–—.،,)\\]])';
const STUDY_FORWARD = new RegExp(`^${STUDY_KW}\\s*(?:رقم\\s*)?[:：\\-–—.]?\\s*${STUDY_NUM}${STUDY_END}`, 'i');
const STUDY_BACKWARD = new RegExp(`${STUDY_NUM}\\s*[:：\\-–—.]?\\s*${STUDY_KW}\\s*$`, 'i');

function normalizeStudyLine(line) {
  return String(line)
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}

function parseStudyHeading(line) {
  const text = normalizeStudyLine(line);
  if (!text || text.length > 90) return null;
  let keyword, token;
  const forward = STUDY_FORWARD.exec(text);
  if (forward) [, keyword, token] = forward;
  else {
    const backward = STUDY_BACKWARD.exec(text);
    if (!backward) return null;
    [, token, keyword] = backward;
  }
  const word = token.replace(/^ال/, '');
  const number = /^\d+$/.test(token) ? Number(token) : STUDY_ORDINALS[word];
  if (!number) return null;
  const type = /^(?:الوحده|unit)$/i.test(keyword) ? 'unit' : 'chapter';
  return { type, number };
}

// يدوّر في النص عن «الوحدة/الفصل + رقم» بأي صيغة (1 أو ١ أو الأول)، ويرجع
// قائمة موحدة مرقمة. عناوين الفهرس تتكرر مع عناوين المتن، فنأخذ الأطول نصًا.
function detectStudyParts(fullText) {
  const lines = String(fullText || '').replace(/\r/g, '').split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    const heading = parseStudyHeading(line);
    if (heading) headings.push({ ...heading, index });
  });
  const best = new Map();
  headings.forEach((heading, i) => {
    // الوحدة تمتد لين الوحدة التالية (وتشمل فصولها)، والفصل لين أي عنوان بعده
    const next = headings.slice(i + 1).find(other => heading.type === 'chapter' || other.type === 'unit');
    const text = lines.slice(heading.index, next ? next.index : lines.length).join('\n').trim();
    const key = `${heading.type}:${heading.number}`;
    if (!best.has(key) || text.length > best.get(key).text.length) {
      best.set(key, { type: heading.type, number: heading.number, text });
    }
  });
  return [...best.values()].sort((a, b) =>
    (a.type === b.type ? 0 : a.type === 'unit' ? -1 : 1) || a.number - b.number);
}

function setStudyText(text) {
  fullExtractedText = text || '';
  studyScopeParts = detectStudyParts(fullExtractedText);
  document.getElementById('studyScopePanel').classList.toggle('hidden', !studyScopeParts.length);
  setStudyScopeMode('full');
}

function setStudyScopeMode(mode) {
  studyScopeMode = mode;
  document.querySelectorAll('[data-study-scope]').forEach(btn => {
    const active = btn.dataset.studyScope === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const box = document.getElementById('studyScopeSections');
  const list = document.getElementById('studyScopeList');
  box.classList.toggle('hidden', mode === 'full');
  list.innerHTML = '';
  if (mode === 'parts') {
    studyScopeParts.forEach((part, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(index);
      input.addEventListener('change', applyStudyScope);
      label.append(input, document.createTextNode(t(part.type === 'unit' ? 'study_scope_unit_n' : 'study_scope_chapter_n', { n: part.number })));
      list.appendChild(label);
    });
  }
  applyStudyScope();
}

function applyStudyScope() {
  const previous = extractedText;
  const status = document.getElementById('studyScopeStatus');
  let blocked = false;
  if (studyScopeMode !== 'parts') {
    extractedText = fullExtractedText;
    status.textContent = '';
  } else {
    const picked = [...document.querySelectorAll('#studyScopeList input:checked')].map(input => studyScopeParts[Number(input.value)]);
    extractedText = picked.map(part => part.text).join('\n\n');
    blocked = !picked.length;
    status.textContent = blocked ? t('study_scope_pick_one') : t('study_scope_selected', { n: picked.length });
  }
  document.getElementById('extractedText').textContent = extractedText || t('err_no_text_extracted');
  summarizeBtn.disabled = blocked;
  quizBtn.disabled = blocked;
  // محادثة بدأت على نطاق سابق ما تصلح للنطاق الجديد
  if (previous !== extractedText) chatInteractionId = null;
}

document.querySelectorAll('[data-study-scope]').forEach(btn => {
  btn.addEventListener('click', () => setStudyScopeMode(btn.dataset.studyScope));
});
document.getElementById('studyScopeToggleAllBtn').addEventListener('click', () => {
  const boxes = [...document.querySelectorAll('#studyScopeList input')];
  const check = boxes.some(box => !box.checked);
  boxes.forEach(box => { box.checked = check; });
  applyStudyScope();
});
