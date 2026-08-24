// ---------- School Admin / School Administration: لوحة المدرسة ----------
let schoolClassesCache = [];

document.querySelectorAll('#step-school-dashboard .role-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('#step-school-dashboard .role-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    document.querySelectorAll('#step-school-dashboard .school-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`schoolTab-${tabBtn.dataset.tab}`).classList.remove('hidden');
    if (tabBtn.dataset.tab === 'attendance') loadSchoolAttendance();
    if (tabBtn.dataset.tab === 'students') loadSchoolStudents();
  });
});

async function loadSchoolDashboard() {
  // زر إضافة إداري محجوز على مدير المدرسة (school_admin) بس - نفس القيد
  // اللي الباك إند يفرضه أصلًا (إداري ما يقدر يدير حساب مدير/إداري ثاني)
  document.getElementById('addAdministrationForm').classList.toggle('hidden', currentUserRole !== 'school_admin');
  // زر "حذف كل الحسابات" خطير جدًا - محجوز على school_admin بس، نفس قيد الباك إند
  document.getElementById('deleteAllAccountsWrap').classList.toggle('hidden', currentUserRole !== 'school_admin');
  await Promise.all([loadSchoolInfo(), loadSchoolTeachers(), loadSchoolAdministration(), loadSchoolClasses()]);
}

// ---------- حذف كل حسابات المدرسة إلا حساب المدير نفسه - إجراء خطير وغير
// قابل للتراجع، فنطلب تأكيدين: تأكيد عادي، ثم كتابة كلمة "حذف" حرفيًا ----------
document.getElementById('deleteAllAccountsBtn').addEventListener('click', async () => {
  if (!confirm(t('confirm_delete_all_accounts_1'))) return;
  const typed = prompt(t('confirm_delete_all_accounts_2'));
  if (typed !== t('delete_confirm_word')) { alert(t('err_delete_confirm_mismatch')); return; }
  try {
    const res = await apiCall('POST', '/api/school/accounts/delete-all');
    alert(t('delete_all_accounts_done', { count: res.deleted_count }));
    loadSchoolDashboard();
  } catch (e) {
    alert(e.message);
  }
});

async function loadSchoolAdministration() {
  const tbody = document.getElementById('schoolAdministrationTableBody');
  tbody.innerHTML = `<tr><td colspan="3">${t('loading')}</td></tr>`;
  try {
    const data = await apiCall('GET', '/api/school/administration');
    if (!data.administration.length) { tbody.innerHTML = `<tr><td colspan="3">${t('school_no_admin_staff')}</td></tr>`; return; }
    tbody.innerHTML = data.administration.map(a => `
      <tr>
        <td>${escapeHtml(a.username)}</td>
        <td>${a.last_login ? new Date(a.last_login).toLocaleString(currentLang === 'ar' ? 'ar' : 'en') : t('never_logged_in')}</td>
        <td>
          <button class="ghost" data-reset-account-pw="${a.user_id}" style="padding:4px 10px;">${t('btn_reset_password')}</button>
          ${currentUserRole === 'school_admin' ? `<button class="ghost" data-delete-account="${a.user_id}" style="padding:4px 10px; color:#c0392b;">${t('btn_delete')}</button>` : ''}
        </td>
      </tr>
    `).join('');
    wireDeleteAccountButtons(tbody, loadSchoolAdministration);
    wireResetPasswordButtons(tbody, document.getElementById('schoolAdministrationResult'));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(e.message)}</td></tr>`;
  }
}

document.getElementById('addAdministrationBtn').addEventListener('click', async () => {
  clearError('addAdministrationError');
  const name = document.getElementById('newAdminName').value.trim();
  const email = document.getElementById('newAdminEmail').value.trim();
  if (!name || !email) { showError('addAdministrationError', t('err_teacher_fields_required')); return; }
  try {
    const data = await apiCall('POST', '/api/school/administration', { name, email });
    const box = document.getElementById('addAdministrationResult');
    box.innerHTML = `${t('school_admin_staff_created_msg', { name })}<br>📧 ${escapeHtml(data.email)}<br>🔑 <code>${escapeHtml(data.password)}</code>`;
    box.classList.remove('hidden');
    document.getElementById('newAdminName').value = '';
    document.getElementById('newAdminEmail').value = '';
    loadSchoolAdministration();
    loadSchoolInfo();
  } catch (e) {
    showError('addAdministrationError', e.message);
  }
});

async function loadSchoolInfo() {
  try {
    const info = await apiCall('GET', '/api/school/info');
    const pct = info.max_accounts > 0 ? Math.min(100, Math.round((info.accounts_used / info.max_accounts) * 100)) : 0;
    document.getElementById('schoolUsageBar').style.width = `${pct}%`;
    document.getElementById('schoolUsageText').textContent = t('school_usage_text', { used: info.accounts_used, max: info.max_accounts });

    const banner = document.getElementById('schoolOverLimitBanner');
    if (info.over_limit_since) {
      const over = info.accounts_used - info.max_accounts;
      const deadline = new Date(info.over_limit_deadline);
      const deadlineStr = deadline.toLocaleString(currentLang === 'ar' ? 'ar' : 'en');
      banner.textContent = info.over_limit_expired
        ? `⏰ ${t('school_over_limit_expired', { n: over, deadline: deadlineStr })}`
        : `⚠️ ${t('school_over_limit_warning', { n: over, deadline: deadlineStr })}`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  } catch { /* غير حرج لعمل بقية اللوحة */ }
}

async function loadSchoolTeachers() {
  const tbody = document.getElementById('schoolTeachersTableBody');
  tbody.innerHTML = `<tr><td colspan="5">${t('loading')}</td></tr>`;
  try {
    const data = await apiCall('GET', '/api/school/teachers');
    if (!data.teachers.length) { tbody.innerHTML = `<tr><td colspan="5">${t('school_no_teachers')}</td></tr>`; return; }
    tbody.innerHTML = data.teachers.map(tch => `
      <tr>
        <td>${escapeHtml(tch.username)}</td>
        <td>${tch.classes.map(c => escapeHtml(c.name)).join('، ') || '—'}</td>
        <td>${tch.student_count}</td>
        <td>${tch.last_login ? new Date(tch.last_login).toLocaleString(currentLang === 'ar' ? 'ar' : 'en') : t('never_logged_in')}</td>
        <td>
          <button class="ghost" data-reset-account-pw="${tch.user_id}" style="padding:4px 10px;">${t('btn_reset_password')}</button>
          <button class="ghost" data-delete-account="${tch.user_id}" style="padding:4px 10px; color:#c0392b;">${t('btn_delete')}</button>
        </td>
      </tr>
    `).join('');
    wireDeleteAccountButtons(tbody, loadSchoolTeachers);
    wireResetPasswordButtons(tbody, document.getElementById('schoolTeachersResult'));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}
function wireDeleteAccountButtons(container, onDone) {
  container.querySelectorAll('[data-delete-account]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm_delete_account'))) return;
      try { await apiCall('DELETE', `/api/school/accounts/${btn.dataset.deleteAccount}`); onDone(); }
      catch (e) { alert(e.message); }
    });
  });
}
// زر إعادة تعيين كلمة سر لأي حساب تابع للمدرسة (معلم أو طالب) - يولّد كلمة
// سر عشوائية قوية جديدة بالباك إند ويعرضها مرة وحدة بصندوق النتيجة، ويفعّل
// must_change_password تلقائيًا عشان صاحب الحساب يغيّرها أول ما يدخل
function wireResetPasswordButtons(container, resultBox) {
  container.querySelectorAll('[data-reset-account-pw]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm_reset_account_password'))) return;
      try {
        const data = await apiCall('POST', `/api/school/accounts/${btn.dataset.resetAccountPw}/reset-password`);
        if (resultBox) {
          resultBox.innerHTML = `${t('reset_password_result_msg', { name: data.identifier })}<br>🔑 <code>${escapeHtml(data.password)}</code>`;
          resultBox.classList.remove('hidden');
        }
      } catch (e) { alert(e.message); }
    });
  });
}
document.getElementById('addTeacherBtn').addEventListener('click', async () => {
  clearError('addTeacherError');
  const name = document.getElementById('newTeacherName').value.trim();
  const email = document.getElementById('newTeacherEmail').value.trim();
  if (!name || !email) { showError('addTeacherError', t('err_teacher_fields_required')); return; }
  try {
    const data = await apiCall('POST', '/api/school/teachers', { name, email });
    const box = document.getElementById('addTeacherResult');
    box.innerHTML = `${t('school_teacher_created_msg', { name })}<br>📧 ${escapeHtml(data.email)}<br>🔑 <code>${escapeHtml(data.password)}</code>`;
    box.classList.remove('hidden');
    document.getElementById('newTeacherName').value = '';
    document.getElementById('newTeacherEmail').value = '';
    loadSchoolTeachers();
    loadSchoolInfo();
  } catch (e) {
    showError('addTeacherError', e.message);
  }
});

async function loadSchoolClasses() {
  const tbody = document.getElementById('schoolClassesTableBody');
  try {
    const [classesData, teachersData] = await Promise.all([
      apiCall('GET', '/api/school/classes'),
      apiCall('GET', '/api/school/teachers'),
    ]);
    schoolClassesCache = classesData.classes;
    const teacherOptions = teachersData.teachers.map(tch => `<option value="${tch.user_id}">${escapeHtml(tch.username)}</option>`).join('');
    document.getElementById('newClassTeacher').innerHTML = `<option value="">${t('opt_no_teacher_yet')}</option>${teacherOptions}`;

    const classOptions = schoolClassesCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('scheduleClassSelect').innerHTML = classOptions;
    // تعبئة القائمة بس ما تولّد حدث change تلقائيًا - بدون هذا السطر، جدول
    // الفصل المختار افتراضيًا (أول فصل بالقائمة) ما يظهر إطلاقًا لين
    // المستخدم يبدّل الاختيار يدويًا (وحتى لو رجع لنفس أول فصل، ما يتحرك
    // شي لأن قيمة القائمة أصلًا ما تغيّرت)
    renderScheduleTable(document.getElementById('scheduleClassSelect').value);
    document.getElementById('bulkClassSelect').innerHTML = classOptions || `<option value="">${t('opt_create_class_first')}</option>`;
    document.getElementById('attendanceClassFilter').innerHTML = `<option value="">${t('opt_all_classes')}</option>${classOptions}`;

    if (!schoolClassesCache.length) {
      tbody.innerHTML = `<tr><td colspan="4">${t('school_no_classes')}</td></tr>`;
      return;
    }
    const studentsData = await apiCall('GET', '/api/school/students');
    const counts = {};
    studentsData.students.forEach(s => { if (s.class_id) counts[s.class_id] = (counts[s.class_id] || 0) + 1; });
    tbody.innerHTML = schoolClassesCache.map(c => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>
          <select class="text-input" data-reassign-class="${c.id}" style="padding:4px 8px; font-size:13px;">
            <option value="">${t('opt_no_teacher_yet')}</option>
            ${teachersData.teachers.map(tch => `<option value="${tch.user_id}" ${tch.user_id === c.teacher_id ? 'selected' : ''}>${escapeHtml(tch.username)}</option>`).join('')}
          </select>
        </td>
        <td>${counts[c.id] || 0}</td>
        <td><button class="ghost" data-delete-class="${c.id}" style="padding:4px 10px;">${t('btn_delete')}</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-reassign-class]').forEach(sel => {
      sel.addEventListener('change', async () => {
        try { await apiCall('PATCH', `/api/school/classes/${sel.dataset.reassignClass}`, { teacher_id: sel.value || null }); loadSchoolTeachers(); }
        catch (e) { alert(e.message); }
      });
    });
    tbody.querySelectorAll('[data-delete-class]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_class'))) return;
        try { await apiCall('DELETE', `/api/school/classes/${btn.dataset.deleteClass}`); loadSchoolClasses(); }
        catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`;
  }
}
document.getElementById('addClassBtn').addEventListener('click', async () => {
  clearError('addClassError');
  const name = document.getElementById('newClassName').value.trim();
  const teacher_id = document.getElementById('newClassTeacher').value || undefined;
  if (!name) { showError('addClassError', t('err_class_name_required')); return; }
  try {
    await apiCall('POST', '/api/school/classes', { name, teacher_id });
    document.getElementById('newClassName').value = '';
    loadSchoolClasses();
  } catch (e) {
    showError('addClassError', e.message);
  }
});

// كل طلاب المدرسة بأسمائهم الحقيقية الكاملة (لا بس اسم المستخدم المولّد) -
// مع زر إعادة تعيين كلمة سر لكل طالب لحاله
async function loadSchoolStudents() {
  const tbody = document.getElementById('schoolStudentsTableBody');
  tbody.innerHTML = `<tr><td colspan="4">${t('loading')}</td></tr>`;
  document.getElementById('schoolStudentsResult').classList.add('hidden');
  try {
    const [studentsData, classesData] = await Promise.all([
      apiCall('GET', '/api/school/students'),
      schoolClassesCache.length ? Promise.resolve({ classes: schoolClassesCache }) : apiCall('GET', '/api/school/classes'),
    ]);
    const classNames = {};
    classesData.classes.forEach(c => { classNames[c.id] = c.name; });
    if (!studentsData.students.length) { tbody.innerHTML = `<tr><td colspan="4">${t('no_students_in_school')}</td></tr>`; return; }
    tbody.innerHTML = studentsData.students.map(s => `
      <tr>
        <td>${escapeHtml(s.full_name || '—')}</td>
        <td>${escapeHtml(s.username)}</td>
        <td>${escapeHtml(classNames[s.class_id] || '—')}</td>
        <td>
          <button class="ghost" data-reset-account-pw="${s.user_id}" style="padding:4px 10px;">${t('btn_reset_password')}</button>
          <button class="ghost" data-delete-account="${s.user_id}" style="padding:4px 10px; color:#c0392b;">${t('btn_delete')}</button>
        </td>
      </tr>
    `).join('');
    wireResetPasswordButtons(tbody, document.getElementById('schoolStudentsResult'));
    wireDeleteAccountButtons(tbody, loadSchoolStudents);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message)}</td></tr>`;
  }
}

// نبنيها لحظة الاستخدام (مو مرة وحدة بأول تحميل الملف) عشان تطابق اللغة
// الحالية دايمًا حتى لو المستخدم بدّل اللغة بعد فتح الصفحة
function buildScheduleDayOptionsHtml() {
  return [0, 1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" data-i18n="day_${d}">${t(`day_${d}`)}</option>`).join('');
}

async function renderScheduleTable(classId) {
  const wrap = document.getElementById('scheduleTableWrap');
  if (!classId) { wrap.innerHTML = ''; return; }
  const dayNames = [t('day_0'), t('day_1'), t('day_2'), t('day_3'), t('day_4'), t('day_5'), t('day_6')];
  try {
    const data = await apiCall('GET', `/api/school/classes/${classId}/schedule`);
    if (!data.schedule.length) { wrap.innerHTML = `<p class="desc">${t('no_schedule_yet')}</p>`; return; }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>${t('th_day')}</th><th>${t('th_time')}</th><th>${t('th_subject')}</th><th>${t('th_actions')}</th>
      </tr></thead><tbody>${data.schedule.map(s => `
        <tr data-schedule-row="${s.id}" data-day="${s.day_of_week}" data-start="${escapeHtml(s.start_time)}" data-end="${escapeHtml(s.end_time)}" data-subject="${escapeHtml(s.subject || '')}">
          <td>${dayNames[s.day_of_week] || s.day_of_week}</td>
          <td>${escapeHtml(s.start_time)} - ${escapeHtml(s.end_time)}</td>
          <td>${escapeHtml(s.subject || '—')}</td>
          <td>
            <button class="ghost" data-edit-schedule="${s.id}" style="padding:4px 10px;">${t('btn_edit')}</button>
            <button class="ghost" data-delete-schedule="${s.id}" style="padding:4px 10px;">${t('btn_delete')}</button>
          </td>
        </tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[data-delete-schedule]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await apiCall('DELETE', `/api/school/schedule/${btn.dataset.deleteSchedule}`); renderScheduleTable(classId); }
        catch (e) { alert(e.message); }
      });
    });
    wrap.querySelectorAll('[data-edit-schedule]').forEach(btn => {
      btn.addEventListener('click', () => openScheduleRowEditor(btn.closest('tr'), classId));
    });
  } catch (e) {
    wrap.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

// يفتح تعديل صفي مباشر (بدل الحقول الثابتة) بنفس عناصر التحكم اللي بفورم
// الإضافة - يوم/وقت بداية/وقت نهاية/مادة، مع حفظ/إلغاء
function openScheduleRowEditor(row, classId) {
  const scheduleId = row.dataset.scheduleRow;
  row.innerHTML = `
    <td>
      <select class="text-input" id="editScheduleDay-${scheduleId}" style="padding:4px 8px; font-size:13px;">${buildScheduleDayOptionsHtml()}</select>
    </td>
    <td style="white-space:nowrap;">
      <input type="time" class="text-input" id="editScheduleStart-${scheduleId}" style="max-width:100px; padding:4px 8px; font-size:13px;">
      -
      <input type="time" class="text-input" id="editScheduleEnd-${scheduleId}" style="max-width:100px; padding:4px 8px; font-size:13px;">
    </td>
    <td><input type="text" class="text-input" id="editScheduleSubject-${scheduleId}" style="padding:4px 8px; font-size:13px;"></td>
    <td>
      <button class="primary" data-save-schedule="${scheduleId}" style="padding:4px 10px;">${t('btn_save')}</button>
      <button class="ghost" data-cancel-schedule="${scheduleId}" style="padding:4px 10px;">${t('btn_cancel')}</button>
    </td>
  `;
  document.getElementById(`editScheduleDay-${scheduleId}`).value = row.dataset.day;
  document.getElementById(`editScheduleStart-${scheduleId}`).value = row.dataset.start;
  document.getElementById(`editScheduleEnd-${scheduleId}`).value = row.dataset.end;
  document.getElementById(`editScheduleSubject-${scheduleId}`).value = row.dataset.subject;

  row.querySelector('[data-cancel-schedule]').addEventListener('click', () => renderScheduleTable(classId));
  row.querySelector('[data-save-schedule]').addEventListener('click', async () => {
    const day_of_week = parseInt(document.getElementById(`editScheduleDay-${scheduleId}`).value, 10);
    const start_time = document.getElementById(`editScheduleStart-${scheduleId}`).value;
    const end_time = document.getElementById(`editScheduleEnd-${scheduleId}`).value;
    const subject = document.getElementById(`editScheduleSubject-${scheduleId}`).value.trim();
    if (!start_time || !end_time) { alert(t('err_schedule_time_required')); return; }
    try {
      await apiCall('PATCH', `/api/school/schedule/${scheduleId}`, { day_of_week, start_time, end_time, subject });
      renderScheduleTable(classId);
    } catch (e) {
      alert(e.message);
    }
  });
}
document.getElementById('scheduleClassSelect').addEventListener('change', e => renderScheduleTable(e.target.value));
document.getElementById('addScheduleBtn').addEventListener('click', async () => {
  clearError('addScheduleError');
  const class_id = document.getElementById('scheduleClassSelect').value;
  const day_of_week = parseInt(document.getElementById('scheduleDay').value, 10);
  const start_time = document.getElementById('scheduleStart').value;
  const end_time = document.getElementById('scheduleEnd').value;
  const subject = document.getElementById('scheduleSubject').value.trim();
  if (!class_id) { showError('addScheduleError', t('err_pick_class_first')); return; }
  if (!start_time || !end_time) { showError('addScheduleError', t('err_schedule_time_required')); return; }
  try {
    await apiCall('POST', `/api/school/classes/${class_id}/schedule`, { day_of_week, start_time, end_time, subject });
    document.getElementById('scheduleSubject').value = '';
    renderScheduleTable(class_id);
  } catch (e) {
    showError('addScheduleError', e.message);
  }
});

let lastBulkAddResult = [];
document.getElementById('bulkAddStudentsBtn').addEventListener('click', async () => {
  clearError('bulkAddError');
  const class_id = document.getElementById('bulkClassSelect').value;
  const names = document.getElementById('bulkNamesInput').value.split('\n').map(n => n.trim()).filter(Boolean);
  if (!class_id) { showError('bulkAddError', t('err_pick_class_first')); return; }
  if (!names.length) { showError('bulkAddError', t('err_names_required')); return; }
  try {
    const data = await apiCall('POST', '/api/school/students/bulk', { class_id, names });
    lastBulkAddResult = data.students;
    document.getElementById('bulkAddResultBody').innerHTML = data.students.map(s => `
      <tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.username)}</td><td><code>${escapeHtml(s.password)}</code></td></tr>
    `).join('');
    document.getElementById('bulkAddResultWrap').classList.remove('hidden');
    document.getElementById('bulkNamesInput').value = '';
    loadSchoolInfo();
  } catch (e) {
    showError('bulkAddError', e.message);
  }
});
document.getElementById('bulkExportCsvBtn').addEventListener('click', () => {
  exportCsv('zakiy-students.csv', lastBulkAddResult.map(s => [s.name, s.username, s.password]), [t('th_name'), t('th_username'), t('th_password')]);
});
document.getElementById('bulkExportPdfBtn').addEventListener('click', () => {
  exportPdfViaPrint(t('bulk_result_heading'), lastBulkAddResult.map(s => [s.name, s.username, s.password]), [t('th_name'), t('th_username'), t('th_password')]);
});
document.getElementById('bulkExportQrBtn').addEventListener('click', () => {
  exportQrBooklet(lastBulkAddResult);
});

async function loadSchoolAttendance() {
  const tbody = document.getElementById('schoolAttendanceTableBody');
  tbody.innerHTML = `<tr><td colspan="3">${t('loading')}</td></tr>`;
  const classId = document.getElementById('attendanceClassFilter').value;
  try {
    const [attData, studentsData] = await Promise.all([
      apiCall('GET', `/api/school/attendance${classId ? `?class_id=${classId}` : ''}`),
      apiCall('GET', '/api/school/students'),
    ]);
    const studentNames = {};
    studentsData.students.forEach(s => { studentNames[s.user_id] = s.username; });
    const classNames = {};
    attData.classes.forEach(c => { classNames[c.id] = c.name; });
    if (!attData.attendance.length) { tbody.innerHTML = `<tr><td colspan="3">${t('no_attendance_yet')}</td></tr>`; return; }
    tbody.innerHTML = attData.attendance.map(a => `
      <tr>
        <td>${escapeHtml(studentNames[a.user_id] || a.user_id)}</td>
        <td>${escapeHtml(classNames[a.class_id] || '—')}</td>
        <td>${new Date(a.joined_at).toLocaleString(currentLang === 'ar' ? 'ar' : 'en')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(e.message)}</td></tr>`;
  }
}
document.getElementById('attendanceClassFilter').addEventListener('change', loadSchoolAttendance);

