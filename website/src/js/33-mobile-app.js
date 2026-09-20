// واجهة الجوال: شريط تنقل سفلي وقائمة كاملة منزلقة، بدون تغيير تجربة الديسكتوب.
(function setupMobileAppShell() {
  const media = window.matchMedia('(max-width: 720px)');
  const sidebar = document.getElementById('sidebar');
  const moreButton = document.getElementById('mobileMoreBtn');
  const closeButton = document.getElementById('mobileSidebarCloseBtn');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const mobileButtons = Array.from(document.querySelectorAll('.mobile-nav-btn'));

  if (!sidebar || !moreButton || !backdrop) return;

  const closeDrawer = () => {
    sidebar.classList.remove('mobile-open');
    document.body.classList.remove('mobile-nav-open');
    moreButton.classList.remove('is-active');
    moreButton.setAttribute('aria-expanded', 'false');
    backdrop.setAttribute('aria-hidden', 'true');
  };

  const openDrawer = () => {
    if (!media.matches) return;
    sidebar.classList.add('mobile-open');
    document.body.classList.add('mobile-nav-open');
    moreButton.classList.add('is-active');
    moreButton.setAttribute('aria-expanded', 'true');
    backdrop.setAttribute('aria-hidden', 'false');
    closeButton?.focus({ preventScroll: true });
  };

  moreButton.setAttribute('aria-expanded', 'false');
  moreButton.setAttribute('aria-controls', 'sidebar');
  moreButton.addEventListener('click', () => sidebar.classList.contains('mobile-open') ? closeDrawer() : openDrawer());
  closeButton?.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  document.querySelectorAll('.sidebar-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (media.matches) closeDrawer();
    });
  });

  document.querySelectorAll('[data-mobile-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.mobileTarget);
      if (!target || target.classList.contains('hidden')) return;
      closeDrawer();
      target.click();
      mobileButtons.forEach(item => item.classList.toggle('is-active', item === button));
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) closeDrawer();
  });

  const handleMediaChange = () => {
    if (!media.matches) closeDrawer();
  };
  if (media.addEventListener) media.addEventListener('change', handleMediaChange);
  else media.addListener(handleMediaChange);

  // نفس عدّاد الرسائل في السايد بار يظهر في شريط الجوال كذلك.
  const sourceBadge = document.getElementById('messagesUnreadBadge');
  const mobileBadge = document.getElementById('mobileMessagesUnreadBadge');
  if (sourceBadge && mobileBadge) {
    const syncBadge = () => {
      mobileBadge.textContent = sourceBadge.textContent;
      mobileBadge.classList.toggle('hidden', sourceBadge.classList.contains('hidden') || sourceBadge.textContent.trim() === '0');
    };
    new MutationObserver(syncBadge).observe(sourceBadge, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    syncBadge();
  }
})();
