// ================= دفتر الواجبات (معلم/طالب بس) =================
let assignmentsRosterCache = { classes: [], students: [] };
let currentAssignmentId = null;
let assignmentSelectedFile = null;
// أسئلة الواجب (نوع "أسئلة" بس) - نفس منطق مسودة أسئلة الاختبار بالضبط
let assignmentQuestionsDraft = [];
// إجابات الطالب أثناء حل واجب من نوع "أسئلة" (بدون مؤقت، عكس الاختبار)
let assignmentTakeAnswers = {};

async function loadAssignmentsScreen() {
  const isTeacher = currentUserRole === 'teacher';
  document.getElementById('assignmentCreateForm').classList.toggle('hidden', !isTeacher);
  document.getElementById('assignmentsList').innerHTML = '';
  if (isTeacher) resetAssignmentCreateForm();
  try {
    if (isTeacher) {
      assignmentsRosterCache = await apiCall('GET', '/api/teacher/roster');
      populateAssignmentClassSelect();
      const { assignments } = await apiCall('GET', '/api/teacher/assignments');
      renderAssignmentsList(assignments, true);
    } else {
      const { assignments } = await apiCall('GET', '/api/student/assignments');
      renderAssignmentsList(assignments, false);
    }
  } catch (e) {
    document.getElementById('assignmentsList').innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

function populateAssignmentClassSelect() {
  const classSelect = document.getElementById('assignmentClassSelect');
  classSelect.innerHTML = assignmentsRosterCache.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function renderAssignmentsList(items, isTeacher) {
  const list = document.getElementById('assignmentsList');
  const empty = document.getElementById('assignmentsEmptyState');
  empty.classList.toggle('hidden', items.length > 0);
  list.innerHTML = items.map(a => {
    const statusHtml = isTeacher
      ? `<span class="assignment-status ${a.submitted_count >= a.total_count && a.total_count > 0 ? 'done' : 'pending'}">${t('assignment_submitted_count', { done: a.submitted_count, total: a.total_count })}</span>`
      : `<span class="assignment-status ${a.submitted ? 'done' : 'pending'}">${a.submitted ? t('assignment_status_done') : t('assignment_status_pending')}</span>`;
    return `
      <div class="assignment-card" data-assignment-id="${a.id}">
        <div class="assignment-top">
          <span class="assignment-title">${escapeHtml(a.title)}</span>
          ${statusHtml}
        </div>
        <div class="assignment-meta">${escapeHtml(a.subject)}${a.class_name ? ' · ' + escapeHtml(a.class_name) : ''}${formatScheduleRangeText(a.open_at, a.close_at) ? ' · ' + escapeHtml(formatScheduleRangeText(a.open_at, a.close_at)) : ''}</div>
      </div>
    `;
  }).join('');
  list.querySelectorAll('.assignment-card').forEach(card => {
    card.addEventListener('click', () => {
      pushNavSnapshot();
      openAssignmentDetail(card.dataset.assignmentId);
      updateGlobalBackButton();
    });
  });
}

// ---------- نوع الواجب (ملف/أسئلة) - محرر الأسئلة نفس منطق الاختبارات ----------
function resetAssignmentCreateForm() {
  document.getElementById('assignmentTypeFile').checked = true;
  document.getElementById('assignmentQuestionsEditorWrap').classList.add('hidden');
  assignmentQuestionsDraft = [];
  renderAssignmentQuestionsEditor();
}
document.querySelectorAll('input[name="assignmentSubmissionType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const isQuestions = document.getElementById('assignmentTypeQuestions').checked;
    document.getElementById('assignmentQuestionsEditorWrap').classList.toggle('hidden', !isQuestions);
  });
});

function newAssignmentDraftQuestion(type) {
  return { question_type: type, question_text: '', choices: type === 'mcq' ? ['', ''] : [], correct_answer: '' };
}
document.getElementById('assignmentAddQuestionBtn').addEventListener('click', () => {
  assignmentQuestionsDraft.push(newAssignmentDraftQuestion('mcq'));
  renderAssignmentQuestionsEditor();
});
function renderAssignmentQuestionsEditor() {
  const wrap = document.getElementById('assignmentQuestionsList');
  wrap.innerHTML = assignmentQuestionsDraft.map((q, i) => assignmentQuestionEditorHtml(q, i)).join('');
  wireAssignmentQuestionEditorEvents();
}
function assignmentQuestionEditorHtml(q, i) {
  const typeOptions = [
    ['mcq', 'quiz_type_mcq'], ['true_false', 'quiz_type_true_false'], ['essay', 'quiz_type_essay'],
  ].map(([val, key]) => `<option value="${val}" ${q.question_type === val ? 'selected' : ''}>${t(key)}</option>`).join('');

  let bodyHtml = '';
  if (q.question_type === 'mcq') {
    bodyHtml = `
      <div class="qe-choices">
        ${q.choices.map((c, ci) => `
          <div class="qe-choice-row">
            <input type="radio" name="aqe-correct-${i}" ${q.correct_answer === c && c !== '' ? 'checked' : ''} data-qi="${i}" data-ci="${ci}" class="aqe-choice-radio">
            <input type="text" class="text-input aqe-choice-text" data-qi="${i}" data-ci="${ci}" value="${escapeHtml(c)}" placeholder="${t('ph_quiz_choice')}">
            <button class="qe-remove-btn aqe-remove-choice" data-qi="${i}" data-ci="${ci}" type="button">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="ghost qe-add-choice-btn aqe-add-choice" data-qi="${i}" type="button">${t('btn_add_choice')}</button>
      <p class="qe-hint">${t('assignment_correct_hint')}</p>
    `;
  } else if (q.question_type === 'true_false') {
    bodyHtml = `
      <div class="qe-tf-row">
        <label><input type="radio" name="aqe-tf-${i}" data-qi="${i}" value="true" class="aqe-tf-radio" ${q.correct_answer === 'true' ? 'checked' : ''}> ${t('quiz_true_label')}</label>
        <label><input type="radio" name="aqe-tf-${i}" data-qi="${i}" value="false" class="aqe-tf-radio" ${q.correct_answer === 'false' ? 'checked' : ''}> ${t('quiz_false_label')}</label>
      </div>
      <p class="qe-hint">${t('assignment_correct_hint')}</p>
    `;
  } else {
    bodyHtml = `<p class="qe-hint">${t('quiz_essay_hint')}</p>`;
  }

  return `
    <div class="quiz-question-editor" data-qi="${i}">
      <div class="qe-top">
        <span class="qe-num">${t('quiz_question_label')} ${i + 1}</span>
        <button class="qe-remove-btn aqe-remove-question" data-qi="${i}" type="button">🗑️ ${t('btn_remove')}</button>
      </div>
      <select class="text-input aqe-type-select" data-qi="${i}">${typeOptions}</select>
      <input type="text" class="text-input aqe-text-input" data-qi="${i}" value="${escapeHtml(q.question_text)}" placeholder="${t('ph_quiz_question_text')}" style="margin-top:8px;">
      ${bodyHtml}
    </div>
  `;
}
function wireAssignmentQuestionEditorEvents() {
  const wrap = document.getElementById('assignmentQuestionsList');
  wrap.querySelectorAll('.aqe-remove-question').forEach(btn => {
    btn.addEventListener('click', () => {
      assignmentQuestionsDraft.splice(Number(btn.dataset.qi), 1);
      renderAssignmentQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.aqe-type-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.qi);
      const oldText = assignmentQuestionsDraft[i].question_text;
      assignmentQuestionsDraft[i] = newAssignmentDraftQuestion(sel.value);
      assignmentQuestionsDraft[i].question_text = oldText;
      renderAssignmentQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.aqe-text-input').forEach(inp => {
    inp.addEventListener('input', () => {
      assignmentQuestionsDraft[Number(inp.dataset.qi)].question_text = inp.value;
    });
  });
  wrap.querySelectorAll('.aqe-choice-text').forEach(inp => {
    inp.addEventListener('input', () => {
      const q = assignmentQuestionsDraft[Number(inp.dataset.qi)];
      const oldVal = q.choices[Number(inp.dataset.ci)];
      if (q.correct_answer === oldVal) q.correct_answer = inp.value;
      q.choices[Number(inp.dataset.ci)] = inp.value;
    });
  });
  wrap.querySelectorAll('.aqe-remove-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = assignmentQuestionsDraft[Number(btn.dataset.qi)];
      const removed = q.choices[Number(btn.dataset.ci)];
      if (q.correct_answer === removed) q.correct_answer = '';
      q.choices.splice(Number(btn.dataset.ci), 1);
      renderAssignmentQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.aqe-add-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      assignmentQuestionsDraft[Number(btn.dataset.qi)].choices.push('');
      renderAssignmentQuestionsEditor();
    });
  });
  wrap.querySelectorAll('.aqe-choice-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const q = assignmentQuestionsDraft[Number(radio.dataset.qi)];
      q.correct_answer = q.choices[Number(radio.dataset.ci)];
    });
  });
  wrap.querySelectorAll('.aqe-tf-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      assignmentQuestionsDraft[Number(radio.dataset.qi)].correct_answer = radio.value;
    });
  });
}

document.getElementById('assignmentCreateBtn').addEventListener('click', async () => {
  clearError('assignmentCreateError');
  const classId = document.getElementById('assignmentClassSelect').value;
  const subject = document.getElementById('assignmentSubjectInput').value.trim();
  const title = document.getElementById('assignmentTitleInput').value.trim();
  const content = document.getElementById('assignmentContentTextarea').value.trim();
  const submissionType = document.getElementById('assignmentTypeQuestions').checked ? 'questions' : 'file';
  const openAt = localDatetimeToIso(document.getElementById('assignmentOpenAtInput').value);
  const closeAt = localDatetimeToIso(document.getElementById('assignmentCloseAtInput').value);
  if (!classId) { showError('assignmentCreateError', t('err_assignment_need_class')); return; }
  if (!subject || !title) { showError('assignmentCreateError', t('err_name_required')); return; }
  if (openAt && closeAt && openAt >= closeAt) { showError('assignmentCreateError', t('err_schedule_order')); return; }
  if (submissionType === 'questions') {
    if (!assignmentQuestionsDraft.length) { showError('assignmentCreateError', t('err_quiz_need_question')); return; }
    for (const q of assignmentQuestionsDraft) {
      if (!q.question_text.trim()) { showError('assignmentCreateError', t('err_quiz_question_text_required')); return; }
      if (q.question_type === 'mcq' && q.choices.filter(c => c.trim()).length < 2) {
        showError('assignmentCreateError', t('err_quiz_choices_required')); return;
      }
    }
  }

  const payload = {
    class_id: classId, subject, title, content, submission_type: submissionType,
    open_at: openAt, close_at: closeAt,
  };
  if (submissionType === 'questions') {
    payload.questions = assignmentQuestionsDraft.map(q => ({
      question_type: q.question_type, question_text: q.question_text.trim(),
      choices: q.question_type === 'mcq' ? q.choices.filter(c => c.trim()) : undefined,
      correct_answer: q.question_type !== 'essay' ? ((q.correct_answer || '').trim() || null) : null,
    }));
  }
  try {
    await apiCall('POST', '/api/teacher/assignments', payload);
    document.getElementById('assignmentSubjectInput').value = '';
    document.getElementById('assignmentTitleInput').value = '';
    document.getElementById('assignmentContentTextarea').value = '';
    document.getElementById('assignmentOpenAtInput').value = '';
    document.getElementById('assignmentCloseAtInput').value = '';
    resetAssignmentCreateForm();
    await loadAssignmentsScreen();
  } catch (e) {
    showError('assignmentCreateError', e.message);
  }
});

// ---------- صفحة واجب وحد ----------
async function openAssignmentDetail(id) {
  showAccountScreen('step-assignment-detail');
  currentAssignmentId = id;
  const isTeacher = currentUserRole === 'teacher';
  document.getElementById('studentSubmissionView').classList.toggle('hidden', isTeacher);
  document.getElementById('teacherStudentsView').classList.toggle('hidden', !isTeacher);
  document.getElementById('assignmentDeleteWrap').classList.toggle('hidden', !isTeacher);
  assignmentSelectedFile = null;
  updateAssignmentFileChip();
  document.getElementById('assignmentNoteTextarea').value = '';
  clearError('assignmentAnswersSubmitError');

  try {
    if (isTeacher) {
      const a = await apiCall('GET', `/api/teacher/assignments/${id}`);
      renderAssignmentDetailHeader(a);
      renderTeacherStudentsList(a.students, a.submission_type, a.questions);
    } else {
      const a = await apiCall('GET', `/api/student/assignments/${id}`);
      renderAssignmentDetailHeader(a);
      renderStudentSubmissionState(a);
    }
  } catch (e) {
    document.getElementById('assignmentDetailContent').textContent = e.message;
  }
}

function renderAssignmentDetailHeader(a) {
  document.getElementById('assignmentDetailSubjectLabel').textContent = `📚 ${a.subject}`;
  document.getElementById('assignmentDetailTitle').textContent = a.title;
  document.getElementById('assignmentDetailContent').textContent = a.content || '';
  const scheduleBox = document.getElementById('assignmentDetailSchedule');
  const scheduleText = formatScheduleRangeText(a.open_at, a.close_at);
  scheduleBox.textContent = scheduleText;
  scheduleBox.classList.toggle('hidden', !scheduleText);
}

document.getElementById('assignmentDeleteBtn').addEventListener('click', async () => {
  if (!currentAssignmentId || !confirm(t('confirm_delete_assignment'))) return;
  try {
    await apiCall('DELETE', `/api/teacher/assignments/${currentAssignmentId}`);
    document.getElementById('globalBackBtn').click();
  } catch (e) {
    alert(e.message);
  }
});

function renderTeacherStudentsList(students, submissionType, questions) {
  const wrap = document.getElementById('assignmentStudentsList');
  if (!students.length) {
    wrap.innerHTML = `<p class="desc">${t('assignment_no_students')}</p>`;
    return;
  }
  const isQuestions = submissionType === 'questions';
  wrap.innerHTML = students.map(s => `
    <div class="assignment-student-row" data-student-id="${s.user_id}">
      <span class="student-name">${escapeHtml(s.full_name || s.username)}</span>
      <span class="assignment-status ${s.submitted ? 'done' : 'pending'}">${s.submitted ? t('assignment_status_done') : t('assignment_status_pending')}</span>
      ${s.submitted ? `
        ${isQuestions
          ? `<button class="ghost view-answers-btn" data-student-id="${s.user_id}" type="button">${t('btn_view_answers')}</button>`
          : `<button class="ghost view-file-btn" data-student-id="${s.user_id}">${t('btn_view_file')}</button>`}
        <input type="text" class="text-input grade-input" placeholder="${t('assignment_grade_label')}" value="${escapeHtml(s.grade || '')}">
        <button class="ghost save-grade-btn" data-student-id="${s.user_id}">${t('btn_save_grade')}</button>
      ` : ''}
    </div>
    ${isQuestions ? `<div class="quiz-answers-panel hidden" id="assignmentAnswers-${s.user_id}"></div>` : ''}
  `).join('');

  wrap.querySelectorAll('.view-file-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { url } = await apiCall('GET', `/api/teacher/assignments/${currentAssignmentId}/submissions/${btn.dataset.studentId}/file`);
        window.open(url, '_blank');
      } catch (e) { alert(e.message); }
    });
  });
  wrap.querySelectorAll('.view-answers-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(`assignmentAnswers-${btn.dataset.studentId}`);
      if (panel.classList.contains('hidden')) {
        const s = students.find(x => x.user_id === btn.dataset.studentId);
        panel.innerHTML = renderAssignmentAnswersHtml(s, questions || []);
      }
      panel.classList.toggle('hidden');
    });
  });
  wrap.querySelectorAll('.save-grade-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = wrap.querySelector(`.assignment-student-row[data-student-id="${btn.dataset.studentId}"]`);
      const grade = row.querySelector('.grade-input').value.trim();
      try {
        await apiCall('PATCH', `/api/teacher/assignments/${currentAssignmentId}/submissions/${btn.dataset.studentId}`, { grade });
        btn.textContent = t('btn_save_grade') + ' ✅';
        setTimeout(() => { btn.textContent = t('btn_save_grade'); }, 1500);
      } catch (e) { alert(e.message); }
    });
  });
}

function renderAssignmentAnswersHtml(student, questions) {
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

function renderStudentSubmissionState(a) {
  const { submission, open_at: openAt, close_at: closeAt, submission_type: submissionType } = a;
  const infoBox = document.getElementById('studentSubmissionInfo');
  const fileForm = document.getElementById('assignmentFileSubmitForm');
  const questionsForm = document.getElementById('assignmentQuestionsSubmitForm');
  if (submission) {
    fileForm.classList.add('hidden');
    questionsForm.classList.add('hidden');
    infoBox.classList.remove('hidden');
    const gradeLine = submission.grade ? t('assignment_grade_shown', { grade: submission.grade })
      : (submissionType === 'questions' ? t('assignment_awaiting_correction') : t('assignment_not_graded_yet'));
    infoBox.innerHTML = [
      submissionType === 'questions' ? t('assignment_answers_submitted_label') : t('assignment_submitted_file_label', { name: submission.file_name }),
      submission.note ? t('assignment_already_submitted_note', { note: submission.note }) : '',
      gradeLine,
    ].filter(Boolean).map(escapeHtml).join('<br>');
    return;
  }
  // خارج نافذة الجدولة (لسا ما بدأ / خلص وقته) - نمنع التسليم من الواجهة
  // كتحسين تجربة بس (الباك إند هو الحارس الفعلي، شوف submit_assignment)
  const status = scheduleWindowStatus(openAt, closeAt);
  if (status !== 'open') {
    fileForm.classList.add('hidden');
    questionsForm.classList.add('hidden');
    infoBox.classList.remove('hidden');
    infoBox.innerHTML = escapeHtml(status === 'not_open' ? t('assignment_not_open_yet') : t('assignment_closed'));
    return;
  }
  infoBox.classList.add('hidden');
  if (submissionType === 'questions') {
    fileForm.classList.add('hidden');
    questionsForm.classList.remove('hidden');
    assignmentTakeAnswers = {};
    renderAssignmentTakeQuestions(a.questions || []);
  } else {
    questionsForm.classList.add('hidden');
    fileForm.classList.remove('hidden');
  }
}

function renderAssignmentTakeQuestions(questions) {
  const wrap = document.getElementById('assignmentTakeQuestionsList');
  wrap.innerHTML = questions.map((q, i) => {
    let bodyHtml = '';
    if (q.question_type === 'mcq') {
      bodyHtml = `<div class="options">${(q.choices || []).map(c => `
        <label class="option" data-qid="${q.id}">
          <input type="radio" name="assignment-take-${q.id}" value="${escapeHtml(c)}" style="margin-left:6px;">
          ${escapeHtml(c)}
        </label>
      `).join('')}</div>`;
    } else if (q.question_type === 'true_false') {
      bodyHtml = `<div class="options">
        <label class="option" data-qid="${q.id}"><input type="radio" name="assignment-take-${q.id}" value="true" style="margin-left:6px;"> ${t('quiz_true_label')}</label>
        <label class="option" data-qid="${q.id}"><input type="radio" name="assignment-take-${q.id}" value="false" style="margin-left:6px;"> ${t('quiz_false_label')}</label>
      </div>`;
    } else {
      bodyHtml = `<textarea class="text-input assignment-essay-answer" data-qid="${q.id}" style="min-height:90px;" placeholder="${t('ph_quiz_essay_answer')}"></textarea>`;
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
      assignmentTakeAnswers[qid] = radio.value;
    });
  });
  wrap.querySelectorAll('.assignment-essay-answer').forEach(ta => {
    ta.addEventListener('input', () => { assignmentTakeAnswers[ta.dataset.qid] = ta.value; });
  });
}

document.getElementById('assignmentSubmitAnswersBtn').addEventListener('click', async () => {
  if (!currentAssignmentId) return;
  clearError('assignmentAnswersSubmitError');
  const btn = document.getElementById('assignmentSubmitAnswersBtn');
  setLoading(btn, true, t('btn_submit_assignment_answers'));
  try {
    const submission = await apiCall('POST', `/api/student/assignments/${currentAssignmentId}/submit`, { answers: assignmentTakeAnswers });
    const a = await apiCall('GET', `/api/student/assignments/${currentAssignmentId}`);
    renderStudentSubmissionState(a);
  } catch (e) {
    showError('assignmentAnswersSubmitError', e.message);
  } finally {
    setLoading(btn, false, t('btn_submit_assignment_answers'));
  }
});

// ---------- رفع ملف الحل ----------
const assignmentDropzone = document.getElementById('assignmentFileDropzone');
const assignmentFileInput = document.getElementById('assignmentFileInput');
assignmentDropzone.addEventListener('click', () => assignmentFileInput.click());
assignmentDropzone.addEventListener('dragover', (e) => { e.preventDefault(); assignmentDropzone.classList.add('drag'); });
assignmentDropzone.addEventListener('dragleave', () => assignmentDropzone.classList.remove('drag'));
assignmentDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  assignmentDropzone.classList.remove('drag');
  if (e.dataTransfer.files[0]) setAssignmentFile(e.dataTransfer.files[0]);
});
assignmentFileInput.addEventListener('change', () => {
  if (assignmentFileInput.files[0]) setAssignmentFile(assignmentFileInput.files[0]);
});
function setAssignmentFile(file) {
  assignmentSelectedFile = file;
  updateAssignmentFileChip();
}
function updateAssignmentFileChip() {
  const chip = document.getElementById('assignmentFileChip');
  chip.classList.toggle('show', !!assignmentSelectedFile);
  document.getElementById('assignmentFileName').textContent = assignmentSelectedFile ? assignmentSelectedFile.name : '';
  document.getElementById('assignmentSubmitBtn').disabled = !assignmentSelectedFile;
}
document.getElementById('assignmentRemoveFile').addEventListener('click', () => {
  assignmentSelectedFile = null;
  assignmentFileInput.value = '';
  updateAssignmentFileChip();
});

document.getElementById('assignmentSubmitBtn').addEventListener('click', async () => {
  if (!assignmentSelectedFile || !currentAssignmentId) return;
  clearError('assignmentSubmitError');
  const btn = document.getElementById('assignmentSubmitBtn');
  setLoading(btn, true, t('btn_submit_assignment'));
  try {
    const formData = new FormData();
    formData.append('file', assignmentSelectedFile);
    formData.append('note', document.getElementById('assignmentNoteTextarea').value.trim());
    const res = await fetch(`${API_BASE}/api/student/assignments/${currentAssignmentId}/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('err_unexpected'));
    const a = await apiCall('GET', `/api/student/assignments/${currentAssignmentId}`);
    renderStudentSubmissionState(a);
  } catch (e) {
    showError('assignmentSubmitError', e.message);
  } finally {
    setLoading(btn, false, t('btn_submit_assignment'));
  }
});
