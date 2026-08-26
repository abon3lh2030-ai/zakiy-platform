// ================= دفتر الاختبارات (معلم/طالب بس) =================
let quizRosterCache = { classes: [], students: [] };
let currentQuizId = null;
let currentQuizDetailData = null;
let quizQuestionsDraft = [];
let quizEditMode = false;

async function loadQuizzesScreen() {
  const isTeacher = currentUserRole === 'teacher';
  document.getElementById('quizCreateBtnWrap').classList.toggle('hidden', !isTeacher);
  document.getElementById('quizzesList').innerHTML = '';
  try {
    if (isTeacher) {
      const { quizzes } = await apiCall('GET', '/api/teacher/quizzes');
      renderQuizzesList(quizzes, true);
    } else {
      const { quizzes } = await apiCall('GET', '/api/student/quizzes');
      renderQuizzesList(quizzes, false);
    }
  } catch (e) {
    document.getElementById('quizzesList').innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

function renderQuizzesList(items, isTeacher) {
  const list = document.getElementById('quizzesList');
  const empty = document.getElementById('quizzesEmptyState');
  empty.classList.toggle('hidden', items.length > 0);
  list.innerHTML = items.map(q => {
    let statusHtml;
    if (q.platform === 'madrasati') {
      statusHtml = `<span class="assignment-status">${t('platform_madrasati_quiz')}</span>`;
    } else if (isTeacher) {
      const cls = q.is_published ? 'done' : 'pending';
      const text = q.is_published
        ? t('quiz_submitted_count', { done: q.submitted_count, total: q.total_count })
        : t('quiz_status_draft');
      statusHtml = `<span class="assignment-status ${cls}">${text}</span>`;
    } else {
      let cls = 'pending';
      let text = t('quiz_status_not_taken');
      if (q.submitted) {
        if (q.is_graded) { cls = 'done'; text = t('quiz_grade_shown', { grade: q.grade }); }
        else { text = t('quiz_status_awaiting_grade'); }
      }
      statusHtml = `<span class="assignment-status ${cls}">${text}</span>`;
    }
    return `
      <div class="assignment-card" data-quiz-id="${q.id}">
        <div class="assignment-top">
          <span class="assignment-title">${escapeHtml(q.title)}</span>
          ${statusHtml}
        </div>
        <div class="assignment-meta">${escapeHtml(q.subject)}${q.class_name ? ' · ' + escapeHtml(q.class_name) : ''}${q.time_limit_minutes ? ' · ⏱ ' + q.time_limit_minutes + ' ' + t('quiz_minutes_label') : ''}${formatScheduleRangeText(q.open_at, q.close_at) ? ' · ' + escapeHtml(formatScheduleRangeText(q.open_at, q.close_at)) : ''}</div>
      </div>
    `;
  }).join('');
  list.querySelectorAll('.assignment-card').forEach(card => {
    card.addEventListener('click', () => {
      pushNavSnapshot();
      if (isTeacher) openQuizDetail(card.dataset.quizId);
      else openQuizTake(card.dataset.quizId);
      updateGlobalBackButton();
    });
  });
}

document.getElementById('quizCreateNewBtn').addEventListener('click', () => {
  pushNavSnapshot();
  openQuizCreateScreen(null);
  updateGlobalBackButton();
});

// ---------- إنشاء/تعديل اختبار (معلم بس) ----------
async function openQuizCreateScreen(existingQuiz) {
  showAccountScreen('step-quiz-create');
  clearError('quizCreateError');
  quizEditMode = !!existingQuiz;
  currentQuizId = existingQuiz ? existingQuiz.id : null;
  document.getElementById('quizCreateHeading').textContent = t(quizEditMode ? 'quiz_edit_heading' : 'quiz_create_heading');

  try {
    quizRosterCache = await apiCall('GET', '/api/teacher/roster');
    populateQuizClassSelect();
  } catch (e) {
    showError('quizCreateError', e.message);
  }

  const isMadrasati = existingQuiz && existingQuiz.platform === 'madrasati';
  document.getElementById('quizPlatformZakiy').checked = !isMadrasati;
  document.getElementById('quizPlatformMadrasati').checked = isMadrasati;
  document.getElementById('quizZakiyOptionsWrap').classList.toggle('hidden', isMadrasati);
  document.getElementById('quizMadrasatiOptionsWrap').classList.toggle('hidden', !isMadrasati);
  document.getElementById('quizExternalLinkInput').value = (existingQuiz && existingQuiz.external_link) || '';

  if (existingQuiz) {
    document.getElementById('quizClassSelect').value = existingQuiz.class_id;
    document.getElementById('quizSubjectInput').value = existingQuiz.subject;
    document.getElementById('quizTitleInput').value = existingQuiz.title;
    document.getElementById('quizTimeInput').value = existingQuiz.time_limit_minutes || '';
    document.getElementById('quizOpenAtInput').value = isoToLocalDatetimeValue(existingQuiz.open_at);
    document.getElementById('quizCloseAtInput').value = isoToLocalDatetimeValue(existingQuiz.close_at);
    quizQuestionsDraft = (existingQuiz.questions || []).map(q => ({
      question_type: q.question_type, question_text: q.question_text,
      choices: q.choices ? [...q.choices] : [], correct_answer: q.correct_answer || '',
    }));
  } else {
    document.getElementById('quizSubjectInput').value = '';
    document.getElementById('quizTitleInput').value = '';
    document.getElementById('quizTimeInput').value = '';
    document.getElementById('quizOpenAtInput').value = '';
    document.getElementById('quizCloseAtInput').value = '';
    quizQuestionsDraft = [];
  }
  renderQuizQuestionsEditor();
}
document.querySelectorAll('input[name="quizPlatform"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isMadrasati = document.getElementById('quizPlatformMadrasati').checked;
    document.getElementById('quizZakiyOptionsWrap').classList.toggle('hidden', isMadrasati);
    document.getElementById('quizMadrasatiOptionsWrap').classList.toggle('hidden', !isMadrasati);
  });
});

function populateQuizClassSelect() {
  document.getElementById('quizClassSelect').innerHTML =
    quizRosterCache.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function newDraftQuestion(type) {
  return { question_type: type, question_text: '', choices: type === 'mcq' ? ['', ''] : [], correct_answer: '' };
}

document.getElementById('quizAddQuestionBtn').addEventListener('click', () => {
  quizQuestionsDraft.push(newDraftQuestion('mcq'));
  renderQuizQuestionsEditor();
});

function renderQuizQuestionsEditor() {
  const wrap = document.getElementById('quizQuestionsList');
  wrap.innerHTML = quizQuestionsDraft.map((q, i) => questionEditorHtml(q, i)).join('');
  wireQuestionEditorEvents();
}

function questionEditorHtml(q, i) {
  const typeOptions = [
    ['mcq', 'quiz_type_mcq'], ['true_false', 'quiz_type_true_false'], ['essay', 'quiz_type_essay'],
  ].map(([val, key]) => `<option value="${val}" ${q.question_type === val ? 'selected' : ''}>${t(key)}</option>`).join('');

  let bodyHtml = '';
  if (q.question_type === 'mcq') {
    bodyHtml = `
      <div class="qe-choices">
        ${q.choices.map((c, ci) => `
          <div class="qe-choice-row">
            <input type="radio" name="qe-correct-${i}" ${q.correct_answer === c && c !== '' ? 'checked' : ''} data-qi="${i}" data-ci="${ci}" class="qe-choice-radio">
            <input type="text" class="text-input qe-choice-text" data-qi="${i}" data-ci="${ci}" value="${escapeHtml(c)}" placeholder="${t('ph_quiz_choice')}">
            <button class="qe-remove-btn qe-remove-choice" data-qi="${i}" data-ci="${ci}" type="button">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="ghost qe-add-choice-btn qe-add-choice" data-qi="${i}" type="button">${t('btn_add_choice')}</button>
      <p class="qe-hint">${t('quiz_correct_hint')}</p>
    `;
  } else if (q.question_type === 'true_false') {
    bodyHtml = `
      <div class="qe-tf-row">
        <label><input type="radio" name="qe-tf-${i}" data-qi="${i}" value="true" class="qe-tf-radio" ${q.correct_answer === 'true' ? 'checked' : ''}> ${t('quiz_true_label')}</label>
        <label><input type="radio" name="qe-tf-${i}" data-qi="${i}" value="false" class="qe-tf-radio" ${q.correct_answer === 'false' ? 'checked' : ''}> ${t('quiz_false_label')}</label>
      </div>
      <p class="qe-hint">${t('quiz_correct_hint')}</p>
    `;
  } else {
    bodyHtml = `<p class="qe-hint">${t('quiz_essay_hint')}</p>`;
  }

  return `
    <div class="quiz-question-editor" data-qi="${i}">
      <div class="qe-top">
        <span class="qe-num">${t('quiz_question_label')} ${i + 1}</span>
        <button class="qe-remove-btn qe-remove-question" data-qi="${i}" type="button">🗑️ ${t('btn_remove')}</button>
      </div>
      <select class="text-input qe-type-select" data-qi="${i}">${typeOptions}</select>
      <input type="text" class="text-input qe-text-input" data-qi="${i}" value="${escapeHtml(q.question_text)}" placeholder="${t('ph_quiz_question_text')}" style="margin-top:8px;">
      ${bodyHtml}
    </div>
  `;
}

function wireQuestionEditorEvents() {
  const wrap = document.getElementById('quizQuestionsList');

  wrap.querySelectorAll('.qe-remove-question').forEach(btn => {
    btn.addEventListener('click', () => {
      quizQuestionsDraft.splice(Number(btn.dataset.qi), 1);
      renderQuizQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.qe-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.qi);
      const oldText = quizQuestionsDraft[i].question_text;
      quizQuestionsDraft[i] = newDraftQuestion(sel.value);
      quizQuestionsDraft[i].question_text = oldText;
      renderQuizQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.qe-text-input').forEach(inp => {
    inp.addEventListener('input', () => {
      quizQuestionsDraft[Number(inp.dataset.qi)].question_text = inp.value;
    });
  });
  wrap.querySelectorAll('.qe-choice-text').forEach(inp => {
    inp.addEventListener('input', () => {
      const q = quizQuestionsDraft[Number(inp.dataset.qi)];
      const oldVal = q.choices[Number(inp.dataset.ci)];
      if (q.correct_answer === oldVal) q.correct_answer = inp.value;
      q.choices[Number(inp.dataset.ci)] = inp.value;
    });
  });
  wrap.querySelectorAll('.qe-remove-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = quizQuestionsDraft[Number(btn.dataset.qi)];
      const removed = q.choices[Number(btn.dataset.ci)];
      if (q.correct_answer === removed) q.correct_answer = '';
      q.choices.splice(Number(btn.dataset.ci), 1);
      renderQuizQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.qe-add-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      quizQuestionsDraft[Number(btn.dataset.qi)].choices.push('');
      renderQuizQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.qe-choice-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const q = quizQuestionsDraft[Number(radio.dataset.qi)];
      q.correct_answer = q.choices[Number(radio.dataset.ci)];
    });
  });
  wrap.querySelectorAll('.qe-tf-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      quizQuestionsDraft[Number(radio.dataset.qi)].correct_answer = radio.value;
    });
  });
}

document.getElementById('quizSaveBtn').addEventListener('click', async () => {
  clearError('quizCreateError');
  const classId = document.getElementById('quizClassSelect').value;
  const subject = document.getElementById('quizSubjectInput').value.trim();
  const title = document.getElementById('quizTitleInput').value.trim();
  const platform = document.getElementById('quizPlatformMadrasati').checked ? 'madrasati' : 'zakiy';
  const externalLink = document.getElementById('quizExternalLinkInput').value.trim();
  const timeLimitMinutes = parseInt(document.getElementById('quizTimeInput').value, 10);
  if (!classId) { showError('quizCreateError', t('err_assignment_need_class')); return; }
  if (!subject || !title) { showError('quizCreateError', t('err_name_required')); return; }
  const openAt = localDatetimeToIso(document.getElementById('quizOpenAtInput').value);
  const closeAt = localDatetimeToIso(document.getElementById('quizCloseAtInput').value);
  if (openAt && closeAt && openAt >= closeAt) { showError('quizCreateError', t('err_schedule_order')); return; }
  if (platform === 'zakiy') {
    if (!timeLimitMinutes || timeLimitMinutes <= 0) { showError('quizCreateError', t('err_quiz_need_time')); return; }
    if (!quizQuestionsDraft.length) { showError('quizCreateError', t('err_quiz_need_question')); return; }
    for (const q of quizQuestionsDraft) {
      if (!q.question_text.trim()) { showError('quizCreateError', t('err_quiz_question_text_required')); return; }
      if (q.question_type === 'mcq' && q.choices.filter(c => c.trim()).length < 2) {
        showError('quizCreateError', t('err_quiz_choices_required')); return;
      }
    }
  }

  const payload = {
    class_id: classId, subject, title, platform, external_link: externalLink,
    open_at: openAt, close_at: closeAt,
  };
  if (platform === 'zakiy') {
    payload.time_limit_minutes = timeLimitMinutes;
    payload.questions = quizQuestionsDraft.map(q => ({
      question_type: q.question_type, question_text: q.question_text.trim(),
      choices: q.question_type === 'mcq' ? q.choices.filter(c => c.trim()) : undefined,
      correct_answer: q.question_type !== 'essay' ? ((q.correct_answer || '').trim() || null) : null,
    }));
  }
  const btn = document.getElementById('quizSaveBtn');
  setLoading(btn, true, t('btn_save_quiz'));
  try {
    if (quizEditMode && currentQuizId) {
      await apiCall('PATCH', `/api/teacher/quizzes/${currentQuizId}`, payload);
    } else {
      await apiCall('POST', '/api/teacher/quizzes', payload);
    }
    document.getElementById('globalBackBtn').click();
  } catch (e) {
    showError('quizCreateError', e.message);
  } finally {
    setLoading(btn, false, t('btn_save_quiz'));
  }
});

// ---------- صفحة اختبار وحد (معلم) ----------
async function openQuizDetail(id) {
  showAccountScreen('step-quiz-detail');
  currentQuizId = id;
  clearError('quizDetailError');
  try {
    const quiz = await apiCall('GET', `/api/teacher/quizzes/${id}`);
    currentQuizDetailData = quiz;
    renderQuizDetailHeader(quiz);
    const isMadrasati = quiz.platform === 'madrasati';
    document.getElementById('quizMadrasatiLinkWrap').classList.toggle('hidden', !isMadrasati);
    if (isMadrasati) document.getElementById('quizMadrasatiLinkInput').value = quiz.external_link || '';
    document.getElementById('quizUnpublishedActions').classList.toggle('hidden', quiz.is_published);
    document.getElementById('quizPublishedView').classList.toggle('hidden', !quiz.is_published || isMadrasati);
    if (quiz.is_published && !isMadrasati) renderQuizStudentsList(quiz.students, quiz.questions);
  } catch (e) {
    document.getElementById('quizDetailMeta').textContent = e.message;
  }
}

document.getElementById('quizMadrasatiSaveLinkBtn').addEventListener('click', async () => {
  if (!currentQuizId) return;
  clearError('quizMadrasatiLinkError');
  const link = document.getElementById('quizMadrasatiLinkInput').value.trim();
  const btn = document.getElementById('quizMadrasatiSaveLinkBtn');
  btn.disabled = true;
  try {
    await apiCall('PATCH', `/api/teacher/quizzes/${currentQuizId}`, { external_link: link });
    btn.textContent = t('btn_save') + ' ✅';
    setTimeout(() => { btn.textContent = t('btn_save'); }, 1500);
  } catch (e) {
    showError('quizMadrasatiLinkError', e.message);
  } finally {
    btn.disabled = false;
  }
});

function renderQuizDetailHeader(quiz) {
  document.getElementById('quizDetailSubjectLabel').textContent = `📝 ${quiz.subject}`;
  document.getElementById('quizDetailTitle').textContent = quiz.title;
  document.getElementById('quizDetailMeta').textContent =
    `⏱ ${quiz.time_limit_minutes} ${t('quiz_minutes_label')} · ${(quiz.questions || []).length} ${t('quiz_questions_count_label')}`;
  const scheduleBox = document.getElementById('quizDetailSchedule');
  const scheduleText = formatScheduleRangeText(quiz.open_at, quiz.close_at);
  scheduleBox.textContent = scheduleText;
  scheduleBox.classList.toggle('hidden', !scheduleText);
}

document.getElementById('quizPublishBtn').addEventListener('click', async () => {
  if (!currentQuizId || !confirm(t('confirm_publish_quiz'))) return;
  try {
    await apiCall('POST', `/api/teacher/quizzes/${currentQuizId}/publish`, {});
    await openQuizDetail(currentQuizId);
  } catch (e) { showError('quizDetailError', e.message); }
});
document.getElementById('quizEditBtn').addEventListener('click', () => {
  if (!currentQuizDetailData) return;
  pushNavSnapshot();
  openQuizCreateScreen(currentQuizDetailData);
  updateGlobalBackButton();
});
document.getElementById('quizDeleteBtn').addEventListener('click', async () => {
  if (!currentQuizId || !confirm(t('confirm_delete_quiz'))) return;
  try {
    await apiCall('DELETE', `/api/teacher/quizzes/${currentQuizId}`);
    document.getElementById('globalBackBtn').click();
  } catch (e) { showError('quizDetailError', e.message); }
});

function renderQuizStudentsList(students, questions) {
  const wrap = document.getElementById('quizStudentsList');
  if (!students.length) {
    wrap.innerHTML = `<p class="desc">${t('assignment_no_students')}</p>`;
    return;
  }
  wrap.innerHTML = students.map(s => {
    const statusCls = s.submitted ? 'done' : 'pending';
    const statusText = !s.submitted
      ? t('assignment_status_pending')
      : (s.is_graded ? t('quiz_grade_shown', { grade: s.grade }) : t('quiz_status_awaiting_grade'));
    return `
      <div class="assignment-student-row" data-student-id="${s.user_id}">
        <span class="student-name">${escapeHtml(s.full_name || s.username)}</span>
        <span class="assignment-status ${statusCls}">${statusText}</span>
        ${s.submitted ? `
          <button class="ghost view-answers-btn" data-student-id="${s.user_id}" type="button">${t('btn_view_answers')}</button>
          <input type="text" class="text-input grade-input" placeholder="${t('assignment_grade_label')}" value="${escapeHtml(s.grade || '')}">
          <button class="ghost save-grade-btn" data-student-id="${s.user_id}" type="button">${t('btn_save_grade')}</button>
        ` : ''}
      </div>
      <div class="quiz-answers-panel hidden" id="quizAnswers-${s.user_id}"></div>
    `;
  }).join('');

  wrap.querySelectorAll('.view-answers-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(`quizAnswers-${btn.dataset.studentId}`);
      if (panel.classList.contains('hidden')) {
        const s = students.find(x => x.user_id === btn.dataset.studentId);
        panel.innerHTML = renderStudentAnswersHtml(s, questions);
      }
      panel.classList.toggle('hidden');
    });
  });
  wrap.querySelectorAll('.save-grade-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = wrap.querySelector(`.assignment-student-row[data-student-id="${btn.dataset.studentId}"]`);
      const grade = row.querySelector('.grade-input').value.trim();
      try {
        await apiCall('PATCH', `/api/teacher/quizzes/${currentQuizId}/attempts/${btn.dataset.studentId}`, { grade });
        btn.textContent = t('btn_save_grade') + ' ✅';
        setTimeout(() => { btn.textContent = t('btn_save_grade'); }, 1500);
      } catch (e) { alert(e.message); }
    });
  });
}

function renderStudentAnswersHtml(student, questions) {
  const answers = student.answers || {};
  return questions.map((q, i) => `
    <div class="quiz-question-editor">
      <div class="qe-top"><span class="qe-num">${t('quiz_question_label')} ${i + 1}</span></div>
      <p style="font-weight:600;">${escapeHtml(q.question_text)}</p>
      <p class="desc">${t('quiz_student_answer_label')}: ${escapeHtml(String(answers[q.id] ?? '—'))}</p>
      ${q.correct_answer ? `<p class="desc">${t('quiz_correct_answer_label')}: ${escapeHtml(q.correct_answer)}</p>` : ''}
    </div>
  `).join('');
}

// ---------- حل اختبار (طالب) ----------
let quizTimerInterval = null;
let quizDeadlineMs = null;
let quizAnswers = {};

async function openQuizTake(id) {
  showAccountScreen('step-quiz-take');
  currentQuizId = id;
  clearError('quizTakeError');
  stopQuizTimer();
  document.getElementById('quizTakeActive').classList.add('hidden');
  document.getElementById('quizTakeResult').classList.add('hidden');
  document.getElementById('quizTakeMadrasatiView').classList.add('hidden');

  try {
    const quiz = await apiCall('GET', `/api/student/quizzes/${id}`);
    document.getElementById('quizTakeSubjectLabel').textContent = `📝 ${quiz.subject}`;
    document.getElementById('quizTakeTitle').textContent = quiz.title;

    if (quiz.platform === 'madrasati') {
      document.getElementById('quizTakeMadrasatiView').classList.remove('hidden');
      document.getElementById('quizTakeMadrasatiOpenBtn').href = quiz.external_link || MADRASATI_SIGNIN_URL;
      document.getElementById('quizTakeMadrasatiNote').textContent = quiz.external_link ? '' : t('assignment_madrasati_no_link_note');
      return;
    }

    if (quiz.attempt && quiz.attempt.submitted_at) {
      showQuizResult(quiz.attempt);
      return;
    }

    const attempt = await apiCall('POST', `/api/student/quizzes/${id}/start`, {});
    quizAnswers = {};
    document.getElementById('quizTakeActive').classList.remove('hidden');
    renderQuizTakeQuestions(quiz.questions);

    const startedMs = new Date(attempt.started_at).getTime();
    quizDeadlineMs = startedMs + quiz.time_limit_minutes * 60000;
    startQuizTimer();
  } catch (e) {
    showError('quizTakeError', e.message);
  }
}

function renderQuizTakeQuestions(questions) {
  const wrap = document.getElementById('quizTakeQuestionsList');
  wrap.innerHTML = questions.map((q, i) => {
    let bodyHtml = '';
    if (q.question_type === 'mcq') {
      bodyHtml = `<div class="options">${(q.choices || []).map(c => `
        <label class="option" data-qid="${q.id}">
          <input type="radio" name="quiz-take-${q.id}" value="${escapeHtml(c)}" style="margin-left:6px;">
          ${escapeHtml(c)}
        </label>
      `).join('')}</div>`;
    } else if (q.question_type === 'true_false') {
      bodyHtml = `<div class="options">
        <label class="option" data-qid="${q.id}"><input type="radio" name="quiz-take-${q.id}" value="true" style="margin-left:6px;"> ${t('quiz_true_label')}</label>
        <label class="option" data-qid="${q.id}"><input type="radio" name="quiz-take-${q.id}" value="false" style="margin-left:6px;"> ${t('quiz_false_label')}</label>
      </div>`;
    } else {
      bodyHtml = `<textarea class="text-input quiz-essay-answer" data-qid="${q.id}" style="min-height:90px;" placeholder="${t('ph_quiz_essay_answer')}"></textarea>`;
    }
    return `
      <div class="question">
        <div class="q-num">${t('quiz_question_label')} ${i + 1}</div>
        <div class="q-text">${escapeHtml(q.question_text)}</div>
        ${bodyHtml}
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const qid = radio.closest('[data-qid]').dataset.qid;
      quizAnswers[qid] = radio.value;
    });
  });
  wrap.querySelectorAll('.quiz-essay-answer').forEach(ta => {
    ta.addEventListener('input', () => { quizAnswers[ta.dataset.qid] = ta.value; });
  });
}

function startQuizTimer() {
  updateQuizTimerDisplay();
  quizTimerInterval = setInterval(() => {
    const remaining = quizDeadlineMs - Date.now();
    if (remaining <= 0) {
      stopQuizTimer();
      submitQuizAttempt(true);
      return;
    }
    updateQuizTimerDisplay();
  }, 1000);
}
function stopQuizTimer() {
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }
}
function updateQuizTimerDisplay() {
  const remaining = Math.max(0, quizDeadlineMs - Date.now());
  const badge = document.getElementById('quizTimerBadge');
  badge.textContent = `⏱ ${formatTime(Math.floor(remaining / 1000))}`;
  badge.classList.toggle('low-time', remaining < 60000);
}

document.getElementById('quizSubmitBtn').addEventListener('click', () => submitQuizAttempt(false));

async function submitQuizAttempt(autoSubmitted) {
  stopQuizTimer();
  clearError('quizTakeError');
  try {
    const attempt = await apiCall('POST', `/api/student/quizzes/${currentQuizId}/submit`, {
      answers: quizAnswers, auto_submitted: autoSubmitted,
    });
    showQuizResult(attempt);
  } catch (e) {
    showError('quizTakeError', e.message);
  }
}

function showQuizResult(attempt) {
  document.getElementById('quizTakeActive').classList.add('hidden');
  document.getElementById('quizTakeResult').classList.remove('hidden');
  const box = document.getElementById('quizResultBox');
  if (attempt.is_graded) {
    box.classList.remove('pending');
    box.innerHTML = `
      <div class="quiz-result-score">${escapeHtml(attempt.grade || '')}</div>
      <div class="quiz-result-label">${t('quiz_result_graded_label')}</div>
    `;
  } else {
    box.classList.add('pending');
    box.innerHTML = `
      <div class="quiz-result-score">✅ ${t('quiz_submitted_label')}</div>
      <div class="quiz-result-label">${t('quiz_result_pending_label')}</div>
    `;
  }
}
