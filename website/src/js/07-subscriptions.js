// ---------- الاشتراكات ----------
// حساب مؤسسي (role موجود) وصوله محكوم بعضوية مدرسته - القسم يُخفى له بالكامل،
// مطابق لنفس قاعدة UsageLimiter.owner المطبّقة بتطبيق iOS
let subscriptionPlansCache = null;
let subscriptionMeCache = null;
let subscriptionPeriod = 'monthly';
let moyasarPublishableKey = null;
const SUBSCRIPTION_PLAN_ORDER = ['free', 'plus', 'pro', 'ultimate'];

async function loadSubscriptionSection() {
  const section = document.getElementById('settingsSubscriptionSection');
  if (!currentUserId || currentUserRole) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.getElementById('subscriptionMsg').textContent = '';
  try {
    const [plansData, meData] = await Promise.all([
      apiCall('GET', '/api/subscription/plans'),
      apiCall('GET', '/api/subscription/me'),
    ]);
    subscriptionPlansCache = plansData.plans;
    moyasarPublishableKey = plansData.moyasar_publishable_key;
    subscriptionMeCache = meData;
    renderSubscriptionPlans();
  } catch (e) {
    document.getElementById('subscriptionCurrentPlan').textContent = e.message;
  }
}

function renderSubscriptionPlans() {
  if (!subscriptionPlansCache) return;
  const currentTier = subscriptionMeCache?.tier || 'free';
  document.getElementById('subscriptionCurrentPlan').textContent = t('current_plan_label', { plan: t(`plan_${currentTier}`) });
  const daysEl = document.getElementById('subscriptionDaysRemaining');
  const daysRemaining = subscriptionMeCache?.days_remaining;
  if (daysRemaining) {
    daysEl.textContent = t('days_remaining_label', { n: daysRemaining });
    daysEl.classList.remove('hidden');
  } else {
    daysEl.classList.add('hidden');
  }
  const grid = document.getElementById('subscriptionPlansGrid');
  grid.innerHTML = SUBSCRIPTION_PLAN_ORDER.map(key => {
    const plan = subscriptionPlansCache[key];
    if (!plan) return '';
    const price = subscriptionPeriod === 'monthly' ? plan.price_monthly : plan.price_annual;
    const periodLabel = subscriptionPeriod === 'monthly' ? t('period_monthly') : t('period_annual');
    const isCurrent = key === currentTier;
    return `
      <div class="plan-card ${isCurrent ? 'current-plan' : ''}">
        <div class="plan-name">${t(`plan_${key}`)}</div>
        <div class="plan-price">${price > 0 ? `${price} ${t('sar_label')}<small> / ${periodLabel}</small>` : t('free_label')}</div>
        <div class="plan-features">${renderPlanFeatures(plan)}</div>
        ${isCurrent
          ? `<div class="plan-current-badge">${t('current_plan_badge')}</div>`
          : (key === 'free' ? '' : `<button class="primary" data-subscribe-plan="${key}" style="width:100%;">${t('btn_subscribe')}</button>`)}
      </div>
    `;
  }).join('');
  grid.querySelectorAll('[data-subscribe-plan]').forEach(btn => {
    btn.addEventListener('click', () => startCheckout(btn.dataset.subscribePlan));
  });
}

function renderPlanFeatures(plan) {
  const unl = t('unlimited_label');
  const full = t('full_label');
  return [
    t('feat_library', { n: plan.library_limit }),
    t('feat_solo', { n: plan.solo_daily ?? unl }),
    t('feat_group', { n: plan.group_daily ?? unl }),
    t('feat_lesson', { n: plan.lesson_daily ?? unl }),
    t('feat_archive', { n: plan.archive_limit ?? full }),
    t('feat_performance', { n: plan.performance_limit ?? full }),
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

// ينشئ طلب اشتراك معلّق بالباك إند ثم يفتح نموذج دفع ميسر المدمج (بطاقة/
// مدى/Apple Pay). الدفعة نفسها تُنشأ من طرف Moyasar.js بالمتصفح مباشرة
// بالمفتاح العلني بس (بيانات البطاقة ما تلمس سيرفرنا) - وتفعيل الاشتراك
// الفعلي يصير عبر ويبهوك ميسر (/api/subscription/webhook/moyasar) بعد ما
// يتأكد الباك إند من نجاح الدفع مباشرة مع ميسر، مو من هذا الكود، عشان محد
// يقدر يزوّر "نجح الدفع" من طرف المتصفح.
let pendingSubscriptionOrder = null;

async function startCheckout(plan) {
  const msg = document.getElementById('subscriptionMsg');
  msg.textContent = t('loading');
  try {
    const order = await apiCall('POST', '/api/subscription/checkout', { plan, period: subscriptionPeriod });
    msg.textContent = '';
    openPaymentModal(order);
  } catch (e) {
    msg.textContent = e.message;
  }
}

// نحفظ الطلب المعلّق بـ localStorage (مو متغيّر جافاسكربت بس) لأن Moyasar.js
// يتطلب callback_url صالح ويقدر يعيد تحميل الصفحة كاملة (Apple Pay/3D Secure)
// - فلازم نقدر نكمل متابعة التفعيل حتى بعد إعادة تحميل تفقد فيها كل متغيّرات الذاكرة
const PENDING_ORDER_STORAGE_KEY = 'zakiy_pending_subscription_order';

function openPaymentModal(order) {
  if (!moyasarPublishableKey) {
    document.getElementById('subscriptionMsg').textContent = t('payment_not_ready_msg');
    return;
  }
  pendingSubscriptionOrder = order;
  localStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify(order));
  document.getElementById('moyasarFormContainer').innerHTML = '';
  document.getElementById('paymentModalMsg').textContent = '';
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
    apple_pay: {
      country: 'SA',
      label: 'ذكيّ',
      validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
    },
    on_completed: function () {
      // الدفع بدأ ونجح من طرف المتصفح - التفعيل الفعلي ينتظر ويبهوك ميسر
      document.getElementById('paymentModalMsg').textContent = t('payment_processing_msg');
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
function resumePendingSubscriptionCheck() {
  const raw = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
  if (!raw) return;
  // ننظّف أي معطيات رجّعها ميسر بالرابط (id/status/message) عشان يبقى نظيف
  if (window.location.search) {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  let order;
  try { order = JSON.parse(raw); } catch (e) { localStorage.removeItem(PENDING_ORDER_STORAGE_KEY); return; }
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
  const pass1 = document.getElementById('settingsNewPassword').value;
  const pass2 = document.getElementById('settingsConfirmPassword').value;
  clearError('settingsPasswordMsg');
  if (pass1.length < 6) { showError('settingsPasswordMsg', t('err_password_min')); return; }
  if (pass1 !== pass2) { showError('settingsPasswordMsg', t('err_password_mismatch')); return; }
  const { error } = await supabaseClient.auth.updateUser({ password: pass1 });
  if (error) { showError('settingsPasswordMsg', error.message || t('err_unexpected')); return; }
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

