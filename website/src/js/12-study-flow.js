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

    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || t('err_upload_failed'));

    uploadedFilename = uploadData.filename;

    const extractRes = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadedFilename })
    });
    const extractData = await extractRes.json();
    if (!extractRes.ok) throw new Error(extractData.error || t('err_extract_failed'));

    extractedText = extractData.text;
    document.getElementById('extractedText').textContent = extractedText || t('err_no_text_extracted');
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

async function sendAIChat() {
  const input = document.getElementById('aiChatInput');
  const message = input.value.trim();
  if (!message) return;
  clearError('aiChatError');
  appendChatBubble('aiChatMessages', t('chat_you'), message, 'me');
  input.value = '';

  try {
    const body = { message, lang: currentLang };
    if (chatInteractionId) {
      body.interaction_id = chatInteractionId;
    } else {
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
  } catch (err) {
    showError('aiChatError', err.message || t('err_unexpected'));
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

