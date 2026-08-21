  // نطبّق الثيم المحفوظ فورًا (قبل أي رندر محسوس) عشان نتفادى "ومضة" لون
  // خاطئ لما الصفحة تفتح بالدارك مود
  (function () {
    var saved = localStorage.getItem('zakiy-theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  })();
  // نطبّق اتجاه الصفحة (rtl/ltr) المحفوظ فورًا برضو - يمنع "ومضة" انقلاب
  // الاتجاه لو المستخدم مسبقًا اختار الإنجليزي (النص نفسه يترجم لاحقًا بالسكربت
  // الرئيسي، بس الاتجاه العام للصفحة أهم شي نتفادى ومضته)
  (function () {
    var savedLang = localStorage.getItem('zakiy-lang');
    if (savedLang === 'en') {
      document.documentElement.setAttribute('lang', 'en');
      document.documentElement.setAttribute('dir', 'ltr');
    }
  })();
