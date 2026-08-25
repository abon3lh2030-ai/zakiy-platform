// ---------- مكتبة الكتب الشخصية ----------
async function fetchLibraryBooks() {
  const res = await fetch(`${API_BASE}/api/library`, {
    headers: { 'Authorization': `Bearer ${currentAccessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || t('err_fetch_library'));
  return data.books;
}

function renderLibraryManageList(books) {
  const container = document.getElementById('libraryList');
  if (!books.length) {
    container.innerHTML = '';
    show('libraryEmptyState');
    return;
  }
  hide('libraryEmptyState');
  // كتب المدرسة (source: 'school') مو ملك الطالب - يقدر يقرأها بس، بدون
  // تعديل اسم أو حذف (المدير/الإدارة يديرونها من قسم مكتبة المدرسة)
  container.innerHTML = books.map(b => `
    <div class="leaderboard-row">
      <span class="name">${b.source === 'school' ? '🏫 ' : ''}${escapeHtml(b.title)}</span>
      ${b.source === 'school' ? '' : `
        <button class="ghost rename-book-btn" data-id="${b.id}" style="padding:6px 12px; font-size:12.5px;">✏️ ${t('btn_rename')}</button>
        <button class="ghost delete-book-btn" data-id="${b.id}" style="padding:6px 12px; font-size:12.5px;">🗑️ ${t('btn_delete')}</button>
      `}
    </div>
  `).join('');

  container.querySelectorAll('.rename-book-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newTitle = prompt(t('rename_prompt'));
      if (!newTitle || !newTitle.trim()) return;
      try {
        const res = await fetch(`${API_BASE}/api/library/${btn.dataset.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        if (!res.ok) throw new Error();
        loadLibraryManageScreen();
      } catch { alert(t('err_rename_failed')); }
    });
  });

  container.querySelectorAll('.delete-book-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm_delete_book'))) return;
      try {
        const res = await fetch(`${API_BASE}/api/library/${btn.dataset.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${currentAccessToken}` },
        });
        if (!res.ok) throw new Error();
        loadLibraryManageScreen();
      } catch { alert(t('err_delete_failed')); }
    });
  });
}

async function loadLibraryManageScreen() {
  try {
    const books = await fetchLibraryBooks();
    renderLibraryManageList(books);
  } catch (err) {
    showError('libraryError', err.message || t('err_unexpected'));
  }
}

document.getElementById('sidebarLibraryBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showLibraryScreen();
  updateGlobalBackButton();
  clearError('libraryError');
  loadLibraryManageScreen();
  const isSchoolAdmin = currentUserRole === 'school_admin' || currentUserRole === 'school_administration';
  document.getElementById('schoolLibrarySection').classList.toggle('hidden', !isSchoolAdmin);
  if (isSchoolAdmin) loadSchoolLibrarySection();
});

// ---------- مكتبة المدرسة (مدير/إدارة المدرسة بس) ----------
async function loadSchoolLibrarySection() {
  clearError('schoolLibraryError');
  try {
    const [classesRes, teachersRes] = await Promise.all([
      apiCall('GET', '/api/school/classes'),
      apiCall('GET', '/api/school/teachers'),
    ]);
    const classSelect = document.getElementById('schoolLibraryClassSelect');
    classSelect.innerHTML = `<option value="">${t('school_library_all_classes')}</option>` +
      classesRes.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const teacherSelect = document.getElementById('schoolLibraryTeacherSelect');
    teacherSelect.innerHTML = `<option value="">${t('school_library_all_teachers')}</option>` +
      teachersRes.teachers.map(tch => `<option value="${tch.user_id}">${escapeHtml(tch.username)}</option>`).join('');

    const { books } = await apiCall('GET', '/api/school/library');
    renderSchoolLibraryList(books);
  } catch (e) {
    showError('schoolLibraryError', e.message);
  }
}

function renderSchoolLibraryList(books) {
  const container = document.getElementById('schoolLibraryList');
  const empty = document.getElementById('schoolLibraryEmptyState');
  empty.classList.toggle('hidden', books.length > 0);
  container.innerHTML = books.map(b => `
    <div class="leaderboard-row">
      <span class="name">${escapeHtml(b.title)} <span class="desc" style="display:inline;">— ${b.class_name ? escapeHtml(b.class_name) : t('school_library_all_classes')} · ${b.teacher_name ? escapeHtml(b.teacher_name) : t('school_library_all_teachers')}</span></span>
      <button class="ghost rename-school-book-btn" data-id="${b.id}" style="padding:6px 12px; font-size:12.5px;">✏️ ${t('btn_rename')}</button>
      <button class="ghost delete-school-book-btn" data-id="${b.id}" style="padding:6px 12px; font-size:12.5px;">🗑️ ${t('btn_delete')}</button>
    </div>
  `).join('');

  container.querySelectorAll('.rename-school-book-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newTitle = prompt(t('rename_prompt'));
      if (!newTitle || !newTitle.trim()) return;
      try {
        await apiCall('PATCH', `/api/school/library/${btn.dataset.id}`, { title: newTitle.trim() });
        loadSchoolLibrarySection();
      } catch (e) { alert(e.message); }
    });
  });
  container.querySelectorAll('.delete-school-book-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm_delete_book'))) return;
      try {
        await apiCall('DELETE', `/api/school/library/${btn.dataset.id}`);
        loadSchoolLibrarySection();
      } catch (e) { alert(e.message); }
    });
  });
}

const schoolLibraryDropzone = document.getElementById('schoolLibraryDropzone');
const schoolLibraryFileInput = document.getElementById('schoolLibraryFileInput');
const schoolLibraryFileChip = document.getElementById('schoolLibraryFileChip');
const schoolLibraryFileName = document.getElementById('schoolLibraryFileName');
const schoolLibraryAddBtn = document.getElementById('schoolLibraryAddBtn');
const schoolLibraryRemoveFile = document.getElementById('schoolLibraryRemoveFile');
const schoolLibraryTitleInput = document.getElementById('schoolLibraryTitleInput');
let schoolLibrarySelectedFile = null;

schoolLibraryDropzone.addEventListener('click', () => schoolLibraryFileInput.click());
schoolLibraryDropzone.addEventListener('dragover', e => { e.preventDefault(); schoolLibraryDropzone.classList.add('drag'); });
schoolLibraryDropzone.addEventListener('dragleave', () => schoolLibraryDropzone.classList.remove('drag'));
schoolLibraryDropzone.addEventListener('drop', e => {
  e.preventDefault();
  schoolLibraryDropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleSchoolLibraryFile(e.dataTransfer.files[0]);
});
schoolLibraryFileInput.addEventListener('change', e => {
  if (e.target.files.length) handleSchoolLibraryFile(e.target.files[0]);
});

function handleSchoolLibraryFile(file) {
  if (file.type !== 'application/pdf') {
    showError('schoolLibraryError', t('err_must_be_pdf'));
    return;
  }
  schoolLibrarySelectedFile = file;
  schoolLibraryFileName.textContent = file.name;
  schoolLibraryFileChip.classList.add('show');
  if (!schoolLibraryTitleInput.value.trim()) schoolLibraryTitleInput.value = file.name.replace(/\.pdf$/i, '');
  updateSchoolLibraryAddBtnState();
  clearError('schoolLibraryError');
}

schoolLibraryRemoveFile.addEventListener('click', () => {
  schoolLibrarySelectedFile = null;
  schoolLibraryFileInput.value = '';
  schoolLibraryFileChip.classList.remove('show');
  updateSchoolLibraryAddBtnState();
});

schoolLibraryTitleInput.addEventListener('input', updateSchoolLibraryAddBtnState);
function updateSchoolLibraryAddBtnState() {
  schoolLibraryAddBtn.disabled = !(schoolLibrarySelectedFile && schoolLibraryTitleInput.value.trim());
}

schoolLibraryAddBtn.addEventListener('click', async () => {
  if (!schoolLibrarySelectedFile) return;
  clearError('schoolLibraryError');
  setLoading(schoolLibraryAddBtn, true, t('btn_add_to_school_library'));
  try {
    const formData = new FormData();
    formData.append('file', schoolLibrarySelectedFile);
    formData.append('context', 'library');
    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || t('err_upload_failed'));

    const extractRes = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadData.filename }),
    });
    const extractData = await extractRes.json();
    if (!extractRes.ok) throw new Error(extractData.error || t('err_extract_failed'));

    await apiCall('POST', '/api/school/library', {
      title: schoolLibraryTitleInput.value.trim(),
      extracted_text: extractData.text,
      class_id: document.getElementById('schoolLibraryClassSelect').value || null,
      teacher_id: document.getElementById('schoolLibraryTeacherSelect').value || null,
    });

    schoolLibrarySelectedFile = null;
    schoolLibraryFileInput.value = '';
    schoolLibraryFileChip.classList.remove('show');
    schoolLibraryTitleInput.value = '';
    updateSchoolLibraryAddBtnState();
    loadSchoolLibrarySection();
  } catch (err) {
    showError('schoolLibraryError', err.message || t('err_unexpected'));
  } finally {
    setLoading(schoolLibraryAddBtn, false, t('btn_add_to_school_library'));
  }
});

// ---------- إضافة كتاب جديد بالمكتبة (من شاشة المكتبة نفسها) ----------
const libraryDropzone = document.getElementById('libraryDropzone');
const libraryFileInput = document.getElementById('libraryFileInput');
const libraryFileChip = document.getElementById('libraryFileChip');
const libraryFileName = document.getElementById('libraryFileName');
const libraryAddBtn = document.getElementById('libraryAddBtn');
const libraryRemoveFile = document.getElementById('libraryRemoveFile');
const libraryTitleInput = document.getElementById('libraryTitleInput');
let librarySelectedFile = null;

libraryDropzone.addEventListener('click', () => libraryFileInput.click());
libraryDropzone.addEventListener('dragover', e => { e.preventDefault(); libraryDropzone.classList.add('drag'); });
libraryDropzone.addEventListener('dragleave', () => libraryDropzone.classList.remove('drag'));
libraryDropzone.addEventListener('drop', e => {
  e.preventDefault();
  libraryDropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleLibraryFile(e.dataTransfer.files[0]);
});
libraryFileInput.addEventListener('change', e => {
  if (e.target.files.length) handleLibraryFile(e.target.files[0]);
});

function handleLibraryFile(file) {
  if (file.type !== 'application/pdf') {
    showError('libraryError', t('err_must_be_pdf'));
    return;
  }
  librarySelectedFile = file;
  libraryFileName.textContent = file.name;
  libraryFileChip.classList.add('show');
  if (!libraryTitleInput.value.trim()) libraryTitleInput.value = file.name.replace(/\.pdf$/i, '');
  updateLibraryAddBtnState();
  clearError('libraryError');
}

libraryRemoveFile.addEventListener('click', () => {
  librarySelectedFile = null;
  libraryFileInput.value = '';
  libraryFileChip.classList.remove('show');
  updateLibraryAddBtnState();
});

libraryTitleInput.addEventListener('input', updateLibraryAddBtnState);
function updateLibraryAddBtnState() {
  libraryAddBtn.disabled = !(librarySelectedFile && libraryTitleInput.value.trim());
}

libraryAddBtn.addEventListener('click', async () => {
  if (!librarySelectedFile) return;
  clearError('libraryError');
  setLoading(libraryAddBtn, true, t('btn_save_to_library'));
  try {
    const formData = new FormData();
    formData.append('file', librarySelectedFile);
    formData.append('context', 'library');
    const uploadRes = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || t('err_upload_failed'));

    const extractRes = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadData.filename }),
    });
    const extractData = await extractRes.json();
    if (!extractRes.ok) throw new Error(extractData.error || t('err_extract_failed'));

    const saveRes = await fetch(`${API_BASE}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({ title: libraryTitleInput.value.trim(), extracted_text: extractData.text }),
    });
    const saveData = await saveRes.json();
    if (!saveRes.ok) throw new Error(saveData.error || t('err_library_save_failed'));

    librarySelectedFile = null;
    libraryFileInput.value = '';
    libraryFileChip.classList.remove('show');
    libraryTitleInput.value = '';
    updateLibraryAddBtnState();
    loadLibraryManageScreen();
  } catch (err) {
    showError('libraryError', err.message || t('err_unexpected'));
  } finally {
    setLoading(libraryAddBtn, false, t('btn_save_to_library'));
  }
});

// ---------- دمج اختيار المكتبة بخطوة الرفع (فردي/هوست/مفوّض له صلاحية) ----------
async function loadUploadLibraryPicker() {
  if (!currentAccessToken) {
    hide('uploadFromLibrarySection');
    show('uploadFromDeviceSection');
    return;
  }
  try {
    const books = await fetchLibraryBooks();
    const listEl = document.getElementById('uploadLibraryList');
    if (!books.length) {
      listEl.innerHTML = '';
      show('uploadLibraryEmptyState');
    } else {
      hide('uploadLibraryEmptyState');
      listEl.innerHTML = books.map(b => `
        <div class="leaderboard-row">
          <span class="name">${b.title}</span>
          <button class="primary use-library-book-btn" data-id="${b.id}" style="padding:6px 14px; font-size:12.5px;">${t('btn_use_this')}</button>
        </div>
      `).join('');
      listEl.querySelectorAll('.use-library-book-btn').forEach(btn => {
        btn.addEventListener('click', () => useLibraryBookForSession(btn.dataset.id));
      });
    }
    show('uploadFromLibrarySection');
    hide('uploadFromDeviceSection');
  } catch (err) {
    // فشل جلب المكتبة؟ ما نكسر التجربة - نرجع لخيار الرفع من الجهاز
    hide('uploadFromLibrarySection');
    show('uploadFromDeviceSection');
  }
}

async function useLibraryBookForSession(bookId) {
  clearError('uploadError');
  try {
    const res = await fetch(`${API_BASE}/api/library/${bookId}`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('err_fetch_book'));

    extractedText = data.extracted_text;
    document.getElementById('extractedText').textContent = extractedText;
    show('step-text');
    if (appMode === 'solo') show('step-chat');
    hide('saveToLibraryBtn'); // موجود بالمكتبة أصلًا، ما يحتاج حفظ من جديد
    document.getElementById('step-text').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showError('uploadError', err.message || t('err_unexpected'));
  }
}

document.getElementById('switchToDeviceUploadBtn').addEventListener('click', () => {
  hide('uploadFromLibrarySection');
  show('uploadFromDeviceSection');
  show('switchToLibraryBtn');
});
document.getElementById('switchToLibraryBtn').addEventListener('click', loadUploadLibraryPicker);

document.getElementById('saveToLibraryBtn').addEventListener('click', async () => {
  const defaultTitle = uploadedFilename ? uploadedFilename.replace(/\.pdf$/i, '') : '';
  const title = prompt(t('save_to_library_prompt'), defaultTitle);
  if (!title || !title.trim()) return;
  try {
    const res = await fetch(`${API_BASE}/api/library`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
      body: JSON.stringify({ title: title.trim(), extracted_text: extractedText }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('err_library_save_failed'));
    alert(t('save_to_library_success'));
  } catch (err) {
    alert(err.message || t('err_library_save_failed'));
  }
});

function renderPerformance(data) {
  const attempts = data.attempts || [];
  const weakTopics = data.weak_topics || [];

  if (!attempts.length) {
    document.getElementById('performanceEmptyState').textContent = t('performance_empty');
    show('performanceEmptyState');
    hide('performanceContent');
    return;
  }
  hide('performanceEmptyState');
  show('performanceContent');

  const pct = a => (a.total ? Math.round((a.score / a.total) * 100) : 0);
  const scores = attempts.map(pct);

  document.getElementById('statAttempts').textContent = attempts.length;
  document.getElementById('statAvg').textContent =
    `${Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)}%`;
  document.getElementById('statBest').textContent = `${Math.max(...scores)}%`;
  document.getElementById('statStudyMinutes').textContent = data.total_study_minutes || 0;

  renderTrendChart(scores);
  renderWeakTopics(weakTopics);
}

function renderTrendChart(scoresIn) {
  const svg = document.getElementById('trendChart');
  const w = svg.clientWidth || 600;
  const h = 120;
  const padding = 18;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';

  const scores = scoresIn.length === 1 ? [scoresIn[0], scoresIn[0]] : scoresIn;
  const stepX = (w - padding * 2) / (scores.length - 1);
  const toY = v => h - padding - (v / 100) * (h - padding * 2);
  const points = scores.map((v, i) => [padding + i * stepX, toY(v)]);

  const svgNS = 'http://www.w3.org/2000/svg';

  const baseline = document.createElementNS(svgNS, 'line');
  baseline.setAttribute('x1', padding); baseline.setAttribute('x2', w - padding);
  baseline.setAttribute('y1', h - padding); baseline.setAttribute('y2', h - padding);
  baseline.setAttribute('stroke', '#E2DFD4'); baseline.setAttribute('stroke-width', '1');
  svg.appendChild(baseline);

  const line = document.createElementNS(svgNS, 'polyline');
  line.setAttribute('points', points.map(p => p.join(',')).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#2E8B77');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);

  points.forEach(([x, y], i) => {
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 4);
    dot.setAttribute('fill', '#2E8B77');
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = t('attempt_label', { n: i + 1, pct: scoresIn[i] });
    dot.appendChild(title);
    svg.appendChild(dot);
  });

  const [lastX, lastY] = points[points.length - 1];
  const label = document.createElementNS(svgNS, 'text');
  label.setAttribute('x', lastX); label.setAttribute('y', Math.max(12, lastY - 10));
  label.setAttribute('text-anchor', 'end');
  label.setAttribute('font-size', '12'); label.setAttribute('fill', '#1B2A4A'); label.setAttribute('font-weight', '700');
  label.textContent = `${scoresIn[scoresIn.length - 1]}%`;
  svg.appendChild(label);
}

function renderWeakTopics(weakTopics) {
  const container = document.getElementById('weakTopicsList');
  if (!weakTopics.length) {
    container.innerHTML = `<p class="desc">${t('weak_topics_empty')}</p>`;
    return;
  }
  const max = Math.max(...weakTopics.map(topic => topic.count));
  container.innerHTML = weakTopics.map(topic => `
    <div class="weak-topic-row">
      <div class="wt-label"><span>${topic.topic}</span><span>${topic.count} ${topic.count === 1 ? t('time_once') : t('time_multiple')}</span></div>
      <div class="wt-bar-bg"><div class="wt-bar-fill" style="width:${(topic.count / max) * 100}%"></div></div>
    </div>
  `).join('');
}

