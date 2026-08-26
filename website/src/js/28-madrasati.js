// ================= مدرستي + التحضير الذكي (أداة معلم مستقلة - أي حساب
// مسجّل) - اختصار لموقع مدرستي الرسمي (بدون أي تكامل بيانات) + توليد
// تحضير درس بالذكاء الاصطناعي وحفظه/إعادة استخدامه لاحقًا =================
let currentLessonPrepId = null;
let currentLessonPrepContent = null;

async function loadMadrasatiScreen() {
  loadLessonPrepList();
  loadHomeworkHelpList();
  loadStudyPlanList();
}

async function loadLessonPrepList() {
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

// يحوّل نص خام (محتمل ملفوف بـ ```json fences) لكائن JSON - نفس نمط
// معالجة رد الذكاء الاصطناعي بكل أدوات مدرستي/التوليد بالمنصة
function parseAiJson(raw) {
  let clean = raw.trim();
  clean = clean.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(clean);
}

// ================= نشاط إثرائي مستقل (معلم) - بدون حفظ ================= //
document.getElementById('openEnrichmentBtn').addEventListener('click', () => {
  pushNavSnapshot();
  showAccountScreen('step-enrichment');
  clearError('enrichmentError');
  document.getElementById('enrichmentResult').classList.add('hidden');
  updateGlobalBackButton();
});

document.getElementById('enrichmentGenerateBtn').addEventListener('click', async () => {
  clearError('enrichmentError');
  const subject = document.getElementById('enrichmentSubjectInput').value.trim();
  const grade_level = document.getElementById('enrichmentGradeInput').value.trim();
  const topic = document.getElementById('enrichmentTopicInput').value.trim();
  if (!subject || !grade_level || !topic) {
    showError('enrichmentError', t('err_lesson_prep_fields_required'));
    return;
  }
  const btn = document.getElementById('enrichmentGenerateBtn');
  setLoading(btn, true, t('btn_generate_enrichment'));
  try {
    const { content_raw } = await apiCall('POST', '/api/enrichment/generate', { subject, grade_level, topic, lang: currentLang });
    const content = parseAiJson(content_raw);
    document.getElementById('enrichmentTitleText').textContent = content.title || '';
    document.getElementById('enrichmentDescriptionText').textContent = content.description || '';
    document.getElementById('enrichmentInstructionsList').innerHTML =
      (content.instructions || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    const materialsBox = document.getElementById('enrichmentMaterialsText');
    if (content.materials_needed) {
      materialsBox.textContent = `${t('lp_enrichment_label')}: ${content.materials_needed}`;
      materialsBox.classList.remove('hidden');
    } else {
      materialsBox.classList.add('hidden');
    }
    document.getElementById('enrichmentResult').classList.remove('hidden');
  } catch (e) {
    showError('enrichmentError', e.message || t('err_lesson_prep_gen_failed'));
  } finally {
    setLoading(btn, false, t('btn_generate_enrichment'));
  }
});

document.getElementById('enrichmentCopyBtn').addEventListener('click', async () => {
  const text = [
    document.getElementById('enrichmentTitleText').textContent,
    document.getElementById('enrichmentDescriptionText').textContent,
    ...Array.from(document.getElementById('enrichmentInstructionsList').children).map(li => `- ${li.textContent}`),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('enrichmentCopyBtn');
    const original = btn.textContent;
    btn.textContent = t('copied_label');
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch { alert(t('err_copy_failed')); }
});

// ================= محلّل نتائج الطلاب (معلم) - بدون حفظ ================= //
document.getElementById('openResultsAnalysisBtn').addEventListener('click', () => {
  pushNavSnapshot();
  showAccountScreen('step-results-analysis');
  clearError('resultsAnalysisError');
  document.getElementById('resultsAnalysisResult').classList.add('hidden');
  updateGlobalBackButton();
});

document.getElementById('resultsAnalysisGenerateBtn').addEventListener('click', async () => {
  clearError('resultsAnalysisError');
  const raw_results = document.getElementById('resultsAnalysisInput').value.trim();
  if (!raw_results) {
    showError('resultsAnalysisError', t('err_raw_results_required'));
    return;
  }
  const btn = document.getElementById('resultsAnalysisGenerateBtn');
  setLoading(btn, true, t('btn_generate_results_analysis'));
  try {
    const { content_raw } = await apiCall('POST', '/api/results-analysis/generate', { raw_results, lang: currentLang });
    const content = parseAiJson(content_raw);
    document.getElementById('raSummaryText').textContent = content.overall_summary || '';
    const listHtml = arr => (arr || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    document.getElementById('raStrengthsList').innerHTML = listHtml(content.strengths);
    document.getElementById('raWeaknessesList').innerHTML = listHtml(content.weaknesses);
    document.getElementById('raAtRiskList').innerHTML = listHtml(content.at_risk_students);
    document.getElementById('raRecommendationsList').innerHTML = listHtml(content.recommendations);
    document.getElementById('resultsAnalysisResult').classList.remove('hidden');
  } catch (e) {
    showError('resultsAnalysisError', e.message || t('err_lesson_prep_gen_failed'));
  } finally {
    setLoading(btn, false, t('btn_generate_results_analysis'));
  }
});

// ================= مساعد الواجب الذكي (طالب) - بحفظ/عرض/حذف ================= //
let currentHomeworkHelpId = null;
let currentHomeworkHelpContent = null;

async function loadHomeworkHelpList() {
  const list = document.getElementById('homeworkHelpList');
  const empty = document.getElementById('homeworkHelpEmptyState');
  try {
    const { sessions } = await apiCall('GET', '/api/homework-help');
    empty.classList.toggle('hidden', sessions.length > 0);
    list.innerHTML = sessions.map(s => `
      <div class="assignment-card" data-session-id="${s.id}">
        <div class="assignment-top"><span class="assignment-title">${escapeHtml(s.topic)}</span></div>
        <div class="assignment-meta">${escapeHtml(s.subject)} · ${escapeHtml(s.grade_level)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.assignment-card').forEach(card => {
      card.addEventListener('click', async () => {
        pushNavSnapshot();
        try {
          const session = await apiCall('GET', `/api/homework-help/${card.dataset.sessionId}`);
          openHomeworkHelpScreen(session);
        } catch (e) {
          showError('studentToolsListError', e.message);
        }
        updateGlobalBackButton();
      });
    });
  } catch (e) {
    showError('studentToolsListError', e.message);
  }
}

document.getElementById('newHomeworkHelpBtn').addEventListener('click', () => {
  pushNavSnapshot();
  openHomeworkHelpScreen(null);
  updateGlobalBackButton();
});

function openHomeworkHelpScreen(existingSession) {
  showAccountScreen('step-homework-help');
  clearError('homeworkHelpGenerateError');
  clearError('homeworkHelpSaveError');
  currentHomeworkHelpId = existingSession ? existingSession.id : null;
  currentHomeworkHelpContent = existingSession ? existingSession.content : null;
  document.getElementById('homeworkHelpHeading').textContent = t(existingSession ? 'homework_help_view_heading' : 'homework_help_create_heading');
  document.getElementById('homeworkHelpDeleteBtn').classList.toggle('hidden', !existingSession);
  document.getElementById('homeworkHelpSubjectInput').value = existingSession ? existingSession.subject : '';
  document.getElementById('homeworkHelpGradeInput').value = existingSession ? existingSession.grade_level : '';
  document.getElementById('homeworkHelpTopicInput').value = existingSession ? existingSession.topic : '';
  if (existingSession) {
    renderHomeworkHelpResult(existingSession.content);
  } else {
    document.getElementById('homeworkHelpResult').classList.add('hidden');
  }
}

function renderHomeworkHelpResult(content) {
  currentHomeworkHelpContent = content;
  document.getElementById('hhExplanationText').textContent = content.explanation || '';
  document.getElementById('hhExampleText').textContent = content.worked_example || '';
  document.getElementById('hhPracticeList').innerHTML = (content.practice_questions || []).map((q, i) => `
    <div class="highlight-box" style="margin-top:8px;">
      <p class="desc" style="font-weight:700; margin:0 0 6px;">${i + 1}. ${escapeHtml(q.question)}</p>
      <p class="desc" style="margin:0;">${escapeHtml(q.answer)}</p>
    </div>
  `).join('');
  document.getElementById('hhTipsText').textContent = content.tips || '';
  document.getElementById('homeworkHelpResult').classList.remove('hidden');
}

async function generateHomeworkHelp() {
  clearError('homeworkHelpGenerateError');
  const subject = document.getElementById('homeworkHelpSubjectInput').value.trim();
  const grade_level = document.getElementById('homeworkHelpGradeInput').value.trim();
  const topic = document.getElementById('homeworkHelpTopicInput').value.trim();
  if (!subject || !grade_level || !topic) {
    showError('homeworkHelpGenerateError', t('err_lesson_prep_fields_required'));
    return;
  }
  const btn = document.getElementById('homeworkHelpGenerateBtn');
  setLoading(btn, true, t('btn_generate_homework_help'));
  try {
    const { content_raw } = await apiCall('POST', '/api/homework-help/generate', { subject, grade_level, topic, lang: currentLang });
    const content = parseAiJson(content_raw);
    currentHomeworkHelpId = null;
    document.getElementById('homeworkHelpDeleteBtn').classList.add('hidden');
    renderHomeworkHelpResult(content);
  } catch (e) {
    showError('homeworkHelpGenerateError', e.message || t('err_lesson_prep_gen_failed'));
  } finally {
    setLoading(btn, false, t('btn_generate_homework_help'));
  }
}
document.getElementById('homeworkHelpGenerateBtn').addEventListener('click', generateHomeworkHelp);
document.getElementById('homeworkHelpRegenerateBtn').addEventListener('click', generateHomeworkHelp);

document.getElementById('homeworkHelpCopyBtn').addEventListener('click', async () => {
  if (!currentHomeworkHelpContent) return;
  const c = currentHomeworkHelpContent;
  const lines = [
    `${t('hh_explanation_label')}:`, c.explanation || '', '',
    `${t('hh_example_label')}:`, c.worked_example || '', '',
    `${t('hh_practice_label')}:`,
    ...(c.practice_questions || []).map((q, i) => `${i + 1}. ${q.question}\n   ${q.answer}`), '',
    `${t('hh_tips_label')}:`, c.tips || '',
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    const btn = document.getElementById('homeworkHelpCopyBtn');
    const original = btn.textContent;
    btn.textContent = t('copied_label');
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch { alert(t('err_copy_failed')); }
});

document.getElementById('homeworkHelpSaveBtn').addEventListener('click', async () => {
  clearError('homeworkHelpSaveError');
  if (!currentHomeworkHelpContent) return;
  const subject = document.getElementById('homeworkHelpSubjectInput').value.trim();
  const grade_level = document.getElementById('homeworkHelpGradeInput').value.trim();
  const topic = document.getElementById('homeworkHelpTopicInput').value.trim();
  if (!subject || !grade_level || !topic) {
    showError('homeworkHelpSaveError', t('err_lesson_prep_fields_required'));
    return;
  }
  const btn = document.getElementById('homeworkHelpSaveBtn');
  setLoading(btn, true, t('btn_save_homework_help'));
  try {
    if (currentHomeworkHelpId) {
      await apiCall('PATCH', `/api/homework-help/${currentHomeworkHelpId}`, { subject, grade_level, topic, content: currentHomeworkHelpContent });
    } else {
      const saved = await apiCall('POST', '/api/homework-help', { subject, grade_level, topic, content: currentHomeworkHelpContent });
      currentHomeworkHelpId = saved.id;
      document.getElementById('homeworkHelpDeleteBtn').classList.remove('hidden');
    }
    btn.textContent = t('saved_label');
    setTimeout(() => { btn.textContent = t('btn_save_homework_help'); }, 1500);
  } catch (e) {
    showError('homeworkHelpSaveError', e.message);
  } finally {
    setLoading(btn, false, t('btn_save_homework_help'));
  }
});

document.getElementById('homeworkHelpDeleteBtn').addEventListener('click', async () => {
  if (!currentHomeworkHelpId || !confirm(t('confirm_delete_homework_help'))) return;
  try {
    await apiCall('DELETE', `/api/homework-help/${currentHomeworkHelpId}`);
    document.getElementById('globalBackBtn').click();
  } catch (e) {
    showError('homeworkHelpSaveError', e.message);
  }
});

// ================= خطة مذاكرة ذكية (طالب) - بحفظ/عرض/حذف ================= //
let currentStudyPlanId = null;
let currentStudyPlanContent = null;

async function loadStudyPlanList() {
  const list = document.getElementById('studyPlanList');
  const empty = document.getElementById('studyPlanEmptyState');
  try {
    const { plans } = await apiCall('GET', '/api/study-plan');
    empty.classList.toggle('hidden', plans.length > 0);
    list.innerHTML = plans.map(p => `
      <div class="assignment-card" data-plan-id="${p.id}">
        <div class="assignment-top"><span class="assignment-title">${escapeHtml(p.subjects)}</span></div>
        <div class="assignment-meta">${p.exam_date ? escapeHtml(p.exam_date) : ''}</div>
      </div>
    `).join('');
    list.querySelectorAll('.assignment-card').forEach(card => {
      card.addEventListener('click', async () => {
        pushNavSnapshot();
        try {
          const plan = await apiCall('GET', `/api/study-plan/${card.dataset.planId}`);
          openStudyPlanScreen(plan);
        } catch (e) {
          showError('studentToolsListError', e.message);
        }
        updateGlobalBackButton();
      });
    });
  } catch (e) {
    showError('studentToolsListError', e.message);
  }
}

document.getElementById('newStudyPlanBtn').addEventListener('click', () => {
  pushNavSnapshot();
  openStudyPlanScreen(null);
  updateGlobalBackButton();
});

function openStudyPlanScreen(existingPlan) {
  showAccountScreen('step-study-plan');
  clearError('studyPlanGenerateError');
  clearError('studyPlanSaveError');
  currentStudyPlanId = existingPlan ? existingPlan.id : null;
  currentStudyPlanContent = existingPlan ? existingPlan.content : null;
  document.getElementById('studyPlanHeading').textContent = t(existingPlan ? 'study_plan_view_heading' : 'study_plan_create_heading');
  document.getElementById('studyPlanDeleteBtn').classList.toggle('hidden', !existingPlan);
  document.getElementById('studyPlanSubjectsInput').value = existingPlan ? existingPlan.subjects : '';
  document.getElementById('studyPlanExamDateInput').value = existingPlan ? (existingPlan.exam_date || '') : '';
  document.getElementById('studyPlanHoursInput').value = existingPlan ? (existingPlan.hours_per_day || '') : '';
  if (existingPlan) {
    renderStudyPlanResult(existingPlan.content);
  } else {
    document.getElementById('studyPlanResult').classList.add('hidden');
  }
}

function renderStudyPlanResult(content) {
  currentStudyPlanContent = content;
  document.getElementById('studyPlanDaysWrap').innerHTML = (content.days || []).map(d => `
    <h3 class="sub-heading" style="margin-top:0;">${escapeHtml(d.date_label)}</h3>
    <ul style="padding-inline-start:20px; margin:0 0 10px;">${(d.tasks || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
  `).join('');
  document.getElementById('spTipsText').textContent = content.general_tips || '';
  document.getElementById('studyPlanResult').classList.remove('hidden');
}

async function generateStudyPlan() {
  clearError('studyPlanGenerateError');
  const subjects = document.getElementById('studyPlanSubjectsInput').value.trim();
  const exam_date = document.getElementById('studyPlanExamDateInput').value || null;
  const hoursRaw = document.getElementById('studyPlanHoursInput').value;
  const hours_per_day = hoursRaw ? parseFloat(hoursRaw) : null;
  if (!subjects) {
    showError('studyPlanGenerateError', t('err_study_plan_subjects_required'));
    return;
  }
  const btn = document.getElementById('studyPlanGenerateBtn');
  setLoading(btn, true, t('btn_generate_study_plan'));
  try {
    const { content_raw } = await apiCall('POST', '/api/study-plan/generate', { subjects, exam_date, hours_per_day, lang: currentLang });
    const content = parseAiJson(content_raw);
    currentStudyPlanId = null;
    document.getElementById('studyPlanDeleteBtn').classList.add('hidden');
    renderStudyPlanResult(content);
  } catch (e) {
    showError('studyPlanGenerateError', e.message || t('err_lesson_prep_gen_failed'));
  } finally {
    setLoading(btn, false, t('btn_generate_study_plan'));
  }
}
document.getElementById('studyPlanGenerateBtn').addEventListener('click', generateStudyPlan);
document.getElementById('studyPlanRegenerateBtn').addEventListener('click', generateStudyPlan);

document.getElementById('studyPlanCopyBtn').addEventListener('click', async () => {
  if (!currentStudyPlanContent) return;
  const c = currentStudyPlanContent;
  const lines = [
    ...(c.days || []).flatMap(d => [`${d.date_label}:`, ...(d.tasks || []).map(x => `- ${x}`), '']),
    `${t('sp_tips_label')}:`, c.general_tips || '',
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    const btn = document.getElementById('studyPlanCopyBtn');
    const original = btn.textContent;
    btn.textContent = t('copied_label');
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch { alert(t('err_copy_failed')); }
});

document.getElementById('studyPlanSaveBtn').addEventListener('click', async () => {
  clearError('studyPlanSaveError');
  if (!currentStudyPlanContent) return;
  const subjects = document.getElementById('studyPlanSubjectsInput').value.trim();
  const exam_date = document.getElementById('studyPlanExamDateInput').value || null;
  const hoursRaw = document.getElementById('studyPlanHoursInput').value;
  const hours_per_day = hoursRaw ? parseFloat(hoursRaw) : null;
  if (!subjects) {
    showError('studyPlanSaveError', t('err_study_plan_subjects_required'));
    return;
  }
  const btn = document.getElementById('studyPlanSaveBtn');
  setLoading(btn, true, t('btn_save_study_plan'));
  try {
    const payload = { subjects, exam_date, hours_per_day, content: currentStudyPlanContent };
    if (currentStudyPlanId) {
      await apiCall('PATCH', `/api/study-plan/${currentStudyPlanId}`, payload);
    } else {
      const saved = await apiCall('POST', '/api/study-plan', payload);
      currentStudyPlanId = saved.id;
      document.getElementById('studyPlanDeleteBtn').classList.remove('hidden');
    }
    btn.textContent = t('saved_label');
    setTimeout(() => { btn.textContent = t('btn_save_study_plan'); }, 1500);
  } catch (e) {
    showError('studyPlanSaveError', e.message);
  } finally {
    setLoading(btn, false, t('btn_save_study_plan'));
  }
});

document.getElementById('studyPlanDeleteBtn').addEventListener('click', async () => {
  if (!currentStudyPlanId || !confirm(t('confirm_delete_study_plan'))) return;
  try {
    await apiCall('DELETE', `/api/study-plan/${currentStudyPlanId}`);
    document.getElementById('globalBackBtn').click();
  } catch (e) {
    showError('studyPlanSaveError', e.message);
  }
});
