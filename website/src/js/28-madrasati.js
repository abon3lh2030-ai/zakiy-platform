// ================= مدرستي + التحضير الذكي (أداة معلم مستقلة - أي حساب
// مسجّل) - اختصار لموقع مدرستي الرسمي (بدون أي تكامل بيانات) + توليد
// تحضير درس بالذكاء الاصطناعي وحفظه/إعادة استخدامه لاحقًا =================
let currentLessonPrepId = null;
let currentLessonPrepContent = null;

async function loadMadrasatiScreen() {
  const list = document.getElementById('lessonPrepList');
  const empty = document.getElementById('lessonPrepEmptyState');
  clearError('lessonPrepListError');
  try {
    const { preparations } = await apiCall('GET', '/api/lesson-prep');
    empty.classList.toggle('hidden', preparations.length > 0);
    list.innerHTML = preparations.map(p => `
      <div class="assignment-card" data-prep-id="${p.id}">
        <div class="assignment-top">
          <span class="assignment-title">${escapeHtml(p.lesson_title)}</span>
        </div>
        <div class="assignment-meta">${escapeHtml(p.subject)} · ${escapeHtml(p.grade_level)}${p.unit ? ' · ' + escapeHtml(p.unit) : ''}</div>
      </div>
    `).join('');
    list.querySelectorAll('.assignment-card').forEach(card => {
      card.addEventListener('click', async () => {
        pushNavSnapshot();
        try {
          const prep = await apiCall('GET', `/api/lesson-prep/${card.dataset.prepId}`);
          openLessonPrepScreen(prep);
        } catch (e) {
          showError('lessonPrepListError', e.message);
        }
        updateGlobalBackButton();
      });
    });
  } catch (e) {
    showError('lessonPrepListError', e.message);
  }
}

document.getElementById('newLessonPrepBtn').addEventListener('click', () => {
  pushNavSnapshot();
  openLessonPrepScreen(null);
  updateGlobalBackButton();
});

function openLessonPrepScreen(existingPrep) {
  showAccountScreen('step-lesson-prep');
  clearError('lessonPrepGenerateError');
  clearError('lessonPrepSaveError');
  currentLessonPrepId = existingPrep ? existingPrep.id : null;
  currentLessonPrepContent = existingPrep ? existingPrep.content : null;
  document.getElementById('lessonPrepHeading').textContent = t(existingPrep ? 'lesson_prep_view_heading' : 'lesson_prep_create_heading');
  document.getElementById('lessonPrepDeleteBtn').classList.toggle('hidden', !existingPrep);

  document.getElementById('lessonPrepSubjectInput').value = existingPrep ? existingPrep.subject : '';
  document.getElementById('lessonPrepGradeInput').value = existingPrep ? existingPrep.grade_level : '';
  document.getElementById('lessonPrepUnitInput').value = existingPrep ? (existingPrep.unit || '') : '';
  document.getElementById('lessonPrepTitleInput').value = existingPrep ? existingPrep.lesson_title : '';

  if (existingPrep) {
    renderLessonPrepResult(existingPrep.content);
    document.getElementById('lessonPrepResult').classList.remove('hidden');
  } else {
    document.getElementById('lessonPrepResult').classList.add('hidden');
  }
}

function renderLessonPrepResult(content) {
  currentLessonPrepContent = content;
  const listHtml = arr => (arr || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  document.getElementById('lpObjectivesList').innerHTML = listHtml(content.objectives);
  document.getElementById('lpIntroText').textContent = content.intro || '';
  document.getElementById('lpStepsList').innerHTML = listHtml(content.steps);
  document.getElementById('lpActivitiesList').innerHTML = listHtml(content.activities);
  document.getElementById('lpAssessmentText').textContent = content.assessment || '';
  document.getElementById('lpHomeworkText').textContent = content.homework || '';
  document.getElementById('lpEnrichmentText').textContent = content.enrichment || '';
  document.getElementById('lessonPrepResult').classList.remove('hidden');
}

function readLessonPrepFormFields() {
  return {
    subject: document.getElementById('lessonPrepSubjectInput').value.trim(),
    grade_level: document.getElementById('lessonPrepGradeInput').value.trim(),
    unit: document.getElementById('lessonPrepUnitInput').value.trim(),
    lesson_title: document.getElementById('lessonPrepTitleInput').value.trim(),
  };
}

async function generateLessonPrep() {
  clearError('lessonPrepGenerateError');
  const fields = readLessonPrepFormFields();
  if (!fields.subject || !fields.grade_level || !fields.lesson_title) {
    showError('lessonPrepGenerateError', t('err_lesson_prep_fields_required'));
    return;
  }
  const btn = document.getElementById('lessonPrepGenerateBtn');
  setLoading(btn, true, t('btn_generate_lesson_prep'));
  try {
    const { content_raw } = await apiCall('POST', '/api/lesson-prep/generate', { ...fields, lang: currentLang });
    let raw = content_raw.trim();
    raw = raw.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    const content = JSON.parse(raw);
    currentLessonPrepId = null; // توليد جديد = مسودة جديدة، حتى لو كنا نعرض تحضير محفوظ قبل
    document.getElementById('lessonPrepDeleteBtn').classList.add('hidden');
    renderLessonPrepResult(content);
  } catch (e) {
    showError('lessonPrepGenerateError', e.message || t('err_lesson_prep_gen_failed'));
  } finally {
    setLoading(btn, false, t('btn_generate_lesson_prep'));
  }
}
document.getElementById('lessonPrepGenerateBtn').addEventListener('click', generateLessonPrep);
document.getElementById('lessonPrepRegenerateBtn').addEventListener('click', generateLessonPrep);

document.getElementById('lessonPrepCopyBtn').addEventListener('click', async () => {
  if (!currentLessonPrepContent) return;
  const c = currentLessonPrepContent;
  const lines = [
    `${t('lp_objectives_label')}:`, ...(c.objectives || []).map(x => `- ${x}`), '',
    `${t('lp_intro_label')}:`, c.intro || '', '',
    `${t('lp_steps_label')}:`, ...(c.steps || []).map(x => `- ${x}`), '',
    `${t('lp_activities_label')}:`, ...(c.activities || []).map(x => `- ${x}`), '',
    `${t('lp_assessment_label')}:`, c.assessment || '', '',
    `${t('lp_homework_label')}:`, c.homework || '', '',
    `${t('lp_enrichment_label')}:`, c.enrichment || '',
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    const btn = document.getElementById('lessonPrepCopyBtn');
    const original = btn.textContent;
    btn.textContent = t('copied_label');
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    alert(t('err_copy_failed'));
  }
});

document.getElementById('lessonPrepSaveBtn').addEventListener('click', async () => {
  clearError('lessonPrepSaveError');
  if (!currentLessonPrepContent) return;
  const fields = readLessonPrepFormFields();
  if (!fields.subject || !fields.grade_level || !fields.lesson_title) {
    showError('lessonPrepSaveError', t('err_lesson_prep_fields_required'));
    return;
  }
  const btn = document.getElementById('lessonPrepSaveBtn');
  setLoading(btn, true, t('btn_save_lesson_prep'));
  try {
    const payload = { ...fields, content: currentLessonPrepContent };
    if (currentLessonPrepId) {
      await apiCall('PATCH', `/api/lesson-prep/${currentLessonPrepId}`, payload);
    } else {
      const saved = await apiCall('POST', '/api/lesson-prep', payload);
      currentLessonPrepId = saved.id;
      document.getElementById('lessonPrepDeleteBtn').classList.remove('hidden');
    }
    btn.textContent = t('saved_label');
    setTimeout(() => { btn.textContent = t('btn_save_lesson_prep'); }, 1500);
  } catch (e) {
    showError('lessonPrepSaveError', e.message);
  } finally {
    setLoading(btn, false, t('btn_save_lesson_prep'));
  }
});

document.getElementById('lessonPrepDeleteBtn').addEventListener('click', async () => {
  if (!currentLessonPrepId || !confirm(t('confirm_delete_lesson_prep'))) return;
  try {
    await apiCall('DELETE', `/api/lesson-prep/${currentLessonPrepId}`);
    document.getElementById('globalBackBtn').click();
  } catch (e) {
    showError('lessonPrepSaveError', e.message);
  }
});
