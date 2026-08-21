// ---------- Admin: لوحة المدارس ----------
async function loadAdminDashboard() {
  const tbody = document.getElementById('adminSchoolsTableBody');
  tbody.innerHTML = `<tr><td colspan="5">${t('loading')}</td></tr>`;
  try {
    const data = await apiCall('GET', '/api/admin/schools');
    if (!data.schools.length) { tbody.innerHTML = `<tr><td colspan="5">${t('admin_no_schools')}</td></tr>`; return; }
    tbody.innerHTML = data.schools.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.admin_email || '—')}</td>
        <td>${s.accounts_used} / ${s.max_accounts}</td>
        <td>${s.is_active ? t('status_active') : t('status_inactive')}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="ghost" data-toggle-school="${s.id}" data-active="${s.is_active}" style="padding:4px 10px;">${s.is_active ? t('btn_deactivate') : t('btn_activate')}</button>
          <button class="ghost" data-reset-school-pw="${s.id}" style="padding:4px 10px;">${t('btn_reset_password')}</button>
          <button class="ghost" data-delete-school="${s.id}" style="padding:4px 10px; color:#c0392b;">${t('btn_delete')}</button>
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-toggle-school]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await apiCall('PATCH', `/api/admin/schools/${btn.dataset.toggleSchool}`, { is_active: btn.dataset.active !== 'true' });
          loadAdminDashboard();
        } catch (e) { alert(e.message); }
      });
    });
    tbody.querySelectorAll('[data-reset-school-pw]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirm_reset_school_password'))) return;
        try {
          const res = await apiCall('POST', `/api/admin/schools/${btn.dataset.resetSchoolPw}/reset-admin-password`);
          const box = document.getElementById('createSchoolResult');
          box.innerHTML = `${t('admin_password_reset_msg')}<br>📧 ${escapeHtml(res.email)}<br>🔑 <code>${escapeHtml(res.password)}</code>`;
          box.classList.remove('hidden');
          box.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { alert(e.message); }
      });
    });
    tbody.querySelectorAll('[data-delete-school]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirm_delete_school'))) return;
        try {
          await apiCall('DELETE', `/api/admin/schools/${btn.dataset.deleteSchool}`);
          loadAdminDashboard();
        } catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(e.message)}</td></tr>`;
  }
}
document.getElementById('createSchoolBtn').addEventListener('click', async () => {
  clearError('createSchoolError');
  const name = document.getElementById('newSchoolName').value.trim();
  const admin_email = document.getElementById('newSchoolAdminEmail').value.trim();
  const max_accounts = parseInt(document.getElementById('newSchoolMaxAccounts').value, 10) || 0;
  if (!name || !admin_email) { showError('createSchoolError', t('err_school_fields_required')); return; }
  try {
    const data = await apiCall('POST', '/api/admin/schools', { name, admin_email, max_accounts });
    const box = document.getElementById('createSchoolResult');
    box.innerHTML = `${t('admin_school_created_msg', { name })}<br>📧 ${escapeHtml(data.school_admin.email)}<br>🔑 <code>${escapeHtml(data.school_admin.password)}</code>`;
    box.classList.remove('hidden');
    document.getElementById('newSchoolName').value = '';
    document.getElementById('newSchoolAdminEmail').value = '';
    document.getElementById('newSchoolMaxAccounts').value = '';
    loadAdminDashboard();
  } catch (e) {
    showError('createSchoolError', e.message);
  }
});

