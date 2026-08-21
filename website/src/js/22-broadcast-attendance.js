// ---------- بث جماعي: مدير مدرسة لمعلميه ----------
document.getElementById('schoolBroadcastBtn')?.addEventListener('click', async () => {
  const body = document.getElementById('schoolBroadcastInput').value.trim();
  clearError('schoolBroadcastError');
  if (!body) { showError('schoolBroadcastError', t('err_broadcast_body_required')); return; }
  try {
    const res = await apiCall('POST', '/api/school/broadcast', { body });
    document.getElementById('schoolBroadcastInput').value = '';
    showError('schoolBroadcastError', t('broadcast_sent_msg', { n: res.sent_to }));
  } catch (e) {
    showError('schoolBroadcastError', e.message);
  }
});

// ---------- بث جماعي: معلم لطلاب فصله ----------
document.getElementById('teacherBroadcastBtn')?.addEventListener('click', async () => {
  const body = document.getElementById('teacherBroadcastInput').value.trim();
  const class_id = document.getElementById('teacherClassSelect').value || undefined;
  clearError('teacherBroadcastError');
  if (!body) { showError('teacherBroadcastError', t('err_broadcast_body_required')); return; }
  try {
    const res = await apiCall('POST', '/api/teacher/broadcast', { body, class_id });
    document.getElementById('teacherBroadcastInput').value = '';
    showError('teacherBroadcastError', t('broadcast_sent_msg', { n: res.sent_to }));
  } catch (e) {
    showError('teacherBroadcastError', e.message);
  }
});

// ---------- الحضور اليدوي (يسجّله المعلم) ----------
document.getElementById('manualAttendanceDate')?.addEventListener('change', loadManualAttendanceForm);
document.getElementById('teacherClassSelect').addEventListener('change', () => {
  if (document.querySelector('#step-teacher-dashboard .role-tab.active')?.dataset.tab === 'attendance') {
    loadManualAttendanceForm();
  }
});

async function loadManualAttendanceForm() {
  const wrap = document.getElementById('manualAttendanceFormWrap');
  const classId = document.getElementById('teacherClassSelect').value;
  const date = document.getElementById('manualAttendanceDate').value;
  if (!classId || !date) { wrap.innerHTML = `<p class="desc">${t('err_pick_class_first')}</p>`; return; }
  wrap.innerHTML = t('loading');
  try {
    const [rosterData, existingData] = await Promise.all([
      apiCall('GET', '/api/teacher/roster'),
      apiCall('GET', `/api/teacher/attendance/manual?class_id=${classId}&date=${date}`),
    ]);
    const students = rosterData.students.filter(s => s.class_id === classId);
    const existing = {};
    existingData.records.forEach(r => { existing[r.student_id] = r.status; });
    if (!students.length) { wrap.innerHTML = `<p class="desc">${t('teacher_no_students')}</p>`; return; }
    wrap.innerHTML = students.map(s => `
      <div class="friend-row">
        <div style="font-weight:600;">${escapeHtml(s.username)}</div>
        <div class="actions" style="gap:6px;">
          ${['present', 'late', 'absent'].map(st => `
            <label style="display:flex; align-items:center; gap:4px; font-size:13px; cursor:pointer;">
              <input type="radio" name="att-${s.user_id}" value="${st}" ${existing[s.user_id] === st || (!existing[s.user_id] && st === 'present') ? 'checked' : ''}>
              ${t('attendance_status_' + st)}
            </label>
          `).join('')}
        </div>
      </div>
    `).join('') + `<button class="primary" id="saveManualAttendanceBtn" style="margin-top:10px;">${t('btn_save_attendance')}</button>`;

    document.getElementById('saveManualAttendanceBtn').addEventListener('click', async () => {
      const records = students.map(s => ({
        student_id: s.user_id,
        status: document.querySelector(`input[name="att-${s.user_id}"]:checked`)?.value || 'present',
      }));
      try {
        await apiCall('POST', '/api/teacher/attendance/manual', { class_id: classId, date, records });
        alert(t('attendance_saved_msg'));
      } catch (e) {
        alert(e.message);
      }
    });
  } catch (e) {
    wrap.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

