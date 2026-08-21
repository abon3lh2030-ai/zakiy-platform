// ---------- الإعدادات (لغة متاحة للجميع، باقي الحقول تحتاج تسجيل دخول) ----------
document.getElementById('settingsBtn').addEventListener('click', () => {
  pushNavSnapshot();
  showSettingsScreen();
  updateGlobalBackButton();

  const loggedIn = !!currentAccessToken;
  document.getElementById('settingsAccountGate').classList.toggle('hidden', loggedIn);
  document.getElementById('settingsAccountFields').classList.toggle('hidden', !loggedIn);
  if (loggedIn) {
    document.getElementById('settingsUsernameInput').value = currentUsername || '';
    document.getElementById('settingsPhoneInput').value = currentUserPhone || '';
    document.getElementById('settingsNewPassword').value = '';
    document.getElementById('settingsConfirmPassword').value = '';
    document.getElementById('settingsNameMsg').innerHTML = '';
    document.getElementById('settingsPasswordMsg').innerHTML = '';
    document.getElementById('settingsPhoneMsg').innerHTML = '';
    loadProfileIntoSettings();
  }
});

// ---------- إعدادات البروفايل (نبذة/مدرسة/خصوصية) ----------
// حقول القسم (بدون زر الحفظ/العرض) - نعطّلها وقت التحميل عشان نمنع سباق حقيقي:
// لو المستخدم يبدأ يبدّل المفاتيح بسرعة قبل ما يوصل رد الجلب، كان يرجع يطبّق
// القيم القديمة فوق تعديلاته لحظة ما يوصل الرد متأخر، فتنحفظ القيم الغلط بالضغط
// على "حفظ" بعدها - تعطيل الحقول لين يخلص الجلب يمنع أي تفاعل بهالفترة الحرجة
const PROFILE_SETTINGS_FIELD_IDS = [
  'settingsBioInput', 'settingsSchoolInput', 'settingsPrivateToggle',
  'settingsShowPerformance', 'settingsShowLibrary', 'settingsShowArchive', 'settingsShowFriends',
];
function setProfileSettingsFieldsDisabled(disabled) {
  PROFILE_SETTINGS_FIELD_IDS.forEach(id => { document.getElementById(id).disabled = disabled; });
  document.getElementById('settingsSaveProfileBtn').disabled = disabled;
}
async function loadProfileIntoSettings() {
  clearError('settingsProfileMsg');
  setProfileSettingsFieldsDisabled(true);
  try {
    const res = await fetch(`${API_BASE}/api/profile/${currentUserId}`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return;
    document.getElementById('settingsBioInput').value = data.bio || '';
    document.getElementById('settingsSchoolInput').value = data.school_name || '';
    document.getElementById('settingsPrivateToggle').checked = !!data.is_private;
    document.getElementById('settingsShowPerformance').checked = data.show_performance !== false;
    document.getElementById('settingsShowLibrary').checked = data.show_library !== false;
    document.getElementById('settingsShowArchive').checked = data.show_archive !== false;
    document.getElementById('settingsShowFriends').checked = data.show_friends !== false;
  } catch { /* تجاهل */ } finally {
    setProfileSettingsFieldsDisabled(false);
    updateVisibilityTogglesState(); // يراعي حالة "خاص بالكامل" الحقيقية بعد التفعيل
  }
}

// لو البروفايل خاص بالكامل، تبديلات إظهار الأقسام تصير بلا معنى - نعطّلها
// بصريًا بدل ما نخفيها، عشان المستخدم يفهم ليش
function updateVisibilityTogglesState() {
  const isPrivate = document.getElementById('settingsPrivateToggle').checked;
  document.getElementById('settingsVisibilityToggles').style.opacity = isPrivate ? '0.5' : '1';
  ['settingsShowPerformance', 'settingsShowLibrary', 'settingsShowArchive', 'settingsShowFriends'].forEach(id => {
    document.getElementById(id).disabled = isPrivate;
  });
}
document.getElementById('settingsPrivateToggle').addEventListener('change', updateVisibilityTogglesState);

document.getElementById('settingsSaveProfileBtn').addEventListener('click', async () => {
  clearError('settingsProfileMsg');
  try {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({
        bio: document.getElementById('settingsBioInput').value,
        school_name: document.getElementById('settingsSchoolInput').value,
        is_private: document.getElementById('settingsPrivateToggle').checked,
        show_performance: document.getElementById('settingsShowPerformance').checked,
        show_library: document.getElementById('settingsShowLibrary').checked,
        show_archive: document.getElementById('settingsShowArchive').checked,
        show_friends: document.getElementById('settingsShowFriends').checked,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_unexpected'));
    document.getElementById('settingsProfileMsg').innerHTML = `<div class="desc">✅ ${t('profile_saved')}</div>`;
  } catch (err) {
    showError('settingsProfileMsg', err.message || t('err_unexpected'));
  }
});

document.getElementById('settingsViewProfileBtn').addEventListener('click', () => {
  showProfileScreen(currentUserId);
});

