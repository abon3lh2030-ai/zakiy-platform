// ---------- Teacher: لوحة المعلم ----------
let teacherClassesCache = [];

document.querySelectorAll('#step-teacher-dashboard .role-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('#step-teacher-dashboard .role-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');
    document.querySelectorAll('#step-teacher-dashboard .teacher-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`teacherTab-${tabBtn.dataset.tab}`).classList.remove('hidden');
    if (tabBtn.dataset.tab === 'schedule') renderTeacherSchedule();
    else if (tabBtn.dataset.tab === 'attendance') {
      renderTeacherAttendance();
      const dateInput = document.getElementById('manualAttendanceDate');
      if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
      loadManualAttendanceForm();
    } else if (tabBtn.dataset.tab === 'performance') renderTeacherPerformance();
  });
});

async function renderTeacherPerformance() {
  const tbody = document.getElementById('teacherPerformanceTableBody');
  tbody.innerHTML = `<tr><td colspan="5">${t('loading')}</td></tr>`;
  const classId = document.getElementById('teacherClassSelect').value;
  try {
    const data = await apiCall('GET', `/api/teacher/performance${classId ? `?class_id=${classId}` : ''}`);
    if (!data.performance.length) { tbody.innerHTML = `<tr><td colspan="5">${t('teacher_no_students')}</td></tr>`; return; }
    tbody.innerHTML = data.performance.map(p => `
      <tr>
        <td>${escapeHtml(p.username)}</td>
        <td>${p.attempts_count}</td>
        <td>${p.avg_score}%</td>
        <td>${p.total_study_minutes}</td>
        <td>${p.current_streak >= 3 ? `🔥 ${p.current_streak}` : p.current_streak}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}

async function loadTeacherDashboard() {
  try {
    const data = await apiCall('GET', '/api/teacher/roster');
    teacherClassesCache = data.classes;
    const select = document.getElementById('teacherClassSelect');
    select.innerHTML = `<option value="">${t('opt_all_my_classes')}</option>` +
      teacherClassesCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    renderTeacherRoster(data.students);
  } catch (e) {
    document.getElementById('teacherRosterTableBody').innerHTML = `<tr><td colspan="2">${escapeHtml(e.message)}</td></tr>`;
  }
}
function renderTeacherRoster(students) {
  const filterClassId = document.getElementById('teacherClassSelect').value;
  const filtered = filterClassId ? students.filter(s => s.class_id === filterClassId) : students;
  const tbody = document.getElementById('teacherRosterTableBody');
  if (!filtered.length) { tbody.innerHTML = `<tr><td colspan="2">${t('teacher_no_students')}</td></tr>`; return; }
  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td>${escapeHtml(s.username)}</td>
      <td><button class="ghost" data-view-student="${s.user_id}" style="padding:4px 10px;">${t('btn_view_profile')}</button></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-view-student]').forEach(btn => {
    btn.addEventListener('click', () => openTeacherStudentProfile(btn.dataset.viewStudent));
  });
}
document.getElementById('teacherClassSelect').addEventListener('change', async () => {
  const activeTab = document.querySelector('#step-teacher-dashboard .role-tab.active')?.dataset.tab;
  if (activeTab === 'performance') { renderTeacherPerformance(); return; }
  if (activeTab === 'schedule') { renderTeacherSchedule(); return; }
  if (activeTab === 'attendance') { renderTeacherAttendance(); return; }
  const data = await apiCall('GET', '/api/teacher/roster').catch(() => ({ students: [] }));
  renderTeacherRoster(data.students);
});

document.getElementById('teacherStartClassBtn').addEventListener('click', async () => {
  clearError('teacherStartClassError');
  // القائمة تبدأ افتراضيًا على "كل فصولي" (value فاضية) لغرض تصفح جدول
  // الطلاب/الأداء - بس ما فيه معنى لدرس مباشر "لكل الفصول"، فلو المعلم ما
  // غيّر الاختيار وعنده فصل واحد بس نبدأ فيه تلقائيًا بدل ما نوقفه بخطأ
  // ونجبره يرجع يفتح القائمة يدويًا - يقدر يبدأ درس بأي وقت بضغطة وحدة
  let classId = document.getElementById('teacherClassSelect').value;
  if (!classId && teacherClassesCache.length === 1) classId = teacherClassesCache[0].id;
  if (!classId) { showError('teacherStartClassError', t('err_pick_class_first')); return; }
  try {
    const res = await fetch(`${API_BASE}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({ room_type: 'classroom', class_id: classId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_create_room_failed'));
    // نستخدم نفس مسار انضمام الغرفة الموجود (اجتماعية/كلاس مباشر) - الاستماع
    // لحدث room_state هو اللي يوديك فعليًا لشاشة الكلاس (step-classroom) ويفعّل
    // السبورة والصوت والشات، وبما إنه مربوط بـ class_id يسجّل حضور تلقائي
    myName = currentUsername;
    joinErrorTarget = 'teacherStartClassError';
    socket.emit('join_room', { room_code: data.room_code, name: myName, client_id: clientId, token: currentAccessToken });
  } catch (err) {
    showError('teacherStartClassError', err.message || t('err_unexpected'));
  }
});

async function renderTeacherSchedule() {
  const wrap = document.getElementById('teacherScheduleWrap');
  wrap.innerHTML = t('loading');
  const dayNames = [t('day_0'), t('day_1'), t('day_2'), t('day_3'), t('day_4'), t('day_5'), t('day_6')];
  try {
    const data = await apiCall('GET', '/api/teacher/schedule');
    if (!data.schedule.length) { wrap.innerHTML = `<p class="desc">${t('no_schedule_yet')}</p>`; return; }
    const classNames = {};
    data.classes.forEach(c => { classNames[c.id] = c.name; });
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>${t('th_class_name')}</th><th>${t('th_day')}</th><th>${t('th_time')}</th><th>${t('th_subject')}</th>
      </tr></thead><tbody>${data.schedule.map(s => `
        <tr>
          <td>${escapeHtml(classNames[s.class_id] || '—')}</td>
          <td>${dayNames[s.day_of_week] || s.day_of_week}</td>
          <td>${escapeHtml(s.start_time)} - ${escapeHtml(s.end_time)}</td>
          <td>${escapeHtml(s.subject || '—')}</td>
        </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    wrap.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

async function renderTeacherAttendance() {
  const tbody = document.getElementById('teacherAttendanceTableBody');
  tbody.innerHTML = `<tr><td colspan="2">${t('loading')}</td></tr>`;
  try {
    const [attData, rosterData] = await Promise.all([
      apiCall('GET', '/api/teacher/attendance'),
      apiCall('GET', '/api/teacher/roster'),
    ]);
    const studentNames = {};
    rosterData.students.forEach(s => { studentNames[s.user_id] = s.username; });
    if (!attData.attendance.length) { tbody.innerHTML = `<tr><td colspan="2">${t('no_attendance_yet')}</td></tr>`; return; }
    tbody.innerHTML = attData.attendance.map(a => `
      <tr><td>${escapeHtml(studentNames[a.user_id] || a.user_id)}</td><td>${new Date(a.joined_at).toLocaleString(currentLang === 'ar' ? 'ar' : 'en')}</td></tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="2">${escapeHtml(e.message)}</td></tr>`;
  }
}

async function openTeacherStudentProfile(userId) {
  const content = document.getElementById('teacherStudentProfileContent');
  content.innerHTML = t('loading');
  show('teacherStudentProfileModal');
  try {
    const p = await apiCall('GET', `/api/teacher/students/${userId}`);
    const perf = p.performance || {};
    content.innerHTML = `
      <h2 style="margin-top:0;">${escapeHtml(p.username)}</h2>
      <h3 class="sub-heading" data-i18n="performance_heading_default">📊 الأداء</h3>
      <p class="desc">${t('stat_attempts')}: ${perf.attempts_count ?? 0} — ${t('stat_avg')}: ${perf.avg_score ?? 0}% — ${t('stat_study_minutes')}: ${perf.total_study_minutes ?? 0}</p>
      <h3 class="sub-heading" data-i18n="nav_archive">📂 الأرشيف</h3>
      ${(p.archive || []).length
        ? `<ul style="padding-inline-start:20px;">${p.archive.map(a => `<li>${escapeHtml(a.title || a.room_code || '—')}</li>`).join('')}</ul>`
        : `<p class="desc">${t('teacher_student_no_archive')}</p>`}
    `;
  } catch (e) {
    content.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}
document.getElementById('teacherStudentProfileClose').addEventListener('click', () => hide('teacherStudentProfileModal'));

