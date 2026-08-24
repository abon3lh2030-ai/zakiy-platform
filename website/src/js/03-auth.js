// ---------- تعبئة تلقائية لحقلي الدخول من رابط QR "الحساب" (?login_user=&login_pass=)
// المولّد من تصدير QR بلوحة المدرسة - نعبّي الحقلين بس (بدون تسجيل دخول
// تلقائي)، الطالب يضغط "دخول" بنفسه بعد ما يشوف بياناته معبّاة جاهزة ----------
(function prefillLoginFromQr() {
  const params = new URLSearchParams(location.search);
  const qUser = params.get('login_user');
  const qPass = params.get('login_pass');
  if (!qUser && !qPass) return;
  history.replaceState(null, '', location.pathname); // نشيل الباراميترات عشان ما تتكرر التعبئة لو حدث Reload
  if (qUser) document.getElementById('loginEmail').value = qUser;
  if (qPass) document.getElementById('loginPassword').value = qPass;
})();

// ---------- الحساب (اختياري) ----------
function proceedToApp() {
  hide('login-form'); hide('signup-form'); hide('step-force-password-change');
  show('sidebar');
  show('mode-select');
  navHistory = [];
  // لو فيه شاشة محفوظة من قبل آخر Reload بنفس التبويب (إعدادات/ملاحظات/
  // مكتبة...) نرجّعك لها بدل الرئيسية - راجع tryRestoreLastScreen بـ
  // 02-navigation.js
  if (tryRestoreLastScreen()) navHistory = [['mode-select']];
  updateGlobalBackButton();

  // انضمام سريع عبر رابط QR (?join=CODE) - نعبّي فورم الانضمام تلقائيًا أول
  // ما يوصل المستخدم للواجهة الرئيسية (بعد الدخول أو المتابعة كضيف)
  const joinCode = new URLSearchParams(location.search).get('join');
  if (joinCode) {
    history.replaceState(null, '', location.pathname); // نشيل الباراميتر عشان ما يتكرر التعبئة
    goToJoinRoomWithCode(joinCode);
  }

  // فتح بروفايل شخص عبر رابط QR (?profile=USER_ID) - محتاج تسجيل دخول فعلي؛
  // لو ضيف، نسيب الباراميتر بالرابط عشان يتفحص تلقائيًا بعد ما يسجل دخول
  // (proceedToApp تُستدعى برضو من onAuthSuccess)
  const profileDeepLinkId = new URLSearchParams(location.search).get('profile');
  if (profileDeepLinkId) {
    if (currentAccessToken) {
      history.replaceState(null, '', location.pathname);
      showProfileScreen(profileDeepLinkId);
    } else {
      alert(t('addfriend_guest_alert'));
    }
  }
}

function refreshAccountUI() {
  const badge = document.getElementById('accountBadge');
  badge.textContent = `👤 ${currentUsername}`;
  const greeting = document.getElementById('welcomeGreeting');
  greeting.textContent = t('greeting_prefix', { name: currentUsername });
}

async function promptForUsername(initialMessage) {
  const newName = prompt(initialMessage, currentUsername || '');
  if (!newName || !newName.trim()) return;
  const { error } = await supabaseClient.auth.updateUser({ data: { username: newName.trim() } });
  if (error) { alert(t('save_name_failed')); return; }
  currentUsername = newName.trim();
  refreshAccountUI();
}

function onAuthSuccess(session) {
  currentAccessToken = session.access_token;
  currentUserEmail = session.user.email;
  currentUserId = session.user.id;
  currentUserPhone = session.user.user_metadata?.phone || '';

  // السوكيت أصلًا متصل من قبل الدخول (كضيف) - حدث 'connect' ما يعيد الإطلاق
  // لمجرد ما صار عندنا توكن الحين، فلازم نسجّل الهوية هنا صراحة
  socket.emit('register_user', { token: currentAccessToken });

  // لو الحساب عنده تفضيل لغة محفوظ (من جهاز ثاني مثلًا) وما فيه اختيار محلي
  // بهالمتصفح بعد، نطبّقه - عشان تفضيل اللغة يرافق الحساب مو بس الجهاز
  const savedAccountLang = session.user.user_metadata?.language;
  if (savedAccountLang && !localStorage.getItem('zakiy-lang') && savedAccountLang !== currentLang) {
    currentLang = savedAccountLang;
    localStorage.setItem('zakiy-lang', currentLang);
    applyLanguage();
  }

  const hasStoredUsername = !!session.user.user_metadata?.username;
  // حسابات قديمة من قبل ميزة اليوزرنيم ما فيها هذا الحقل - نرجع للإيميل مؤقتًا
  currentUsername = session.user.user_metadata?.username || currentUserEmail;

  show('accountBadge');
  hide('guestLoginPromptBtn');
  show('logoutBtn');
  show('welcomeGreeting');
  refreshAccountUI();

  // الدخول نجح فعليًا من هذي اللحظة - نخفي نموذج الدخول فورًا بدل ما ننتظر
  // /api/me يرجع (ممكن ياخذ وقت لو سيرفر Render كان نايم/بارد)، وإلا يضل
  // المستخدم شايف نموذج الدخول عالق فوق الصفحة لين يرجع الطلب، ويظن إن
  // الدخول ما اشتغل رغم إنه نجح فعليًا
  hide('login-form');
  hide('signup-form');

  // نظام إدارة حسابات المدارس: نجيب دور الحساب قبل ما نوجّهه لأي شاشة - حساب
  // مؤسسي بكلمة سر مؤقتة يتوقف عند بوابة تغييرها أول، وإلا يوجّه للوحته
  // الخاصة، وحساب فردي عادي (role فاضي) يكمل بنفس تجربة الحساب الفردي الحالية
  // بدون أي تغيير (proceedToApp)
  fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${currentAccessToken}` } })
    .then(res => res.json())
    .then(me => {
      currentUserRole = me.role;
      currentUserSchoolId = me.school_id;
      currentUserClassId = me.class_id;
      document.getElementById('studentScheduleNavBtn').classList.toggle(
        'hidden', !(currentUserRole === 'student' && currentUserSchoolId)
      );
      // دفتر الملاحظات ميزة حساب فردي بس - أي حساب مؤسسي (role موجود) ما يشوفه إطلاقًا
      document.getElementById('notesBtn').classList.toggle('hidden', !!currentUserRole);
      // دفتر الواجبات عكسها تمامًا - معلم أو طالب بس، محجوب عن الحساب الفردي
      document.getElementById('assignmentsBtn').classList.toggle(
        'hidden', !(currentUserRole === 'teacher' || currentUserRole === 'student')
      );
      // دفتر الاختبارات نفس شرط الواجبات بالضبط - معلم أو طالب بس
      document.getElementById('quizzesBtn').classList.toggle(
        'hidden', !(currentUserRole === 'teacher' || currentUserRole === 'student')
      );
      // كشف الدرجات معلم بس - هو الوحيد الي يحط الدرجات، الطالب ما يدخله من هنا
      document.getElementById('gradesheetBtn').classList.toggle(
        'hidden', currentUserRole !== 'teacher'
      );

      if (me.must_change_password) {
        TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
        hide('login-form'); hide('signup-form');
        hide('sidebar'); // بوابة صلبة فعليًا - ما نخلي السايد بار يفتح مسارات ثانية يتفادى بيها المستخدم البوابة
        navHistory = [];
        show('step-force-password-change');
        updateGlobalBackButton();
        return;
      }
      if (currentUserRole) {
        navHistory = [];
        routeByRole(currentUserRole);
        updateGlobalBackButton();
      } else {
        proceedToApp();
        // حساب قديم بدون اسم محفوظ - نطلبه مرة وحدة (يقدر يلغيها ويبقى بالإيميل).
        // لازم يجي بعد ما الشاشة تتنقل صح لـ mode-select، مو قبلها - وإلا
        // نافذة prompt() المتزامنة توقف تنفيذ الجافاسكربت وتجمّد الصفحة على
        // شاشة تسجيل الدخول لين يسكّر المستخدم النافذة، فيطلع كأن الدخول ما
        // اشتغل (الشاشة الثانية تظهر بعده متأخرة "تحت" شاشة الدخول اللي ما
        // انخفت بعد)
        if (!hasStoredUsername) {
          promptForUsername(t('legacy_username_prompt'));
        }
      }
    })
    .catch(() => {
      // تعذّر جلب الدور (مشكلة شبكة) - نكمل بنفس التجربة الفردية بدل ما نعلّق المستخدم
      proceedToApp();
      if (!hasStoredUsername) {
        promptForUsername(t('legacy_username_prompt'));
      }
    });

  // نزامن اسم المستخدم بجدول profiles القابل للبحث - يخدم ميزة الأصدقاء
  fetch(`${API_BASE}/api/profile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
    body: JSON.stringify({ username: currentUsername }),
  }).catch(() => {});

  // نسجّل بصمة "فتح المنصة اليوم" - الباك إند يتكفل بعدم التكرار لو صار
  // أكثر من نداء بنفس اليوم (تسجيل دخول ثم تسجيل حساب مثلًا). لازم تخلص
  // قبل ما نجيب الأداء عشان الستريك يشمل زيارة اليوم فورًا، مو بعد أول
  // اختبار يحله المستخدم
  fetch(`${API_BASE}/api/ping-active`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${currentAccessToken}` },
  }).catch(() => {}).finally(() => {
    // شارة الستريك بالشاشة الرئيسية - تظهر بس من ٣ أيام متتالية فأكثر
    fetch(`${API_BASE}/api/performance`, { headers: { 'Authorization': `Bearer ${currentAccessToken}` } })
      .then(res => res.json())
      .then(data => {
        if (data.current_streak >= 3) {
          document.getElementById('streakBadgeText').textContent = t('streak_days_suffix', { n: data.current_streak });
          show('streakBadge');
        }
      })
      .catch(() => {});
  });

  // نموذج ميسر المدمج يتطلب callback_url صالح (حتى بدون إعادة توجيه فعلية
  // ملموسة بأغلب الحالات) - فلو المستخدم رجع فعليًا لصفحتنا بعد تدفّق دفع
  // (مثلاً Apple Pay أو 3D Secure يحتاجون تحويل كامل)، نكمل متابعة تفعيل
  // الاشتراك المعلّق من جديد بعد إعادة تحميل الصفحة
  resumePendingSubscriptionCheck();
}

// Supabase يجدد access_token تلقائيًا بالخلفية - نتابع آخر نسخة عشان الطلبات
// المحمية (تسجيل نتيجة اختبار، جلب الأداء) ما تفشل بجلسة قديمة منتهية.
// ملاحظة مهمة: Supabase يخزّن الجلسة بـ localStorage المشتركة بين كل تبويبات
// نفس الموقع - فلو سجّلت دخول بحساب ثاني بتبويب ثاني، هذا التبويب يستلم
// حدث الجلسة الجديدة تلقائيًا برضو! لو صاحب الحساب فعليًا تغيّر (user id
// مختلف) نعيد تحميل الصفحة كاملة بدل ما نكمل بحالة قديمة (دور/توكن ما
// يطابقون الحساب الفعلي الحين، يسبب أخطاء "ما عندك صلاحية" مربكة)
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (!session) return;
  if (currentUserId && session.user.id !== currentUserId) {
    location.reload();
    return;
  }
  currentAccessToken = session.access_token;
});

supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) onAuthSuccess(data.session);
});

document.getElementById('goToSignupBtn').addEventListener('click', () => {
  hide('login-form'); show('signup-form');
});
document.getElementById('goToLoginBtn').addEventListener('click', () => {
  hide('signup-form'); show('login-form');
});
document.getElementById('guestFromLoginBtn').addEventListener('click', proceedToApp);
document.getElementById('guestFromSignupBtn').addEventListener('click', proceedToApp);

document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
  clearError('loginError');
  const identifier = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!identifier || !password) { showError('loginError', t('err_email_password_required')); return; }

  // حسابات الطلاب المولّدة بالجملة تسجّل دخول باسم مستخدم (بدون إيميل حقيقي) -
  // لو المُدخل مو إيميل، نحوّله أول لبريده الاصطناعي عبر الباك إند قبل Supabase
  // (اللي يتطلب إيميل دايمًا لتسجيل الدخول بكلمة سر)
  let email = identifier;
  if (!identifier.includes('@')) {
    try {
      const res = await fetch(`${API_BASE}/api/resolve-login-identifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const resolved = await res.json();
      if (!res.ok || !resolved.email) { showError('loginError', t('err_wrong_credentials')); return; }
      email = resolved.email;
    } catch {
      showError('loginError', t('err_unexpected')); return;
    }
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { showError('loginError', t('err_wrong_credentials')); return; }
  onAuthSuccess(data.session);
});

document.getElementById('signupSubmitBtn').addEventListener('click', async () => {
  clearError('signupError');
  const username = document.getElementById('signupUsername').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const education_level = document.getElementById('signupEducationLevel').value;
  const proficiency_level = document.getElementById('signupProficiencyLevel').value;
  if (!username) { showError('signupError', t('err_name_required')); return; }
  if (!email || !password) { showError('signupError', t('err_email_password_required')); return; }
  if (password.length < 6) { showError('signupError', t('err_password_min')); return; }

  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { data: { username, education_level, proficiency_level } },
  });
  if (error) { showError('signupError', error.message || t('err_signup_failed')); return; }

  if (data.session) {
    onAuthSuccess(data.session);
  } else {
    showError('signupError', t('signup_verify_email'));
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

// ---------- قفل الميزات الحسابية عن الضيوف ----------
// الأزرار تظهر دائمًا (حتى للضيوف) - الضغط عليها كضيف يفتح مودال "سجل / أنشئ
// حساب" بدل ما يوديه للميزة نفسها أو يخفي الزر بالكامل
function requireAuthOrPrompt() {
  if (currentAccessToken) return true;
  show('loginRequiredModal');
  return false;
}
document.getElementById('loginRequiredCloseBtn').addEventListener('click', () => hide('loginRequiredModal'));
document.getElementById('loginRequiredLoginBtn').addEventListener('click', () => {
  hide('loginRequiredModal');
  pushNavSnapshot();
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('signup-form');
  show('login-form');
  updateGlobalBackButton();
});
document.getElementById('loginRequiredSignupBtn').addEventListener('click', () => {
  hide('loginRequiredModal');
  pushNavSnapshot();
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('login-form');
  show('signup-form');
  updateGlobalBackButton();
});
document.getElementById('guestLoginPromptBtn').addEventListener('click', () => {
  pushNavSnapshot();
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  hide('signup-form');
  show('login-form');
  updateGlobalBackButton();
});

