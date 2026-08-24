// ---------- كشف الدرجات (معلم بس) - مشاركة ومهام أدائية يحطهم المعلم يدويًا،
// والواجبات والاختبارات تُحسب تلقائيًا من درجاتها الموجودة أصلًا، والمجموع
// يُحسب لحظيًا بدون ما يقدر المعلم يعدّله ----------
let gradesheetClassesCache = [];

async function loadGradesheetScreen() {
  document.getElementById('gradesheetError').innerHTML = '';
  document.getElementById('gradesheetTableBody').innerHTML = '';
  try {
    const roster = await apiCall('GET', '/api/teacher/roster');
    gradesheetClassesCache = roster.classes || [];
    document.getElementById('gradesheetClassSelect').innerHTML =
      gradesheetClassesCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (gradesheetClassesCache.length) {
      await loadGradesheetTable();
    }
  } catch (e) {
    document.getElementById('gradesheetError').innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

async function loadGradesheetTable() {
  const classId = document.getElementById('gradesheetClassSelect').value;
  const tbody = document.getElementById('gradesheetTableBody');
  const errBox = document.getElementById('gradesheetError');
  errBox.innerHTML = '';
  if (!classId) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = `<tr><td colspan="7">${t('loading')}</td></tr>`;
  try {
    const { students } = await apiCall('GET', `/api/teacher/gradesheet?class_id=${classId}`);
    if (!students.length) {
      tbody.innerHTML = `<tr><td colspan="7">${t('gradesheet_empty')}</td></tr>`;
      return;
    }
    tbody.innerHTML = students.map(s => `
      <tr data-student-id="${s.user_id}">
        <td>${escapeHtml(s.full_name || s.username)}</td>
        <td><input type="number" step="0.01" class="text-input gs-participation-input" style="width:80px;" value="${s.participation}"></td>
        <td><input type="number" step="0.01" class="text-input gs-performance-input" style="width:80px;" value="${s.performance_tasks}"></td>
        <td>${s.assignments_avg === null ? '—' : s.assignments_avg} <span class="desc">(${s.assignments_count})</span></td>
        <td>${s.quizzes_avg === null ? '—' : s.quizzes_avg} <span class="desc">(${s.quizzes_count})</span></td>
        <td class="gs-total-cell" style="font-weight:700;">${s.total}</td>
        <td><button class="ghost gs-save-btn" style="padding:4px 10px;">${t('btn_save')}</button></td>
      </tr>
    `).join('');
    wireGradesheetRowEvents(classId);
  } catch (e) {
    tbody.innerHTML = '';
    errBox.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

function wireGradesheetRowEvents(classId) {
  document.querySelectorAll('#gradesheetTableBody .gs-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const studentId = row.dataset.studentId;
      const participation = row.querySelector('.gs-participation-input').value;
      const performanceTasks = row.querySelector('.gs-performance-input').value;
      btn.disabled = true;
      try {
        await apiCall('PATCH', `/api/teacher/gradesheet/${studentId}`, {
          class_id: classId,
          participation: participation === '' ? 0 : Number(participation),
          performance_tasks: performanceTasks === '' ? 0 : Number(performanceTasks),
        });
        await loadGradesheetTable();
      } catch (e) {
        document.getElementById('gradesheetError').innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
        btn.disabled = false;
      }
    });
  });
}

document.getElementById('gradesheetClassSelect').addEventListener('change', () => {
  loadGradesheetTable();
});
