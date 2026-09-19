// ---------- Admin: تحليلات نمو المنصة والاشتراكات ----------
let adminAnalyticsPeriod = '30d';

function adminNumber(value, digits = 0) {
  return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'ar-SA', {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function adminCurrency(value) {
  return `${adminNumber(value, 2)} ${t('currency_sar_short')}`;
}

function adminPlanName(plan) {
  return plan ? t(`plan_${plan}`) : '—';
}

function adminPeriodName(period) {
  if (period === 'monthly') return t('period_monthly');
  if (period === 'annual') return t('period_annual');
  return '—';
}

function renderAdminLineChart(elementId, series, color = '#2e5bdb') {
  const target = document.getElementById(elementId);
  if (!target) return;
  if (!series?.length || series.every(point => Number(point.value) === 0)) {
    target.innerHTML = `<span>${t('admin_no_data_period')}</span>`;
    return;
  }
  const width = 640, height = 218, left = 34, right = 12, top = 12, bottom = 28;
  const values = series.map(point => Number(point.value || 0));
  const max = Math.max(...values, 1);
  const x = i => left + (series.length === 1 ? 0 : i * (width - left - right) / (series.length - 1));
  const y = value => top + (height - top - bottom) * (1 - value / max);
  const points = values.map((value, i) => `${x(i)},${y(value)}`).join(' ');
  const area = `${left},${height - bottom} ${points} ${x(series.length - 1)},${height - bottom}`;
  const labelIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img">
    <defs><linearGradient id="adminChartGradient-${elementId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${[0,.5,1].map(f => `<line class="admin-chart-gridline" x1="${left}" x2="${width-right}" y1="${top+(height-top-bottom)*f}" y2="${top+(height-top-bottom)*f}"/>`).join('')}
    <polygon points="${area}" fill="url(#adminChartGradient-${elementId})"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${values.map((value,i) => `<circle cx="${x(i)}" cy="${y(value)}" r="${series.length < 35 ? 3 : 1.5}" fill="var(--card)" stroke="${color}" stroke-width="2"><title>${series[i].key}: ${adminNumber(value,2)}</title></circle>`).join('')}
    <text class="admin-chart-label" x="4" y="${top+4}">${adminNumber(max,1)}</text><text class="admin-chart-label" x="14" y="${height-bottom+3}">0</text>
    ${labelIndexes.map(i => `<text class="admin-chart-label" x="${x(i)}" y="${height-6}" text-anchor="middle">${escapeHtml(series[i].key.slice(5).replace('T',' '))}</text>`).join('')}
  </svg>`;
}

function renderAdminComparisonChart(newSeries, cancelledSeries) {
  const target = document.getElementById('chartNewVsCancelled');
  if (!target) return;
  const rows = (newSeries || []).map((point, i) => ({
    key: point.key, added: Number(point.value || 0), cancelled: Number(cancelledSeries?.[i]?.value || 0),
  }));
  if (!rows.length || rows.every(row => !row.added && !row.cancelled)) {
    target.innerHTML = `<span>${t('admin_no_data_period')}</span>`;
    return;
  }
  const width = 640, height = 218, left = 25, bottom = 25, top = 12;
  const max = Math.max(...rows.flatMap(row => [row.added, row.cancelled]), 1);
  const group = (width - left - 10) / rows.length;
  const barWidth = Math.max(2, Math.min(12, group * .32));
  const y = value => top + (height - top - bottom) * (1 - value / max);
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img">
    ${[0,.5,1].map(f => `<line class="admin-chart-gridline" x1="${left}" x2="${width-8}" y1="${top+(height-top-bottom)*f}" y2="${top+(height-top-bottom)*f}"/>`).join('')}
    ${rows.map((row,i) => { const gx=left+i*group+group/2; return `<rect class="admin-chart-bar-new" x="${gx-barWidth}" y="${y(row.added)}" width="${barWidth}" height="${height-bottom-y(row.added)}" rx="2"><title>${row.key}: ${row.added}</title></rect><rect class="admin-chart-bar-cancel" x="${gx}" y="${y(row.cancelled)}" width="${barWidth}" height="${height-bottom-y(row.cancelled)}" rx="2"><title>${row.key}: ${row.cancelled}</title></rect>`; }).join('')}
  </svg>`;
}

function renderAdminPlanCharts(plans) {
  const colors = { plus:'#4d79e8', pro:'#17a884', ultimate:'#e5a43a' };
  const breakdown = plans.breakdown || [];
  const total = breakdown.reduce((sum,row) => sum + Number(row.subscribers || 0), 0);
  let cursor = 0;
  const slices = breakdown.map(row => {
    const start = cursor; cursor += total ? row.subscribers / total * 360 : 0;
    return `${colors[row.plan]} ${start}deg ${cursor}deg`;
  });
  const donut = document.getElementById('chartPlanDonut');
  donut.style.background = total ? `conic-gradient(${slices.join(',')})` : '#e9edf4';
  donut.innerHTML = `<span>${adminNumber(total)}</span>`;
  document.getElementById('chartPlanLegend').innerHTML = breakdown.map(row => `<div><span><i style="background:${colors[row.plan]}"></i>${adminPlanName(row.plan)}</span><strong>${adminNumber(row.subscribers)}</strong></div>`).join('');
  const periodRows = plans.period_breakdown || [];
  document.getElementById('chartPeriodBars').innerHTML = periodRows.length ? periodRows.map(row => `<div class="admin-horizontal-bar"><header><span>${adminPeriodName(row.period)}</span><strong>${adminNumber(row.subscribers)} · ${adminNumber(row.share,1)}%</strong></header><div class="track"><div class="fill" style="width:${Math.max(row.share,1)}%"></div></div></div>`).join('') : `<span>${t('admin_no_data_period')}</span>`;
}

function renderAdminFunnel(funnel) {
  const labels = { users:t('funnel_users'), trial_viewed:t('funnel_viewed'), card_added:t('funnel_card'), trial_started:t('funnel_started'), converted:t('funnel_converted') };
  const first = Number(funnel?.[0]?.count || 0);
  document.getElementById('adminConversionFunnel').innerHTML = (funnel || []).map((stage,index) => {
    const previous = Number(funnel[index - 1]?.count || 0);
    const rate = index === 0 ? 100 : (previous ? stage.count / previous * 100 : 0);
    const overall = first ? stage.count / first * 100 : 0;
    return `<div class="admin-funnel-stage"><small>${labels[stage.stage] || stage.stage}</small><strong>${adminNumber(stage.count)}</strong><em>${index ? `${adminNumber(rate,1)}% ${t('from_previous')} · ${adminNumber(overall,1)}% ${t('from_total')}` : t('funnel_period_users')}</em></div>`;
  }).join('');
}

function renderAdminAnalytics(data) {
  const m = data.metrics;
  const subscriberRate = m.total_users ? m.current_subscribers / m.total_users * 100 : 0;
  document.getElementById('metricTotalUsers').textContent = adminNumber(m.total_users);
  document.getElementById('metricNewUsers').textContent = t('metric_new_users_value', { n: adminNumber(m.new_users) });
  document.getElementById('metricActiveNow').textContent = adminNumber(m.active_now);
  document.getElementById('metricActiveToday').textContent = adminNumber(m.active_today);
  document.getElementById('metricActiveRanges').textContent = t('metric_active_ranges_value', { d7: adminNumber(m.active_7d), d30: adminNumber(m.active_30d) });
  document.getElementById('metricSubscribers').textContent = adminNumber(m.current_subscribers);
  document.getElementById('metricSubscriberRate').textContent = t('metric_subscriber_rate_value', { n: adminNumber(subscriberRate,1) });
  document.getElementById('metricTrials').textContent = adminNumber(m.current_trials);
  document.getElementById('metricNewSubscriptions').textContent = adminNumber(m.new_subscriptions);
  document.getElementById('metricCancelledRenewal').textContent = adminNumber(m.cancelled_renewal);
  document.getElementById('metricExpired').textContent = adminNumber(m.expired_subscriptions);
  document.getElementById('metricTotalRevenue').textContent = adminCurrency(m.total_revenue);
  document.getElementById('metricMonthRevenue').textContent = adminCurrency(m.month_revenue);
  document.getElementById('metricPeriodRevenue').textContent = t('metric_period_revenue_value', { value: adminCurrency(m.period_revenue) });
  document.getElementById('metricArppu').textContent = adminCurrency(m.average_revenue_per_payer);
  document.getElementById('adminAnalyticsUpdatedAt').textContent = t('admin_updated_at', { value: new Date(data.generated_at).toLocaleString(currentLang === 'en' ? 'en-US' : 'ar-SA') });
  document.getElementById('chartUsersTotal').textContent = t('chart_new_count', { n: adminNumber(m.new_users) });
  document.getElementById('chartSubscribersTotal').textContent = t('chart_new_count', { n: adminNumber(m.new_subscriptions) });
  document.getElementById('chartRevenueTotal').textContent = adminCurrency(m.period_revenue);
  renderAdminLineChart('chartUserGrowth', data.charts.user_growth, '#2e5bdb');
  renderAdminLineChart('chartSubscriberGrowth', data.charts.subscriber_growth, '#17a884');
  renderAdminLineChart('chartRevenue', data.charts.revenue, '#199678');
  renderAdminComparisonChart(data.charts.new_subscriptions, data.charts.cancellations);
  renderAdminPlanCharts(data.plans);
  renderAdminFunnel(data.funnel);

  const trialTotal = data.plans.breakdown.reduce((sum,row) => sum + row.trial_starts, 0);
  const convertedTotal = data.plans.breakdown.reduce((sum,row) => sum + row.trial_conversions, 0);
  document.getElementById('mostPopularPlan').textContent = adminPlanName(data.plans.most_popular_plan);
  document.getElementById('mostPopularPeriod').textContent = adminPeriodName(data.plans.most_popular_period);
  document.getElementById('trialConversionRate').textContent = `${adminNumber(trialTotal ? convertedTotal / trialTotal * 100 : 0,1)}%`;
  document.getElementById('adminPlanBreakdownBody').innerHTML = data.plans.breakdown.map(row => `<tr><td><strong>${adminPlanName(row.plan)}</strong></td><td>${adminNumber(row.subscribers)}</td><td>${adminNumber(row.share,1)}%</td><td>${adminNumber(row.trial_starts)}</td><td>${adminNumber(row.trial_conversions)}</td><td>${adminNumber(row.trial_starts ? row.trial_conversions / row.trial_starts * 100 : 0,1)}%</td></tr>`).join('');

  const operationLabels = { new_subscription:t('operation_new_subscription'), renewal:t('operation_renewal'), trial_started:t('operation_trial'), auto_renew_cancelled:t('operation_cancel_renewal') };
  const statusLabels = { paid:t('status_paid'), pending:t('status_pending'), failed:t('status_failed'), trial_started:t('status_trial'), auto_renew_cancelled:t('status_cancelled_renewal') };
  const recentBody = document.getElementById('adminRecentOperationsBody');
  recentBody.innerHTML = data.recent_operations.length ? data.recent_operations.map(row => `<tr><td><strong>${escapeHtml(row.user)}</strong></td><td>${operationLabels[row.kind] || escapeHtml(row.kind)}</td><td>${adminPlanName(row.plan)}</td><td>${adminPeriodName(row.period)}</td><td>${row.amount === null ? '—' : adminCurrency(row.amount)}</td><td><span class="admin-status-pill ${row.status === 'paid' ? 'paid' : row.status === 'failed' ? 'failed' : row.status === 'trial_started' ? 'trial' : ''}">${statusLabels[row.status] || escapeHtml(row.status)}</span></td><td>${row.date ? new Date(row.date).toLocaleString(currentLang === 'en' ? 'en-US' : 'ar-SA') : '—'}</td></tr>`).join('') : `<tr><td colspan="7">${t('admin_no_operations')}</td></tr>`;
}

async function loadAdminAnalytics() {
  const loading = document.getElementById('adminAnalyticsLoading');
  const error = document.getElementById('adminAnalyticsError');
  loading?.classList.remove('hidden'); error?.classList.add('hidden');
  try {
    const data = await apiCall('GET', `/api/admin/analytics?period=${adminAnalyticsPeriod}`);
    renderAdminAnalytics(data);
  } catch (e) {
    if (error) { error.textContent = e.message; error.classList.remove('hidden'); }
  } finally {
    loading?.classList.add('hidden');
  }
}

document.querySelectorAll('[data-admin-period]').forEach(button => button.addEventListener('click', () => {
  adminAnalyticsPeriod = button.dataset.adminPeriod;
  document.querySelectorAll('[data-admin-period]').forEach(item => item.classList.toggle('active', item === button));
  loadAdminAnalytics();
}));

// ---------- Admin: إدارة المدارس ----------
function wireAdminSchoolBulkActions(tbody) {
  const selectAll = document.getElementById('adminSchoolsSelectAll');
  const toolbar = document.getElementById('adminSchoolsBulkToolbar');
  const count = document.getElementById('adminSchoolsSelectedCount');
  const resultBox = document.getElementById('adminSchoolsBulkResult');
  const boxes = () => [...tbody.querySelectorAll('.admin-school-select')];
  const selected = () => boxes().filter(box => box.checked).map(box => box.value);
  const update = () => {
    const all = boxes();
    const ids = selected();
    selectAll.checked = !!all.length && ids.length === all.length;
    selectAll.indeterminate = ids.length > 0 && ids.length < all.length;
    toolbar.classList.toggle('hidden', ids.length === 0);
    count.textContent = t('selected_count', { count: ids.length });
  };
  selectAll.checked = false;
  selectAll.indeterminate = false;
  selectAll.onchange = () => { boxes().forEach(box => { box.checked = selectAll.checked; }); update(); };
  boxes().forEach(box => box.addEventListener('change', update));
  document.getElementById('adminSchoolsBulkResetBtn').onclick = async () => {
    const schoolIds = selected();
    if (!schoolIds.length || !confirm(t('confirm_bulk_reset_school_passwords', { count: schoolIds.length }))) return;
    try {
      const data = await apiCall('POST', '/api/admin/schools/bulk-actions', { action: 'reset_passwords', school_ids: schoolIds });
      await loadAdminDashboard();
      const rows = data.succeeded || [];
      resultBox.innerHTML = `${rows.length ? `<strong>${t('bulk_passwords_shown_once')}</strong><div class="data-table-wrap"><table class="data-table"><thead><tr><th>${t('th_school_name')}</th><th>${t('th_admin_email')}</th><th>${t('th_password')}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.name || '—')}</td><td>${escapeHtml(row.email || '—')}</td><td><code>${escapeHtml(row.password)}</code></td></tr>`).join('')}</tbody></table></div>` : ''}${data.failed?.length ? `<p class="bulk-action-failures">${t('bulk_failed_count', { count: data.failed.length })}: ${data.failed.map(row => escapeHtml(row.error)).join('، ')}</p>` : ''}`;
      resultBox.classList.remove('hidden');
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { alert(e.message); }
  };
  document.getElementById('adminSchoolsBulkDeleteBtn').onclick = async () => {
    const schoolIds = selected();
    if (!schoolIds.length || !confirm(t('confirm_bulk_delete_schools', { count: schoolIds.length }))) return;
    try {
      const data = await apiCall('POST', '/api/admin/schools/bulk-actions', { action: 'delete', school_ids: schoolIds });
      if (data.failed?.length) alert(t('bulk_partial_failure', { success: data.succeeded.length, failed: data.failed.length }));
      await loadAdminDashboard();
    } catch (e) { alert(e.message); }
  };
  update();
}

async function loadAdminDashboard() {
  loadPlatformFreeAccess();
  loadAdminAnalytics();
  const tbody = document.getElementById('adminSchoolsTableBody');
  document.getElementById('adminSchoolsBulkToolbar')?.classList.add('hidden');
  const selectAll = document.getElementById('adminSchoolsSelectAll');
  if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
  tbody.innerHTML = `<tr><td colspan="6">${t('loading')}</td></tr>`;
  try {
    const data = await apiCall('GET', '/api/admin/schools');
    if (!data.schools.length) { tbody.innerHTML = `<tr><td colspan="6">${t('admin_no_schools')}</td></tr>`; return; }
    tbody.innerHTML = data.schools.map(s => {
      const overLimitBadge = s.over_limit_since
        ? `<br><span style="color:#c0392b; font-size:12px; font-weight:700;">${s.over_limit_expired ? `⏰ ${t('admin_over_limit_expired_badge')}` : `⚠️ ${t('admin_over_limit_badge')}`}</span>`
        : '';
      return `
      <tr>
        <td class="bulk-select-cell"><input type="checkbox" class="admin-school-select" value="${s.id}" aria-label="${t('select_school', { name: escapeHtml(s.name) })}"></td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.admin_email || '—')}</td>
        <td>${s.accounts_used} / ${s.max_accounts}${overLimitBadge}</td>
        <td>${s.is_active ? t('status_active') : t('status_inactive')}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="ghost" data-edit-limit="${s.id}" data-current="${s.max_accounts}" style="padding:4px 10px;">✏️ ${t('btn_edit_max_accounts')}</button>
          <button class="ghost" data-toggle-school="${s.id}" data-active="${s.is_active}" style="padding:4px 10px;">${s.is_active ? t('btn_deactivate') : t('btn_activate')}</button>
          <button class="ghost" data-reset-school-pw="${s.id}" style="padding:4px 10px;">${t('btn_reset_password')}</button>
          <button class="ghost" data-delete-school="${s.id}" style="padding:4px 10px; color:#c0392b;">${t('btn_delete')}</button>
        </td>
      </tr>
    `;
    }).join('');
    tbody.querySelectorAll('[data-edit-limit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const input = prompt(t('prompt_new_max_accounts'), btn.dataset.current);
        if (input === null) return;
        const newLimit = parseInt(input, 10);
        if (Number.isNaN(newLimit) || newLimit < 0) { alert(t('err_invalid_number')); return; }
        try {
          await apiCall('PATCH', `/api/admin/schools/${btn.dataset.editLimit}`, { max_accounts: newLimit });
          loadAdminDashboard();
        } catch (e) { alert(e.message); }
      });
    });
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
    wireAdminSchoolBulkActions(tbody);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(e.message)}</td></tr>`;
  }
}

function isoToLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function loadPlatformFreeAccess() {
  const status = document.getElementById('platformFreeAccessStatus');
  if (!status) return;
  try {
    const data = await apiCall('GET', '/api/admin/platform-access');
    document.getElementById('platformFreeAccessEnabled').checked = !!data.free_access_enabled;
    document.getElementById('platformFreeAccessStart').value = isoToLocalInput(data.free_access_starts_at);
    document.getElementById('platformFreeAccessEnd').value = isoToLocalInput(data.free_access_ends_at);
    status.textContent = data.free_access_active ? t('admin_free_access_active') : (data.free_access_enabled ? t('admin_free_access_scheduled') : t('admin_free_access_inactive'));
    status.style.color = data.free_access_active ? 'var(--teal)' : '';
  } catch (e) {
    status.textContent = '';
    showError('platformFreeAccessError', e.message);
  }
}

document.getElementById('savePlatformFreeAccessBtn').addEventListener('click', async () => {
  clearError('platformFreeAccessError');
  const button = document.getElementById('savePlatformFreeAccessBtn');
  const startValue = document.getElementById('platformFreeAccessStart').value;
  const endValue = document.getElementById('platformFreeAccessEnd').value;
  const payload = {
    free_access_enabled: document.getElementById('platformFreeAccessEnabled').checked,
    free_access_starts_at: startValue ? new Date(startValue).toISOString() : null,
    free_access_ends_at: endValue ? new Date(endValue).toISOString() : null,
  };
  button.disabled = true;
  try {
    await apiCall('PUT', '/api/admin/platform-access', payload);
    await loadPlatformFreeAccess();
  } catch (e) {
    showError('platformFreeAccessError', e.message);
  } finally {
    button.disabled = false;
  }
});
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
