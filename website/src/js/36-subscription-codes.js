// ============================================================================
// ---------- أكواد الاشتراك والخصم + إدارة الباقات للأدمن العام ----------
// ============================================================================
let adminCommerceCache = null;

function normalizeOfferCodeInput(input) {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function redeemSubscriptionCode() {
  const input = document.getElementById('subscriptionRedeemCode');
  const msg = document.getElementById('subscriptionRedeemMsg');
  const button = document.getElementById('subscriptionRedeemBtn');
  const code = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(code)) { showError('subscriptionRedeemMsg', t('redeem_invalid')); return; }
  if (!confirm(t('redeem_confirm'))) return;
  button.disabled = true; msg.textContent = t('loading');
  try {
    const result = await apiCall('POST', '/api/subscription/redeem', { code });
    subscriptionMeCache = await apiCall('GET', '/api/subscription/me');
    input.value = '';
    msg.innerHTML = `<div class="desc" style="color:var(--teal)">✅ ${escapeHtml(t('redeem_success', { date: formatSubscriptionDate(result.expires_at) }))}</div>`;
    renderSubscriptionPlans();
  } catch (error) { showError('subscriptionRedeemMsg', error.message); }
  finally { button.disabled = false; }
}

async function applySubscriptionDiscount() {
  const input = document.getElementById('subscriptionDiscountCode');
  const button = document.getElementById('subscriptionDiscountApplyBtn');
  const code = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) { showError('subscriptionDiscountMsg', t('discount_invalid')); return; }
  button.disabled = true;
  try {
    subscriptionDiscountCodeDetails = await apiCall('POST', '/api/subscription/discount/validate', { code });
    document.getElementById('subscriptionDiscountMsg').innerHTML = `<div class="subscription-discount-applied">✅ ${escapeHtml(t('discount_applied', { percent: subscriptionDiscountCodeDetails.discount_percent }))}</div>`;
    document.getElementById('subscriptionDiscountClearBtn').classList.remove('hidden');
    input.disabled = true; button.classList.add('hidden');
    renderSubscriptionPlans();
  } catch (error) { showError('subscriptionDiscountMsg', error.message); }
  finally { button.disabled = false; }
}

function clearSubscriptionDiscount() {
  subscriptionDiscountCodeDetails = null;
  const input = document.getElementById('subscriptionDiscountCode');
  input.value = ''; input.disabled = false;
  document.getElementById('subscriptionDiscountApplyBtn').classList.remove('hidden');
  document.getElementById('subscriptionDiscountClearBtn').classList.add('hidden');
  clearError('subscriptionDiscountMsg');
  renderSubscriptionPlans();
}

const ADMIN_PLAN_FIELDS = [
  ['name_ar','الاسم بالعربي','text'], ['name_en','الاسم بالإنجليزي','text'],
  ['price_monthly','السعر الشهري','number'], ['price_annual','السعر السنوي','number'],
  ['library_limit','حد الكتب','number'], ['solo_daily','الجلسات الفردية/يوم','number'],
  ['group_daily','الجلسات الجماعية/يوم','number'], ['lesson_daily','الدروس المباشرة/يوم','number'],
  ['ai_assistant_daily','رسائل المساعد/يوم','number'], ['archive_limit','حد الأرشيف','number'],
  ['performance_limit','حد نتائج الأداء','number'], ['sort_order','ترتيب العرض','number'],
];

function adminPlanFormHtml(plan = {}, prefix = 'admin-plan', isNew = false) {
  const keyField = isNew ? `<label>المعرّف الإنجليزي (اختياري)<input class="text-input" data-plan-field="plan_key" value="" placeholder="starter"></label>` : '';
  const fields = ADMIN_PLAN_FIELDS.map(([key,label,type]) => {
    const value = plan[key] === null || plan[key] === undefined ? '' : plan[key];
    const placeholder = key.includes('limit') || key.includes('daily') ? 'فارغ = بلا حدود' : '';
    return `<label>${label}<input class="text-input" data-plan-field="${key}" type="${type}" min="0" value="${escapeHtml(value)}" placeholder="${placeholder}"></label>`;
  }).join('');
  return `<div class="admin-plan-form" data-plan-form="${escapeHtml(prefix)}">${keyField}${fields}</div>
    <div class="admin-plan-checks">
      <label><input type="checkbox" data-plan-field="is_active" ${plan.is_active !== false ? 'checked' : ''}> مفعّلة</label>
      <label><input type="checkbox" data-plan-field="is_public" ${plan.is_public !== false ? 'checked' : ''}> تظهر للمستخدمين</label>
      <label><input type="checkbox" data-plan-field="trial_eligible" ${plan.trial_eligible !== false ? 'checked' : ''}> تدعم التجربة</label>
      <label><input type="checkbox" data-plan-field="unlimited_access" ${plan.unlimited_access ? 'checked' : ''}> وصول كامل بلا حدود</label>
    </div>`;
}

function collectAdminPlanForm(container) {
  const data = {};
  container.querySelectorAll('[data-plan-field]').forEach(input => {
    if (input.type === 'checkbox') data[input.dataset.planField] = input.checked;
    else if (input.type === 'number') data[input.dataset.planField] = input.value === '' ? null : Number(input.value);
    else data[input.dataset.planField] = input.value.trim();
  });
  return data;
}

function adminCommerceDate(value) {
  return value ? new Date(value).toLocaleString(currentLang === 'en' ? 'en-US' : 'ar-SA') : '—';
}

function adminPlanDisplayName(plan) { return currentLang === 'en' ? plan.name_en : plan.name_ar; }

function renderAdminCommerce(data) {
  adminCommerceCache = data;
  const editor = document.getElementById('adminPlansEditor');
  editor.innerHTML = data.plans.map(plan => `<article class="admin-plan-editor" data-admin-plan="${escapeHtml(plan.plan_key)}">
    <header><div><strong>${escapeHtml(adminPlanDisplayName(plan))}</strong> <code>${escapeHtml(plan.plan_key)}</code></div><span class="admin-code-state ${plan.is_active ? 'available' : 'expired'}">${plan.is_active ? 'فعال' : 'مخفي'}</span></header>
    ${adminPlanFormHtml(plan, plan.plan_key)}
    <div class="actions"><button class="primary" data-save-plan="${escapeHtml(plan.plan_key)}">حفظ التعديلات</button>${!['free','owner'].includes(plan.plan_key) ? `<button class="ghost" data-delete-plan="${escapeHtml(plan.plan_key)}" style="color:var(--danger)">حذف/إخفاء</button>` : ''}</div>
  </article>`).join('');
  document.getElementById('adminNewPlanForm').innerHTML = adminPlanFormHtml({ is_active:true,is_public:true,trial_eligible:true,sort_order:100 }, 'new', true);
  document.getElementById('adminRedemptionPlan').innerHTML = data.plans.filter(plan => plan.is_active && plan.is_public && !['free','owner'].includes(plan.plan_key)).map(plan => `<option value="${escapeHtml(plan.plan_key)}">${escapeHtml(adminPlanDisplayName(plan))}</option>`).join('');

  editor.querySelectorAll('[data-save-plan]').forEach(button => button.addEventListener('click', () => saveAdminPlan(button.dataset.savePlan)));
  editor.querySelectorAll('[data-delete-plan]').forEach(button => button.addEventListener('click', () => deleteAdminPlan(button.dataset.deletePlan)));

  document.getElementById('adminRedemptionCodesBody').innerHTML = data.redemption_codes.length ? data.redemption_codes.map(row => {
    const expired = new Date(row.expires_at) <= new Date();
    const state = row.used_at ? 'مستخدم' : expired ? 'منتهي' : 'متاح';
    const cls = row.used_at ? 'used' : expired ? 'expired' : 'available';
    const plan = data.plans.find(item => item.plan_key === row.plan_key);
    return `<tr><td><code>${escapeHtml(row.code)}</code></td><td>${escapeHtml(plan ? adminPlanDisplayName(plan) : row.plan_key)}</td><td>${adminPeriodName(row.period)}</td><td><span class="admin-code-state ${cls}">${state}</span></td><td>${adminCommerceDate(row.expires_at)}</td></tr>`;
  }).join('') : '<tr><td colspan="5">لا توجد أكواد بعد</td></tr>';

  document.getElementById('adminDiscountCodesBody').innerHTML = data.discount_codes.length ? data.discount_codes.map(row => `<tr><td><code>${escapeHtml(row.code)}</code></td><td>${row.discount_percent}%</td><td>${row.usage_count} / ${row.usage_limit}</td><td>${adminCommerceDate(row.expires_at)}</td><td><span class="admin-code-state ${row.is_active ? 'available' : 'expired'}">${row.is_active ? 'فعال' : 'موقوف'}</span></td><td>${row.is_active ? `<button class="ghost" data-disable-discount="${escapeHtml(row.code)}">إيقاف</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6">لا توجد أكواد خصم بعد</td></tr>';
  document.querySelectorAll('[data-disable-discount]').forEach(button => button.addEventListener('click', () => disableAdminDiscount(button.dataset.disableDiscount)));
}

async function loadAdminCommerceManagement() {
  if (!document.getElementById('adminPlansEditor') || currentUserRole !== 'admin') return;
  try { renderAdminCommerce(await apiCall('GET', '/api/admin/subscription-management')); }
  catch (error) { showError('adminPlansMsg', error.message); }
}

async function saveAdminPlan(key) {
  const article = document.querySelector(`[data-admin-plan="${CSS.escape(key)}"]`);
  try {
    await apiCall('PUT', `/api/admin/subscription-plans/${encodeURIComponent(key)}`, collectAdminPlanForm(article));
    document.getElementById('adminPlansMsg').innerHTML = '<div class="desc">✅ تم حفظ الباقة.</div>';
    await loadAdminCommerceManagement();
  } catch (error) { showError('adminPlansMsg', error.message); }
}

async function deleteAdminPlan(key) {
  if (!confirm('سيتم إخفاء الباقة ومنع الاشتراكات الجديدة بها. هل تريد المتابعة؟')) return;
  try { await apiCall('DELETE', `/api/admin/subscription-plans/${encodeURIComponent(key)}`); await loadAdminCommerceManagement(); }
  catch (error) { showError('adminPlansMsg', error.message); }
}

async function createAdminPlan() {
  try {
    await apiCall('POST', '/api/admin/subscription-plans', collectAdminPlanForm(document.getElementById('adminNewPlanForm').parentElement));
    document.getElementById('adminPlansMsg').innerHTML = '<div class="desc">✅ تم نشر الباقة الجديدة.</div>';
    await loadAdminCommerceManagement();
  } catch (error) { showError('adminPlansMsg', error.message); }
}

async function generateAdminRedemptionCode() {
  const result = document.getElementById('adminRedemptionResult');
  try {
    const data = await apiCall('POST', '/api/admin/redemption-codes', { plan:document.getElementById('adminRedemptionPlan').value, period:document.getElementById('adminRedemptionPeriod').value });
    result.innerHTML = `<div class="admin-code-value"><div><small>الكود الجديد — صالح سنة ولمرة واحدة</small><br><code>${escapeHtml(data.code.code)}</code></div><button class="ghost" id="copyNewRedemptionCode">نسخ</button></div>`;
    result.classList.remove('hidden');
    document.getElementById('copyNewRedemptionCode').onclick = async () => { await navigator.clipboard.writeText(data.code.code); document.getElementById('copyNewRedemptionCode').textContent='تم النسخ ✓'; };
    await loadAdminCommerceManagement();
  } catch (error) { result.classList.remove('hidden'); result.textContent = error.message; }
}

async function createAdminDiscount() {
  const payload = {
    code: document.getElementById('adminDiscountCode').value,
    discount_percent: document.getElementById('adminDiscountPercent').value,
    expires_at: localDatetimeToIso(document.getElementById('adminDiscountExpiry').value),
    usage_limit: document.getElementById('adminDiscountLimit').value,
  };
  try {
    const data = await apiCall('POST', '/api/admin/discount-codes', payload);
    document.getElementById('adminDiscountMsg').innerHTML = `<div class="desc">✅ تم نشر الكود <code>${escapeHtml(data.code.code)}</code></div>`;
    ['adminDiscountCode','adminDiscountPercent','adminDiscountExpiry','adminDiscountLimit'].forEach(id => { document.getElementById(id).value=''; });
    await loadAdminCommerceManagement();
  } catch (error) { showError('adminDiscountMsg', error.message); }
}

async function disableAdminDiscount(code) {
  if (!confirm('إيقاف كود الخصم؟')) return;
  try { await apiCall('DELETE', `/api/admin/discount-codes/${encodeURIComponent(code)}`); await loadAdminCommerceManagement(); }
  catch (error) { showError('adminDiscountMsg', error.message); }
}

document.querySelectorAll('.offer-code-input').forEach(input => input.addEventListener('input', () => normalizeOfferCodeInput(input)));
document.getElementById('subscriptionRedeemBtn')?.addEventListener('click', redeemSubscriptionCode);
document.getElementById('subscriptionDiscountApplyBtn')?.addEventListener('click', applySubscriptionDiscount);
document.getElementById('subscriptionDiscountClearBtn')?.addEventListener('click', clearSubscriptionDiscount);
document.getElementById('adminCreatePlanBtn')?.addEventListener('click', createAdminPlan);
document.getElementById('adminGenerateRedemptionBtn')?.addEventListener('click', generateAdminRedemptionCode);
document.getElementById('adminCreateDiscountBtn')?.addEventListener('click', createAdminDiscount);
