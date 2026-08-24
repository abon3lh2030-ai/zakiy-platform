// ============================================================================
// ---------- نظام إدارة حسابات المدارس (٥ أدوار) ----------
// Admin (عام) → School Admin/School Administration (لكل مدرسة) → Teacher → Student
// ============================================================================

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function apiCall(method, path, body) {
  const opts = { method, headers: { 'Authorization': `Bearer ${currentAccessToken}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('err_unexpected'));
  return data;
}

const INSTITUTIONAL_DASHBOARD_SCREENS = {
  admin: 'step-admin-dashboard',
  school_admin: 'step-school-dashboard',
  school_administration: 'step-school-dashboard',
  teacher: 'step-teacher-dashboard',
};

function routeByRole(role) {
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('login-form'); hide('signup-form'); hide('step-force-password-change');
  show('sidebar');
  const screenId = INSTITUTIONAL_DASHBOARD_SCREENS[role];
  if (!screenId) {
    show('mode-select');
    // نفس مبدأ proceedToApp - نرجّع شاشة محفوظة من قبل آخر Reload لو موجودة
    // (الطالب مثلًا يستخدم نفس تجربة mode-select، فيه سايد بار وشاشات
    // فرعية زي الواجبات/الرسائل تحتاج نفس الاستعادة)
    if (tryRestoreLastScreen()) navHistory = [['mode-select']];
    return;
  }
  show(screenId);
  if (tryRestoreLastScreen()) navHistory = [[screenId]];
  if (role === 'admin') loadAdminDashboard();
  else if (role === 'school_admin' || role === 'school_administration') loadSchoolDashboard();
  else if (role === 'teacher') loadTeacherDashboard();
}

// ---------- بوابة إجبار تغيير كلمة السر أول دخول ----------
document.getElementById('forcePwSubmitBtn').addEventListener('click', async () => {
  clearError('forcePwError');
  const pass1 = document.getElementById('forcePwNew').value;
  const pass2 = document.getElementById('forcePwConfirm').value;
  if (pass1.length < 6) { showError('forcePwError', t('err_password_min')); return; }
  if (pass1 !== pass2) { showError('forcePwError', t('err_password_mismatch')); return; }
  const { error } = await supabaseClient.auth.updateUser({ password: pass1 });
  if (error) { showError('forcePwError', error.message || t('err_unexpected')); return; }
  try { await apiCall('POST', '/api/me/complete-password-change'); } catch { /* غير حرج - الأهم كلمة السر فعليًا اتغيرت */ }
  document.getElementById('forcePwNew').value = '';
  document.getElementById('forcePwConfirm').value = '';
  navHistory = [];
  if (currentUserRole) routeByRole(currentUserRole); else proceedToApp();
  updateGlobalBackButton();
});

// ---------- تصدير CSV/PDF بدون أي مكتبة خارجية ----------
function exportCsv(filename, rows, headers) {
  const csvLines = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))];
  const blob = new Blob(['﻿' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function exportPdfViaPrint(title, rows, headers) {
  const win = window.open('', '_blank');
  const tableHtml = `
    <h2>${escapeHtml(title)}</h2>
    <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; font-family:sans-serif; direction:rtl;">
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  win.document.write(`<html><head><title>${escapeHtml(title)}</title></head><body>${tableHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

// ---------- تصدير QR بالجملة (طالب واحد لكل صفحة مطبوعة) - بطاقة كل طالب
// فيها: الاسم، ثم QR "بيانات الدخول" (يفتح صفحة الدخول معبّاة تلقائيًا
// باسم المستخدم وكلمة السر عبر ?login_user=&login_pass=، شوف 03-auth.js)،
// ثم QR "فتح المنصة" (يفتح الرابط العادي بدون أي بيانات). النافذة الجديدة
// مستقلة عن DOM الصفحة الأصلية فنولّد كل QR كصورة PNG (data URL) عبر
// qrDataUrl بدل ما نحاول ننقل عناصر canvas بين النافذتين ----------
function exportQrBooklet(students) {
  if (!students || !students.length) return;
  const baseUrl = `${location.origin}${location.pathname}`;
  const pagesHtml = students.map(s => {
    const loginUrl = `${baseUrl}?login_user=${encodeURIComponent(s.username)}&login_pass=${encodeURIComponent(s.password)}`;
    let loginQrImg = '';
    let platformQrImg = '';
    try { loginQrImg = `<img src="${qrDataUrl(loginUrl)}" width="220" height="220" alt="QR">`; }
    catch { loginQrImg = `<p>${escapeHtml(t('err_qr_generation'))}</p>`; }
    try { platformQrImg = `<img src="${qrDataUrl(baseUrl)}" width="220" height="220" alt="QR">`; }
    catch { platformQrImg = `<p>${escapeHtml(t('err_qr_generation'))}</p>`; }
    return `
      <div class="qr-export-page">
        <h2>${escapeHtml(s.name)}</h2>
        <div class="qr-export-block">
          <h3>${escapeHtml(t('qr_export_login_heading'))}</h3>
          ${loginQrImg}
          <p>${escapeHtml(t('th_username'))}: <b>${escapeHtml(s.username)}</b><br>${escapeHtml(t('th_password'))}: <b>${escapeHtml(s.password)}</b></p>
        </div>
        <div class="qr-export-block">
          <h3>${escapeHtml(t('qr_export_platform_heading'))}</h3>
          ${platformQrImg}
          <p>${escapeHtml(baseUrl)}</p>
        </div>
      </div>`;
  }).join('');
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>${escapeHtml(t('qr_export_title'))}</title>
    <style>
      body { font-family: sans-serif; direction: rtl; }
      .qr-export-page { page-break-after: always; text-align: center; padding: 40px 20px; }
      .qr-export-page:last-child { page-break-after: auto; }
      .qr-export-block { margin: 24px 0; }
      .qr-export-block img { display: block; margin: 12px auto; }
      h2 { font-size: 28px; }
      h3 { font-size: 18px; color: #444; }
      p { font-size: 16px; }
    </style>
    </head><body>${pagesHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

