// ---------- Student: جدولي ----------
document.getElementById('studentScheduleNavBtn').addEventListener('click', async () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  TOP_LEVEL_SCREENS.forEach(hide);
  hide('pomodoroWidget'); // خلّه يختفي كل ما غادرنا الشاشة الحالية بالكامل - يظهر بس أثناء جلسة المذاكرة الفردية نفسها
  hide('paymentModalOverlay'); // نفس المبدأ - نافذة الدفع ما تضل عالقة لو المستخدم غادر الإعدادات بدون ما يسكّرها صراحة
  show('step-student-schedule');
  updateGlobalBackButton();
  const wrap = document.getElementById('studentScheduleWrap');
  wrap.innerHTML = t('loading');
  const dayNames = [t('day_0'), t('day_1'), t('day_2'), t('day_3'), t('day_4'), t('day_5'), t('day_6')];
  try {
    const data = await apiCall('GET', '/api/student/schedule');
    if (!data.schedule.length) { wrap.innerHTML = `<p class="desc">${t('no_schedule_yet')}</p>`; return; }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
        <th>${t('th_day')}</th><th>${t('th_time')}</th><th>${t('th_subject')}</th>
      </tr></thead><tbody>${data.schedule.map(s => `
        <tr><td>${dayNames[s.day_of_week] || s.day_of_week}</td><td>${escapeHtml(s.start_time)} - ${escapeHtml(s.end_time)}</td><td>${escapeHtml(s.subject || '—')}</td></tr>
      `).join('')}</tbody></table>`;
  } catch (e) {
    wrap.innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
});

