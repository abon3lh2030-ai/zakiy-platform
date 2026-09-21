// ---------- الاشتراكات المتجددة وتجربة 3 أيام ----------
let subscriptionPlansCache = null;
let subscriptionMeCache = null;
let subscriptionTrialOfferCache = null;
let subscriptionPeriod = 'monthly';
let moyasarPublishableKey = null;
let pendingSubscriptionOrder = null;
let pendingTrialChoice = null;
const SUBSCRIPTION_PLAN_ORDER = ['national_day', 'free', 'plus', 'pro', 'ultimate'];
const PENDING_ORDER_STORAGE_KEY = 'zakiy_pending_subscription_order';
const PENDING_TRIAL_STORAGE_KEY = 'zakiy_pending_subscription_trial';

function hasActivePaidSubscription() {
  return Boolean(subscriptionMeCache?.tier && subscriptionMeCache.tier !== 'free');
}

function formatSubscriptionDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadSubscriptionSection() {
  const section = document.getElementById('settingsSubscriptionSection');
  if (!currentUserId || currentUserRole) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.getElementById('subscriptionMsg').textContent = '';
  try {
    const [plansData, meData, trialData] = await Promise.all([
      apiCall('GET', '/api/subscription/plans'),
      apiCall('GET', '/api/subscription/me'),
      apiCall('POST', '/api/subscription/trial-offer', { context: 'settings' }),
    ]);
    subscriptionPlansCache = plansData.plans;
    moyasarPublishableKey = plansData.moyasar_publishable_key;
    subscriptionMeCache = meData;
    subscriptionTrialOfferCache = trialData;
    renderSubscriptionPlans();
  } catch (e) {
    document.getElementById('subscriptionCurrentPlan').textContent = e.message;
  }
}

function renderBillingPanel() {
  const panel = document.getElementById('subscriptionBillingPanel');
  const billing = subscriptionMeCache?.billing;
  if (!billing || !hasActivePaidSubscription()) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
  const endDate = formatSubscriptionDate(billing.current_period_end || subscriptionMeCache.expires_at);
  const stateText = billing.auto_renew ? t('auto_renew_on') : t('auto_renew_off');
  const cardText = billing.payment_last_four ? ` • ${billing.payment_brand || ''} •••• ${billing.payment_last_four}` : '';
  panel.innerHTML = `
    <strong>${billing.is_trial ? t('trial_badge') : stateText}</strong>${cardText}
    <div>${billing.auto_renew
      ? `موعد ${billing.is_trial ? 'أول خصم' : 'التجديد القادم'}: ${endDate}`
      : `اشتراكك يظل شغالًا حتى ${endDate} ولن يُخصم مبلغ جديد.`}</div>
    <div class="subscription-billing-actions">
      <button class="${billing.auto_renew ? 'danger' : 'primary'}" id="toggleAutoRenewBtn">${billing.auto_renew ? t('btn_cancel_auto_renew') : t('btn_resume_auto_renew')}</button>
    </div>`;
  panel.classList.remove('hidden');
  document.getElementById('toggleAutoRenewBtn').addEventListener('click', () => setAutoRenew(!billing.auto_renew));
}

function renderTrialOffer() {
  const el = document.getElementById('subscriptionTrialOffer');
  if (!subscriptionTrialOfferCache?.available || hasActivePaidSubscription()) {
    el.classList.add('hidden'); el.innerHTML = ''; return;
  }
  el.innerHTML = `<strong>${t('trial_offer_title')}</strong><div>اختر الباقة والمدة بالأسفل. لن يُحصّل سعر الباقة الآن، وبعد 3 أيام يبدأ الخصم والتجديد التلقائي ما لم تلغِ قبل نهاية التجربة.</div>`;
  el.classList.remove('hidden');
}

function renderSubscriptionPlans() {
  if (!subscriptionPlansCache) return;
  const currentTier = subscriptionMeCache?.tier || 'free';
  document.getElementById('subscriptionCurrentPlan').textContent = t('current_plan_label', { plan: t(`plan_${currentTier}`) });
  const daysEl = document.getElementById('subscriptionDaysRemaining');
  const daysRemaining = subscriptionMeCache?.days_remaining;
  if (daysRemaining) { daysEl.textContent = t('days_remaining_label', { n: daysRemaining }); daysEl.classList.remove('hidden'); }
  else daysEl.classList.add('hidden');
  renderBillingPanel();
  renderTrialOffer();
  const grid = document.getElementById('subscriptionPlansGrid');
  const checkoutLocked = currentTier !== 'free';
  grid.innerHTML = SUBSCRIPTION_PLAN_ORDER.map(key => {
    const plan = subscriptionPlansCache[key];
    if (!plan) return '';
    const isNationalDay = key === 'national_day';
    const checkoutPeriod = isNationalDay ? 'annual' : subscriptionPeriod;
    const price = checkoutPeriod === 'monthly' ? plan.price_monthly : plan.price_annual;
    const periodLabel = checkoutPeriod === 'monthly' ? t('period_monthly') : t('period_annual');
    const isCurrent = key === currentTier;
    const buyButtons = key === 'free' || checkoutLocked ? '' : `
      <button class="primary" data-subscribe-plan="${key}" data-subscribe-period="${checkoutPeriod}" style="width:100%;">${isNationalDay ? t('national_day_subscribe') : t('btn_subscribe')}</button>
      ${subscriptionTrialOfferCache?.available && !isNationalDay ? `<button class="ghost plan-trial-btn" data-trial-plan="${key}">${t('btn_start_trial')}</button>` : ''}`;
    const nationalDayHeader = isNationalDay ? `
      <div class="national-day-heading">
        <img class="national-day-logo" src="/assets/izzna-bitabana-logo.png" alt="${t('national_day_slogan')}" loading="lazy">
      </div>
      <div class="national-day-ribbon">${t('national_day_annual_badge')}</div>` : '';
    return `<div class="plan-card ${isCurrent ? 'current-plan' : ''} ${isNationalDay ? 'national-day-plan' : ''}">
      ${nationalDayHeader}
      <div class="plan-name">${t(`plan_${key}`)}</div>
      <div class="plan-price">${price > 0 ? `${price} ${t('sar_label')}<small> / ${isNationalDay ? t('national_day_full_year') : periodLabel}</small>` : t('free_label')}</div>
      ${isNationalDay ? `<div class="national-day-value"><span>${t('national_day_ultimate_features')}</span><b>${t('national_day_saving')}</b></div>` : ''}
      ${isNationalDay ? '' : `<div class="plan-features">${renderPlanFeatures(plan)}</div>`}
      ${isCurrent ? `<div class="plan-current-badge">${t('current_plan_badge')}</div>` : buyButtons}
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-subscribe-plan]').forEach(btn => btn.addEventListener('click', () => startCheckout(btn.dataset.subscribePlan, btn.dataset.subscribePeriod)));
  grid.querySelectorAll('[data-trial-plan]').forEach(btn => btn.addEventListener('click', () => openTrialModal(btn.dataset.trialPlan)));
}

function renderPlanFeatures(plan) {
  const feature = (value, limitedKey, unlimitedKey) => (
    value === null || value === undefined
      ? t(unlimitedKey)
      : t(limitedKey, { n: value })
  );
  return [
    feature(plan.library_limit, 'feat_library_limited', 'feat_library_unlimited'),
    feature(plan.solo_daily, 'feat_solo_limited', 'feat_solo_unlimited'),
    feature(plan.group_daily, 'feat_group_limited', 'feat_group_unlimited'),
    plan.lesson_daily === 0
      ? t('feat_lesson_none')
      : feature(plan.lesson_daily, 'feat_lesson_limited', 'feat_lesson_unlimited'),
    feature(plan.ai_assistant_daily, 'feat_ai_assistant_limited', 'feat_ai_assistant_unlimited'),
    feature(plan.archive_limit, 'feat_archive_limited', 'feat_archive_unlimited'),
    feature(plan.performance_limit, 'feat_performance_limited', 'feat_performance_unlimited'),
  ].join('<br>');
}

document.querySelectorAll('.sub-period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sub-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    subscriptionPeriod = btn.dataset.period;
    renderSubscriptionPlans();
  });
});

async function startCheckout(plan, selectedPeriod = subscriptionPeriod) {
  const msg = document.getElementById('subscriptionMsg');
  if (hasActivePaidSubscription()) {
    msg.textContent = t('payment_active_subscription_msg');
    return;
  }
  msg.textContent = t('loading');
  try {
    const order = await apiCall('POST', '/api/subscription/checkout', { plan, period: selectedPeriod });
    msg.textContent = '';
    openPaymentModal(order);
  } catch (e) {
    msg.textContent = e.message;
  }
}

function openPaymentModal(order) {
  if (hasActivePaidSubscription()) {
    document.getElementById('subscriptionMsg').textContent = t('payment_active_subscription_msg');
    return;
  }
  if (!moyasarPublishableKey) {
    document.getElementById('subscriptionMsg').textContent = t('payment_not_ready_msg');
    return;
  }
  pendingSubscriptionOrder = order;
  localStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify(order));
  document.getElementById('moyasarFormContainer').innerHTML = '';
  document.getElementById('paymentModalMsg').textContent = '';
  document.getElementById('paymentRecurringDisclosure').textContent = t('payment_recurring_disclosure', {
    amount: order.amount,
    period: order.period === 'monthly' ? 'شهر' : 'سنة',
  });
  show('paymentModalOverlay');

  Moyasar.init({
    element: '.mysr-form',
    amount: Math.round(order.amount * 100), // ميسر يتوقع المبلغ بالهللة
    currency: order.currency || 'SAR',
    description: `ذكيّ - ${t('plan_' + order.plan)} (${order.period === 'monthly' ? t('period_monthly') : t('period_annual')})`,
    publishable_api_key: moyasarPublishableKey,
    callback_url: window.location.origin + window.location.pathname,
    methods: ['creditcard', 'applepay'],
    metadata: { order_id: order.order_id },
    credit_card: { save_card: true },
    apple_pay: {
      country: 'SA',
      // ميسر يرسل label كـ display_name عند إنشاء جلسة Apple Pay، وهذا
      // الحقل يقبل ASCII فقط؛ الاسم العربي يجعل نافذة الدفع تُغلق فورًا.
      label: 'Zakiy',
      validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
      save_card: true,
    },
    on_completed: async function (payment) {
      document.getElementById('paymentModalMsg').textContent = t('payment_processing_msg');
      try {
        await apiCall('POST', `/api/subscription/orders/${order.order_id}/payment-method`, { payment_id: payment.id });
      } catch (e) {
        document.getElementById('paymentModalMsg').textContent = `${t('payment_processing_msg')} — ${e.message}`;
      }
      pollSubscriptionActivation();
    },
  });
}

function closePaymentModal() {
  hide('paymentModalOverlay');
  document.getElementById('moyasarFormContainer').innerHTML = '';
  pendingSubscriptionOrder = null;
  localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
}
document.getElementById('paymentModalCloseBtn').addEventListener('click', closePaymentModal);

// يستأنف متابعة طلب معلّق بعد ما المستخدم يرجع لصفحتنا من تدفّق دفع أعاد
// تحميل الصفحة كاملة (Apple Pay/3D Secure) - يُستدعى بعد كل نجاح دخول
async function resumePendingSubscriptionCheck() {
  await resumePendingTrialCheck();
  const raw = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
  if (!raw) return;
  // ننظّف أي معطيات رجّعها ميسر بالرابط (id/status/message) عشان يبقى نظيف
  if (window.location.search) {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  let order;
  try { order = JSON.parse(raw); } catch (e) { localStorage.removeItem(PENDING_ORDER_STORAGE_KEY); return; }
  // نفشل بشكل مغلق: لا نظهر أي نافذة دفع/متابعة قبل التأكد سيرفريًا أن
  // الحساب ما زال مجانيًا. لو كان اشتراكه فعالًا ننظف الطلب القديم نهائيًا.
  try {
    subscriptionMeCache = await apiCall('GET', '/api/subscription/me');
  } catch (e) {
    return;
  }
  if (hasActivePaidSubscription()) {
    pendingSubscriptionOrder = null;
    localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
    hide('paymentModalOverlay');
    showSettingsScreen();
    document.getElementById('subscriptionMsg').textContent = t('payment_active_subscription_msg');
    renderSubscriptionPlans();
    return;
  }
  showSettingsScreen();
  pendingSubscriptionOrder = order;
  show('paymentModalOverlay');
  document.getElementById('moyasarFormContainer').innerHTML = '';
  document.getElementById('paymentModalMsg').textContent = t('payment_processing_msg');
  pollSubscriptionActivation();
}

// يتحقق من /api/subscription/me كل ٣ ثواني (لين ١٢ محاولة ~ دقيقة) لين
// تنعكس حالة الدفع بعد ما ويبهوك ميسر يوصل ويفعّل الاشتراك بالباك إند
async function pollSubscriptionActivation(attempt = 0) {
  if (!pendingSubscriptionOrder || attempt >= 12) {
    if (attempt >= 12) document.getElementById('paymentModalMsg').textContent = t('payment_delayed_msg');
    return;
  }
  await new Promise(r => setTimeout(r, 3000));
  try {
    const me = await apiCall('GET', '/api/subscription/me');
    if (me.tier === pendingSubscriptionOrder.plan) {
      subscriptionMeCache = me;
      document.getElementById('paymentModalMsg').textContent = t('payment_success_msg');
      renderSubscriptionPlans();
      localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
      setTimeout(() => {
        closePaymentModal();
        // ينزل تلقائيًا لقسم الاشتراك عشان يشوف التأكيد مباشرة، خصوصًا لو
        // رجع لتو من صفحة دفع خارجية وصفحة الإعدادات فتحت من أعلاها
        document.getElementById('settingsSubscriptionSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 2000);
      return;
    }
  } catch (e) { /* تجاهل، نحاول مرة ثانية */ }
  pollSubscriptionActivation(attempt + 1);
}

async function setAutoRenew(enabled) {
  const billing = subscriptionMeCache?.billing;
  const until = formatSubscriptionDate(billing?.current_period_end || subscriptionMeCache?.expires_at);
  if (!enabled && !confirm(`هل أنت متأكد من إلغاء التجديد التلقائي؟ سيبقى اشتراكك شغالًا حتى ${until} ولن يُلغى الآن.`)) return;
  const msg = document.getElementById('subscriptionMsg');
  msg.textContent = t('loading');
  try {
    await apiCall('POST', '/api/subscription/auto-renew', { enabled });
    subscriptionMeCache = await apiCall('GET', '/api/subscription/me');
    msg.textContent = enabled ? '✅ تم تفعيل التجديد التلقائي من جديد.' : `✅ توقف التجديد. اشتراكك مستمر حتى ${until}.`;
    renderSubscriptionPlans();
  } catch (e) { msg.textContent = e.message; }
}

async function openTrialModal(plan) {
  if (!moyasarPublishableKey) { document.getElementById('subscriptionMsg').textContent = t('payment_not_ready_msg'); return; }
  try {
    pendingTrialChoice = await apiCall('POST', '/api/subscription/trial/prepare', { plan, period: subscriptionPeriod });
    const periodLabel = subscriptionPeriod === 'monthly' ? 'شهريًا' : 'سنويًا';
    document.getElementById('trialDisclosure').innerHTML = `لن يُحصّل سعر الباقة الآن. تبدأ تجربة <b>3 أيام</b>، ثم في ${formatSubscriptionDate(pendingTrialChoice.trial_ends_at)} يُخصم <b>${pendingTrialChoice.amount} ريال ${periodLabel}</b> ويبدأ التجديد التلقائي. تقدر تلغي قبلها بلا خصم. قد يظهر تفويض مؤقت بقيمة ريال واحد من البنك للتحقق من البطاقة ثم يُفك تلقائيًا؛ ليس رسومًا للمنصة.`;
    document.getElementById('trialModalMsg').textContent = '';
    document.getElementById('trialConsent').checked = false;
    show('trialModalOverlay');
  } catch (e) { document.getElementById('subscriptionMsg').textContent = e.message; }
}

function closeTrialModal() { hide('trialModalOverlay'); pendingTrialChoice = null; }
document.getElementById('trialModalCloseBtn').addEventListener('click', closeTrialModal);

document.getElementById('trialCardNumber').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
});

document.getElementById('trialCardForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!pendingTrialChoice || !document.getElementById('trialConsent').checked) return;
  const button = document.getElementById('trialStartBtn');
  const msg = document.getElementById('trialModalMsg');
  button.disabled = true; msg.textContent = 'جاري توثيق البطاقة بأمان عبر ميسر...';
  const fields = new URLSearchParams({
    name: document.getElementById('trialCardName').value.trim(),
    number: document.getElementById('trialCardNumber').value.replace(/\D/g, ''),
    month: document.getElementById('trialCardMonth').value.trim(),
    year: document.getElementById('trialCardYear').value.trim().slice(-2),
    cvc: document.getElementById('trialCardCvc').value.trim(),
    callback_url: pendingTrialChoice.callback_url,
  });
  try {
    const response = await fetch('https://api.moyasar.com/v1/tokens', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${btoa(`${moyasarPublishableKey}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fields.toString(),
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.id) throw new Error(token.message || 'تعذر توثيق البطاقة');
    const pending = { token_id: token.id, plan: pendingTrialChoice.plan, period: pendingTrialChoice.period };
    localStorage.setItem(PENDING_TRIAL_STORAGE_KEY, JSON.stringify(pending));
    const attached = await apiCall('POST', '/api/subscription/trial/attach-token', pending);
    if (attached.status === 'active') {
      await confirmPendingTrial();
    } else if (attached.verification_url || token.verification_url) {
      location.href = attached.verification_url || token.verification_url;
    } else throw new Error('لم يصل رابط توثيق البطاقة من ميسر');
  } catch (error) {
    msg.textContent = error.message;
    button.disabled = false;
  }
});

async function confirmPendingTrial(attempt = 0) {
  try {
    await apiCall('POST', '/api/subscription/trial/confirm', {});
    localStorage.removeItem(PENDING_TRIAL_STORAGE_KEY);
    hide('trialModalOverlay');
    subscriptionMeCache = await apiCall('GET', '/api/subscription/me');
    showSettingsScreen();
    document.getElementById('subscriptionMsg').textContent = '✅ بدأت تجربتك المجانية. لن يُخصم سعر الباقة إلا بعد 3 أيام ما لم تلغِ التجديد.';
    renderSubscriptionPlans();
    return true;
  } catch (e) {
    if (attempt < 11 && /توثيق|يكتمل|معلق/.test(e.message)) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return confirmPendingTrial(attempt + 1);
    }
    const msg = document.getElementById('trialModalMsg');
    if (msg) msg.textContent = e.message;
    return false;
  }
}

async function resumePendingTrialCheck() {
  if (!localStorage.getItem(PENDING_TRIAL_STORAGE_KEY)) return;
  if (window.location.search.includes('subscription_trial')) history.replaceState(null, '', window.location.pathname);
  await confirmPendingTrial();
}

async function showTrialNudge(context) {
  if (!currentAccessToken || currentUserRole || sessionStorage.getItem('zakiy_trial_nudge_dismissed')) return;
  if (!document.getElementById('step-settings').classList.contains('hidden')) return;
  try {
    const offer = await apiCall('POST', '/api/subscription/trial-offer', { context });
    if (!offer.available) return;
    subscriptionTrialOfferCache = offer;
    show('trialNudge');
  } catch (_) { /* العرض اختياري ولا يعطل الميزة الأصلية */ }
}

function offerTrialAtPaywall() { showTrialNudge('paywall'); }
function maybeOfferTrialPassively() { setTimeout(() => showTrialNudge('passive'), 8000); }
document.getElementById('trialNudgeCloseBtn').addEventListener('click', () => {
  hide('trialNudge'); sessionStorage.setItem('zakiy_trial_nudge_dismissed', '1');
});
document.getElementById('trialNudgeOpenBtn').addEventListener('click', () => {
  hide('trialNudge'); showSettingsScreen();
  setTimeout(() => document.getElementById('settingsSubscriptionSection').scrollIntoView({ behavior: 'smooth' }), 50);
});

document.getElementById('settingsSaveNameBtn').addEventListener('click', async () => {
  const newName = document.getElementById('settingsUsernameInput').value.trim();
  if (!newName) { showError('settingsNameMsg', t('err_name_required')); return; }
  const { error } = await supabaseClient.auth.updateUser({ data: { username: newName } });
  if (error) { showError('settingsNameMsg', t('save_name_failed')); return; }
  currentUsername = newName;
  refreshAccountUI();
  fetch(`${API_BASE}/api/profile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
    body: JSON.stringify({ username: currentUsername }),
  }).catch(() => {});
  document.getElementById('settingsNameMsg').innerHTML = `<div class="desc">✅ ${t('name_saved')}</div>`;
});

document.getElementById('settingsSavePasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('settingsCurrentPassword').value;
  const pass1 = document.getElementById('settingsNewPassword').value;
  const pass2 = document.getElementById('settingsConfirmPassword').value;
  clearError('settingsPasswordMsg');
  if (!currentPassword) { showError('settingsPasswordMsg', t('err_current_password_required')); return; }
  if (pass1.length < 6) { showError('settingsPasswordMsg', t('err_password_min')); return; }
  if (pass1 !== pass2) { showError('settingsPasswordMsg', t('err_password_mismatch')); return; }
  const { data: verifyData, error: verifyError } = await supabaseClient.auth.signInWithPassword({
    email: currentUserEmail,
    password: currentPassword,
  });
  if (verifyError || !verifyData.session) {
    showError('settingsPasswordMsg', t('err_current_password_wrong'));
    return;
  }
  currentAccessToken = verifyData.session.access_token;
  const { error } = await supabaseClient.auth.updateUser({ password: pass1 });
  if (error) { showError('settingsPasswordMsg', error.message || t('err_unexpected')); return; }
  document.getElementById('settingsCurrentPassword').value = '';
  document.getElementById('settingsNewPassword').value = '';
  document.getElementById('settingsConfirmPassword').value = '';
  document.getElementById('settingsPasswordMsg').innerHTML = `<div class="desc">✅ ${t('password_saved')}</div>`;
});

document.getElementById('settingsSavePhoneBtn').addEventListener('click', async () => {
  const phone = document.getElementById('settingsPhoneInput').value.trim();
  clearError('settingsPhoneMsg');
  const { error } = await supabaseClient.auth.updateUser({ data: { phone } });
  if (error) { showError('settingsPhoneMsg', t('err_unexpected')); return; }
  currentUserPhone = phone;
  document.getElementById('settingsPhoneMsg').innerHTML = `<div class="desc">✅ ${t('phone_saved')}</div>`;
});
