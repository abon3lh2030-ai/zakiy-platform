// ================= دفتر الواجبات (معلم/طالب بس) =================
let assignmentsRosterCache = { classes: [], students: [] };
let currentAssignmentId = null;
let assignmentSelectedFile = null;

async function loadAssignmentsScreen() {
  const isTeacher = currentUserRole === 'teacher';
  document.getElementById('assignmentCreateForm').classList.toggle('hidden', !isTeacher);
  document.getElementById('assignmentsList').innerHTML = '';
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
  populateAssignmentTargetSelect();
}
function populateAssignmentTargetSelect() {
  const classId = document.getElementById('assignmentClassSelect').value;
  const targetSelect = document.getElementById('assignmentTargetSelect');
  const studentsInClass = assignmentsRosterCache.students.filter(s => s.class_id === classId);
  targetSelect.innerHTML = `<option value="">${t('assignment_target_all')}</option>` +
    studentsInClass.map(s => `<option value="${s.user_id}">${escapeHtml(s.full_name || s.username)}</option>`).join('');
}
document.getElementById('assignmentClassSelect').addEventListener('change', populateAssignmentTargetSelect);

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
        <div class="assignment-meta">${escapeHtml(a.subject)}${a.class_name ? ' · ' + escapeHtml(a.class_name) : ''}</div>
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

document.getElementById('assignmentCreateBtn').addEventListener('click', async () => {
  clearError('assignmentCreateError');
  const classId = document.getElementById('assignmentClassSelect').value;
  const targetStudentId = document.getElementById('assignmentTargetSelect').value || null;
  const subject = document.getElementById('assignmentSubjectInput').value.trim();
  const title = document.getElementById('assignmentTitleInput').value.trim();
  const content = document.getElementById('assignmentContentTextarea').value.trim();
  if (!classId) { showError('assignmentCreateError', t('err_assignment_need_class')); return; }
  if (!subject || !title) { showError('assignmentCreateError', t('err_name_required')); return; }
  try {
    await apiCall('POST', '/api/teacher/assignments', { class_id: classId, target_student_id: targetStudentId, subject, title, content });
    document.getElementById('assignmentSubjectInput').value = '';
    document.getElementById('assignmentTitleInput').value = '';
    document.getElementById('assignmentContentTextarea').value = '';
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
  assignmentSelectedFile = null;
  updateAssignmentFileChip();
  document.getElementById('assignmentNoteTextarea').value = '';

  try {
    if (isTeacher) {
      const a = await apiCall('GET', `/api/teacher/assignments/${id}`);
      renderAssignmentDetailHeader(a);
      renderTeacherStudentsList(a.students);
    } else {
      const a = await apiCall('GET', `/api/student/assignments/${id}`);
      renderAssignmentDetailHeader(a);
      renderStudentSubmissionState(a.submission);
    }
  } catch (e) {
    document.getElementById('assignmentDetailContent').textContent = e.message;
  }
}

function renderAssignmentDetailHeader(a) {
  document.getElementById('assignmentDetailSubjectLabel').textContent = `📚 ${a.subject}`;
  document.getElementById('assignmentDetailTitle').textContent = a.title;
  document.getElementById('assignmentDetailContent').textContent = a.content || '';
}

function renderTeacherStudentsList(students) {
  const wrap = document.getElementById('assignmentStudentsList');
  if (!students.length) {
    wrap.innerHTML = `<p class="desc">${t('assignment_no_students')}</p>`;
    return;
  }
  wrap.innerHTML = students.map(s => `
    <div class="assignment-student-row" data-student-id="${s.user_id}">
      <span class="student-name">${escapeHtml(s.full_name || s.username)}</span>
      <span class="assignment-status ${s.submitted ? 'done' : 'pending'}">${s.submitted ? t('assignment_status_done') : t('assignment_status_pending')}</span>
      ${s.submitted ? `
        <button class="ghost view-file-btn" data-student-id="${s.user_id}">${t('btn_view_file')}</button>
        <input type="text" class="text-input grade-input" placeholder="${t('assignment_grade_label')}" value="${escapeHtml(s.grade || '')}">
        <button class="ghost save-grade-btn" data-student-id="${s.user_id}">${t('btn_save_grade')}</button>
      ` : ''}
    </div>
  `).join('');

  wrap.querySelectorAll('.view-file-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { url } = await apiCall('GET', `/api/teacher/assignments/${currentAssignmentId}/submissions/${btn.dataset.studentId}/file`);
        window.open(url, '_blank');
      } catch (e) { alert(e.message); }
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

function renderStudentSubmissionState(submission) {
  const infoBox = document.getElementById('studentSubmissionInfo');
  const submitForm = document.getElementById('studentSubmitForm');
  if (submission) {
    submitForm.classList.add('hidden');
    infoBox.classList.remove('hidden');
    const gradeLine = submission.grade ? t('assignment_grade_shown', { grade: submission.grade }) : t('assignment_not_graded_yet');
    infoBox.innerHTML = [
      t('assignment_submitted_file_label', { name: submission.file_name }),
      submission.note ? t('assignment_already_submitted_note', { note: submission.note }) : '',
      gradeLine,
    ].filter(Boolean).map(escapeHtml).join('<br>');
  } else {
    submitForm.classList.remove('hidden');
    infoBox.classList.add('hidden');
  }
}

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
    renderStudentSubmissionState(data);
  } catch (e) {
    showError('assignmentSubmitError', e.message);
  } finally {
    setLoading(btn, false, t('btn_submit_assignment'));
  }
});

