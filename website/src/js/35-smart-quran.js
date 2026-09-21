// ============================================================================
// ---------- المصحف الذكي: قراءة، تلاوة متسلسلة، مدرب حفظ وتسميع صوتي ----------
// ============================================================================
const SMART_QURAN_RECITERS = {
  dosari: 'https://everyayah.com/data/Yasser_Ad-Dussary_128kbps',
  sudais: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps',
};

const smartQuranState = {
  chapters: [],
  chapter: null,
  selected: new Set(),
  selectedWord: '',
  audioQueue: [],
  audioIndex: 0,
  repeatIndex: 0,
  recognition: null,
  recording: false,
  transcript: '',
  bound: false,
};

function smartQuranEl(id) { return document.getElementById(id); }
function smartQuranPad(value) { return String(value).padStart(3, '0'); }

function smartQuranAudioUrl(chapterId, verseId) {
  const reciter = smartQuranEl('quranReciterSelect').value;
  return `${SMART_QURAN_RECITERS[reciter]}/${smartQuranPad(chapterId)}${smartQuranPad(verseId)}.mp3`;
}

function smartQuranSelectedVerses() {
  if (!smartQuranState.chapter) return [];
  return smartQuranState.chapter.verses
    .filter(verse => smartQuranState.selected.has(Number(verse.id)))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function smartQuranSetError(targetId, message) {
  if (!message) return clearError(targetId);
  showError(targetId, escapeHtml(message));
}

async function loadSmartQuranChapters() {
  if (smartQuranState.chapters.length) return;
  const select = smartQuranEl('quranChapterSelect');
  select.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/quran/chapters`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_unexpected'));
    smartQuranState.chapters = data.chapters || [];
    select.innerHTML = smartQuranState.chapters.map(chapter =>
      `<option value="${Number(chapter.id)}">${Number(chapter.id)}. ${escapeHtml(chapter.name)} — ${escapeHtml(chapter.transliteration || '')}</option>`
    ).join('');
    const saved = Number(localStorage.getItem('zakiy-quran-chapter')) || 1;
    if (smartQuranState.chapters.some(chapter => Number(chapter.id) === saved)) select.value = String(saved);
  } finally {
    select.disabled = false;
  }
}

async function loadSmartQuranChapter(chapterId) {
  const loading = smartQuranEl('quranLoading');
  const versesEl = smartQuranEl('quranVerses');
  smartQuranStopAudio();
  smartQuranStopRecognition(false);
  smartQuranState.selected.clear();
  smartQuranState.selectedWord = '';
  smartQuranUpdateSelection();
  versesEl.innerHTML = '';
  smartQuranSetError('quranError', '');
  loading.classList.remove('hidden');
  try {
    const response = await fetch(`${API_BASE}/api/quran/chapters/${Number(chapterId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_unexpected'));
    smartQuranState.chapter = data.chapter;
    localStorage.setItem('zakiy-quran-chapter', String(chapterId));
    smartQuranEl('quranChapterTitle').textContent = `${data.chapter.name} — ${data.chapter.transliteration || ''}`;
    smartQuranRenderVerses();
  } catch (error) {
    smartQuranState.chapter = null;
    smartQuranSetError('quranError', error.message || t('err_unexpected'));
  } finally {
    loading.classList.add('hidden');
  }
}

function smartQuranRenderVerses() {
  const versesEl = smartQuranEl('quranVerses');
  const verses = smartQuranState.chapter?.verses || [];
  versesEl.innerHTML = verses.map(verse => {
    const words = String(verse.text || '').split(/\s+/).filter(Boolean).map(word =>
      `<span class="quran-word" data-quran-word="${escapeHtml(word)}">${escapeHtml(word)}</span>`
    ).join(' ');
    return `<article class="quran-verse" data-verse-id="${Number(verse.id)}">
      <input class="quran-verse-check" type="checkbox" aria-label="${escapeHtml(t('quran_selected_count'))} ${Number(verse.id)}">
      <div class="quran-verse-text" lang="ar" dir="rtl">${words}</div>
      <span class="quran-verse-number">${Number(verse.id)}</span>
    </article>`;
  }).join('');
}

function smartQuranToggleVerse(verseId, selected) {
  const id = Number(verseId);
  if (selected) smartQuranState.selected.add(id);
  else smartQuranState.selected.delete(id);
  const row = smartQuranEl('quranVerses').querySelector(`[data-verse-id="${id}"]`);
  if (row) {
    row.classList.toggle('selected', selected);
    row.querySelector('.quran-verse-check').checked = selected;
  }
  smartQuranUpdateSelection();
}

function smartQuranUpdateSelection() {
  smartQuranEl('quranSelectionCount').textContent = String(smartQuranState.selected.size);
  if (!smartQuranState.selected.size) smartQuranEl('quranPracticePanel').classList.add('hidden');
}

function smartQuranSelectWord(word, element) {
  smartQuranState.selectedWord = word;
  document.querySelectorAll('.quran-word.active').forEach(item => item.classList.remove('active'));
  element.classList.add('active');
  const chip = smartQuranEl('quranSelectedWord');
  chip.textContent = t('quran_selected_word', { word });
  chip.classList.remove('hidden');
  smartQuranEl('quranCoachInput').value = currentLang === 'ar'
    ? `كيف أنطق كلمة «${word}»؟ قسّمها لي كما هي مكتوبة بالحركات.`
    : `How do I pronounce “${word}”? Split it into readable parts using the shown marks.`;
  smartQuranEl('quranCoachInput').focus();
}

function smartQuranHighlightPlaying(verseId) {
  document.querySelectorAll('.quran-verse.playing').forEach(row => row.classList.remove('playing'));
  if (!verseId) return;
  const row = smartQuranEl('quranVerses').querySelector(`[data-verse-id="${Number(verseId)}"]`);
  if (row) {
    row.classList.add('playing');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function smartQuranPlayCurrent() {
  const verse = smartQuranState.audioQueue[smartQuranState.audioIndex];
  if (!verse || !smartQuranState.chapter) return smartQuranStopAudio();
  const audio = smartQuranEl('quranAudio');
  smartQuranHighlightPlaying(verse.id);
  smartQuranEl('quranReadingStatus').textContent = t('quran_playing_verse', { n: verse.id });
  audio.src = smartQuranAudioUrl(smartQuranState.chapter.id, verse.id);
  audio.play().catch(error => {
    smartQuranSetError('quranError', error.message || t('err_unexpected'));
    smartQuranStopAudio();
  });
}

function smartQuranPlaySelected() {
  const verses = smartQuranSelectedVerses();
  if (!verses.length) return smartQuranSetError('quranError', t('quran_select_first'));
  smartQuranSetError('quranError', '');
  smartQuranStopAudio();
  smartQuranState.audioQueue = verses;
  smartQuranState.audioIndex = 0;
  smartQuranState.repeatIndex = 0;
  smartQuranPlayCurrent();
}

function smartQuranAdvanceAudio() {
  const repeats = Number(smartQuranEl('quranRepeatSelect').value) || 1;
  if (smartQuranState.repeatIndex + 1 < repeats) {
    smartQuranState.repeatIndex += 1;
    return smartQuranPlayCurrent();
  }
  smartQuranState.repeatIndex = 0;
  smartQuranState.audioIndex += 1;
  if (smartQuranState.audioIndex >= smartQuranState.audioQueue.length) return smartQuranStopAudio();
  smartQuranPlayCurrent();
}

function smartQuranStopAudio() {
  const audio = smartQuranEl('quranAudio');
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  smartQuranState.audioQueue = [];
  smartQuranState.audioIndex = 0;
  smartQuranState.repeatIndex = 0;
  smartQuranHighlightPlaying(null);
  const status = smartQuranEl('quranReadingStatus');
  if (status) status.textContent = '';
}

function smartQuranNormalize(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function smartQuranWords(text) {
  return smartQuranNormalize(text).split(' ').filter(Boolean);
}

function smartQuranLcsMatches(target, spoken) {
  const rows = target.length + 1;
  const cols = spoken.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] = target[i - 1] === spoken[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const matched = new Set();
  let i = target.length;
  let j = spoken.length;
  while (i > 0 && j > 0) {
    if (target[i - 1] === spoken[j - 1]) {
      matched.add(i - 1); i -= 1; j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) i -= 1;
    else j -= 1;
  }
  return matched;
}

function smartQuranEvaluatePractice() {
  const selected = smartQuranSelectedVerses();
  const originalWords = selected.flatMap(verse => String(verse.text || '').split(/\s+/).filter(Boolean));
  const targetWords = originalWords.map(smartQuranNormalize).filter(Boolean);
  const spokenWords = smartQuranWords(smartQuranState.transcript);
  const result = smartQuranEl('quranPracticeResult');
  if (!spokenWords.length) {
    result.innerHTML = `<div class="error-msg">⚠️ ${escapeHtml(t('quran_practice_no_speech'))}</div>`;
    result.classList.remove('hidden');
    return;
  }
  const matches = smartQuranLcsMatches(targetWords, spokenWords);
  const score = targetWords.length ? Math.round(matches.size / targetWords.length * 100) : 0;
  const marked = originalWords.map((word, index) =>
    `<span class="${matches.has(index) ? 'quran-word-ok' : 'quran-word-missed'}">${escapeHtml(word)}</span>`
  ).join(' ');
  result.innerHTML = `<div class="quran-practice-score"><strong>${score}٪</strong><span>${escapeHtml(t('quran_practice_result', { score }))}</span></div>
    <div class="quran-verse-text" lang="ar" dir="rtl">${marked}</div>
    ${score < 100 ? `<p class="desc">${escapeHtml(t('quran_practice_missing'))}</p>` : ''}`;
  result.classList.remove('hidden');
}

function smartQuranStopRecognition(evaluate = true) {
  if (smartQuranState.recognition && smartQuranState.recording) {
    smartQuranState.recording = false;
    try { smartQuranState.recognition.stop(); } catch (_) { /* انتهى تلقائيًا */ }
  }
  const button = smartQuranEl('quranRecordBtn');
  if (button) {
    button.classList.remove('recording');
    button.textContent = t('quran_record_start');
  }
  if (evaluate && smartQuranState.transcript) smartQuranEvaluatePractice();
}

function smartQuranStartRecognition() {
  if (!smartQuranState.selected.size) return smartQuranSetError('quranError', t('quran_select_first'));
  if (smartQuranState.recording) return smartQuranStopRecognition(true);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    smartQuranEl('quranPracticeLive').textContent = t('quran_voice_unsupported');
    return;
  }
  const recognition = new Recognition();
  smartQuranState.recognition = recognition;
  smartQuranState.transcript = '';
  recognition.lang = 'ar-SA';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = event => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const value = event.results[index][0].transcript;
      if (event.results[index].isFinal) smartQuranState.transcript += ` ${value}`;
      else interim += value;
    }
    smartQuranEl('quranPracticeLive').textContent = `${smartQuranState.transcript} ${interim}`.trim() || t('quran_practice_listening');
  };
  recognition.onerror = event => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      smartQuranEl('quranPracticeLive').textContent = event.message || t('quran_practice_no_speech');
    }
  };
  recognition.onend = () => {
    const shouldEvaluate = smartQuranState.recording;
    smartQuranState.recording = false;
    const button = smartQuranEl('quranRecordBtn');
    button.classList.remove('recording');
    button.textContent = t('quran_record_start');
    if (shouldEvaluate) smartQuranEvaluatePractice();
  };
  smartQuranState.recording = true;
  smartQuranEl('quranPracticeResult').classList.add('hidden');
  smartQuranEl('quranPracticeLive').textContent = t('quran_practice_listening');
  const button = smartQuranEl('quranRecordBtn');
  button.classList.add('recording');
  button.textContent = t('quran_record_stop');
  recognition.start();
}

function smartQuranOpenPractice() {
  if (!smartQuranState.selected.size) return smartQuranSetError('quranError', t('quran_select_first'));
  smartQuranSetError('quranError', '');
  smartQuranEl('quranPracticePanel').classList.remove('hidden');
  smartQuranEl('quranPracticePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function smartQuranAddCoachBubble(kind, text, extraClass = '') {
  const bubble = document.createElement('div');
  bubble.className = `quran-coach-bubble ${kind} ${extraClass}`.trim();
  bubble.textContent = text;
  smartQuranEl('quranCoachMessages').appendChild(bubble);
  smartQuranEl('quranCoachMessages').scrollTop = smartQuranEl('quranCoachMessages').scrollHeight;
  return bubble;
}

async function smartQuranAskCoach(questionOverride) {
  if (!requireAuthOrPrompt()) return;
  const input = smartQuranEl('quranCoachInput');
  const question = String(questionOverride || input.value || '').trim();
  if (!question) return;
  smartQuranSetError('quranCoachError', '');
  smartQuranAddCoachBubble('user', question);
  input.value = '';
  const thinking = smartQuranAddCoachBubble('ai', currentLang === 'ar' ? 'أفكر في طريقة مناسبة…' : 'Thinking of a helpful approach…', 'thinking');
  const button = smartQuranEl('quranCoachSendBtn');
  button.disabled = true;
  try {
    const data = await apiCall('POST', '/api/quran/coach', {
      question,
      chapter_name: smartQuranState.chapter?.name || '',
      verses: smartQuranSelectedVerses().map(verse => ({ id: Number(verse.id), text: verse.text })),
    });
    thinking.textContent = data.reply || t('err_unexpected');
    thinking.classList.remove('thinking');
  } catch (error) {
    thinking.remove();
    smartQuranSetError('quranCoachError', error.message || t('err_unexpected'));
  } finally {
    button.disabled = false;
  }
}

function smartQuranQuickPrompt(kind) {
  if (!smartQuranState.selected.size) return smartQuranSetError('quranCoachError', t('quran_select_first'));
  const key = { plan: 'quran_plan_question', split: 'quran_split_question', quiz: 'quran_quiz_question' }[kind];
  smartQuranAskCoach(t(key));
}

async function loadSmartQuranScreen() {
  smartQuranSetError('quranError', '');
  try {
    await loadSmartQuranChapters();
    const selectedId = Number(smartQuranEl('quranChapterSelect').value) || 1;
    if (!smartQuranState.chapter || Number(smartQuranState.chapter.id) !== selectedId) {
      await loadSmartQuranChapter(selectedId);
    }
  } catch (error) {
    smartQuranEl('quranLoading').classList.add('hidden');
    smartQuranSetError('quranError', error.message || t('err_unexpected'));
  }
}

function smartQuranInit() {
  if (smartQuranState.bound || !smartQuranEl('smartQuranBtn') || !smartQuranEl('step-smart-quran')) return;
  smartQuranState.bound = true;
  smartQuranEl('smartQuranBtn').addEventListener('click', () => {
    pushNavSnapshot();
    showAccountScreen('step-smart-quran');
    updateGlobalBackButton();
    loadSmartQuranScreen();
  });
  smartQuranEl('quranChapterSelect').addEventListener('change', event => loadSmartQuranChapter(event.target.value));
  smartQuranEl('quranReciterSelect').addEventListener('change', event => localStorage.setItem('zakiy-quran-reciter', event.target.value));
  smartQuranEl('quranRepeatSelect').addEventListener('change', event => localStorage.setItem('zakiy-quran-repeat', event.target.value));
  smartQuranEl('quranReciterSelect').value = localStorage.getItem('zakiy-quran-reciter') || 'dosari';
  smartQuranEl('quranRepeatSelect').value = localStorage.getItem('zakiy-quran-repeat') || '1';
  smartQuranEl('quranVerses').addEventListener('click', event => {
    const word = event.target.closest('[data-quran-word]');
    if (word) {
      event.stopPropagation();
      return smartQuranSelectWord(word.dataset.quranWord, word);
    }
    const row = event.target.closest('[data-verse-id]');
    if (!row) return;
    smartQuranToggleVerse(row.dataset.verseId, !smartQuranState.selected.has(Number(row.dataset.verseId)));
  });
  smartQuranEl('quranPlaySelectedBtn').addEventListener('click', smartQuranPlaySelected);
  smartQuranEl('quranStopAudioBtn').addEventListener('click', smartQuranStopAudio);
  smartQuranEl('quranStartPracticeBtn').addEventListener('click', smartQuranOpenPractice);
  smartQuranEl('quranClearSelectionBtn').addEventListener('click', () => {
    smartQuranState.selected.clear();
    document.querySelectorAll('.quran-verse.selected').forEach(row => {
      row.classList.remove('selected');
      row.querySelector('.quran-verse-check').checked = false;
    });
    smartQuranUpdateSelection();
  });
  smartQuranEl('quranRecordBtn').addEventListener('click', smartQuranStartRecognition);
  smartQuranEl('quranAudio').addEventListener('ended', smartQuranAdvanceAudio);
  smartQuranEl('quranAudio').addEventListener('error', () => {
    if (smartQuranEl('quranAudio').getAttribute('src')) smartQuranSetError('quranError', currentLang === 'ar' ? 'تعذّر تشغيل التلاوة، حاول مرة أخرى.' : 'The recitation could not be played. Try again.');
  });
  smartQuranEl('quranCoachSendBtn').addEventListener('click', () => smartQuranAskCoach());
  smartQuranEl('quranCoachInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); smartQuranAskCoach(); }
  });
  document.querySelectorAll('[data-quran-prompt]').forEach(button => button.addEventListener('click', () => smartQuranQuickPrompt(button.dataset.quranPrompt)));

  const observer = new MutationObserver(() => {
    if (smartQuranEl('step-smart-quran').classList.contains('hidden')) {
      smartQuranStopAudio();
      smartQuranStopRecognition(false);
    }
  });
  observer.observe(smartQuranEl('step-smart-quran'), { attributes: true, attributeFilter: ['class'] });
}

smartQuranInit();
