// ============================================================================
// ---------- المصحف الذكي: قراءة، تلاوة متسلسلة، مدرب حفظ وتسميع صوتي ----------
// ============================================================================
const SMART_QURAN_RECITERS = {
  dosari: 'https://everyayah.com/data/Yasser_Ad-Dussary_128kbps',
  sudais: 'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps',
};

const smartQuranState = {
  chapters: [],
  page: null,
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

function smartQuranAudioUrl(verse) {
  const reciter = smartQuranEl('quranReciterSelect').value;
  return `${SMART_QURAN_RECITERS[reciter]}/${smartQuranPad(verse.surah_id)}${smartQuranPad(verse.id)}.mp3`;
}

function smartQuranVerseKey(verse) { return `${Number(verse.surah_id)}:${Number(verse.id)}`; }

function smartQuranSelectedVerses() {
  if (!smartQuranState.page) return [];
  return smartQuranState.page.ayahs.filter(verse => smartQuranState.selected.has(smartQuranVerseKey(verse)));
}

function smartQuranSetError(targetId, message) {
  if (!message) return clearError(targetId);
  showError(targetId, escapeHtml(message));
}

async function loadSmartQuranChapters() {
  if (smartQuranState.chapters.length) return;
  try {
    const response = await fetch(`${API_BASE}/api/quran/chapters`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_unexpected'));
    smartQuranState.chapters = data.chapters || [];
  } finally { smartQuranRenderSearchResults(''); }
}

function smartQuranClearSelection() {
  smartQuranState.selected.clear();
  document.querySelectorAll('.quran-ayah.selected').forEach(row => row.classList.remove('selected'));
  smartQuranUpdateSelection();
}

async function loadSmartQuranPage(pageNumber) {
  const page = Math.max(1, Math.min(604, Number(pageNumber) || 1));
  const loading = smartQuranEl('quranLoading');
  const versesEl = smartQuranEl('quranVerses');
  smartQuranStopAudio();
  smartQuranStopRecognition(false);
  smartQuranClearSelection();
  smartQuranState.selectedWord = '';
  versesEl.innerHTML = '';
  smartQuranSetError('quranError', '');
  loading.classList.remove('hidden');
  try {
    const response = await fetch(`${API_BASE}/api/quran/pages/${page}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_unexpected'));
    smartQuranState.page = data.page;
    localStorage.setItem('zakiy-quran-page', String(page));
    smartQuranEl('quranPageInput').value = String(page);
    smartQuranEl('quranPrevPageBtn').disabled = page <= 1;
    smartQuranEl('quranNextPageBtn').disabled = page >= 604;
    const surahNames = (data.page.surahs || []).map(surah => surah.name).join(' · ');
    smartQuranEl('quranChapterTitle').textContent = `${t('quran_page_number', { n: page })}${surahNames ? ` — ${surahNames}` : ''}`;
    smartQuranRenderVerses();
  } catch (error) {
    smartQuranState.page = null;
    smartQuranSetError('quranError', error.message || t('err_unexpected'));
  } finally {
    loading.classList.add('hidden');
  }
}

function smartQuranRenderVerses() {
  const versesEl = smartQuranEl('quranVerses');
  const verses = smartQuranState.page?.ayahs || [];
  const content = verses.map(verse => {
    const key = smartQuranVerseKey(verse);
    let heading = '';
    if (Number(verse.id) === 1) {
      heading = `<div class="quran-surah-banner"><span>۞</span><strong>${escapeHtml(verse.surah_name)}</strong><span>۞</span></div>`;
    }
    const words = String(verse.text || '').split(/\s+/).filter(Boolean).map(word =>
      `<span class="quran-word" data-quran-word="${escapeHtml(word)}">${escapeHtml(word)}</span>`
    ).join(' ');
    return `${heading}<span class="quran-ayah" data-verse-key="${key}" tabindex="0" role="button" aria-pressed="false" aria-label="${escapeHtml(t('quran_select_ayah', { n: Number(verse.id) }))}">${words}<span class="quran-verse-number">${Number(verse.id)}</span></span>`;
  }).join('');
  versesEl.innerHTML = `<div class="quran-page-ornament" aria-hidden="true">۞</div><div class="quran-page-text">${content}</div><div class="quran-page-footer"><span>﴿</span><strong>${Number(smartQuranState.page?.number || 1)}</strong><span>﴾</span></div>`;
}

function smartQuranToggleVerse(verseKey, selected) {
  if (selected) smartQuranState.selected.add(verseKey);
  else smartQuranState.selected.delete(verseKey);
  const row = smartQuranEl('quranVerses').querySelector(`[data-verse-key="${verseKey}"]`);
  if (row) {
    row.classList.toggle('selected', selected);
    row.setAttribute('aria-pressed', selected ? 'true' : 'false');
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

function smartQuranHighlightPlaying(verse) {
  document.querySelectorAll('.quran-ayah.playing').forEach(row => row.classList.remove('playing'));
  if (!verse) return;
  const row = smartQuranEl('quranVerses').querySelector(`[data-verse-key="${smartQuranVerseKey(verse)}"]`);
  if (row) {
    row.classList.add('playing');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function smartQuranPlayCurrent() {
  const verse = smartQuranState.audioQueue[smartQuranState.audioIndex];
  if (!verse) return smartQuranStopAudio();
  const audio = smartQuranEl('quranAudio');
  smartQuranHighlightPlaying(verse);
  smartQuranEl('quranReadingStatus').textContent = t('quran_playing_verse', { n: verse.id });
  audio.src = smartQuranAudioUrl(verse);
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
    // الألف الخنجرية في الرسم العثماني تُنطق ألفًا، بينما محرك تحويل
    // الصوت يكتبها ألفًا عادية (مَٰلِك ← مالك، الْعَٰلَمِينَ ← العالمين).
    .replace(/\u0670/g, 'ا')
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, '')
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

function smartQuranTargetWordVariants(word) {
  const withDaggerAlif = smartQuranNormalize(word);
  // بعض الكلمات ذات الألف الخنجرية يكتبها محرك الصوت بدون ألف (الرَّحْمَٰن ←
  // الرحمن)، بينما كلمات أخرى يكتبها بألف (مَٰلِك ← مالك). نقبل الصيغتين
  // بدل اعتبار الألف الخنجرية خطأً إملائيًا على القارئ.
  const withoutDaggerAlif = smartQuranNormalize(String(word || '').replace(/\u0670/g, ''));
  return [...new Set([withDaggerAlif, withoutDaggerAlif].filter(Boolean))];
}

function smartQuranWordsEqual(targetVariants, spokenWord) {
  return Array.isArray(targetVariants)
    ? targetVariants.includes(spokenWord)
    : targetVariants === spokenWord;
}

function smartQuranLcsMatches(target, spoken) {
  const rows = target.length + 1;
  const cols = spoken.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] = smartQuranWordsEqual(target[i - 1], spoken[j - 1])
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const matched = new Set();
  let i = target.length;
  let j = spoken.length;
  while (i > 0 && j > 0) {
    if (smartQuranWordsEqual(target[i - 1], spoken[j - 1])) {
      matched.add(i - 1); i -= 1; j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) i -= 1;
    else j -= 1;
  }
  return matched;
}

function smartQuranEvaluatePractice() {
  const selected = smartQuranSelectedVerses();
  const originalWords = selected.flatMap(verse => String(verse.text || '').split(/\s+/).filter(Boolean));
  const targetWords = originalWords.map(smartQuranTargetWordVariants).filter(variants => variants.length);
  const spokenWords = smartQuranWords(smartQuranState.transcript);
  const result = smartQuranEl('quranPracticeResult');
  if (!spokenWords.length) {
    result.innerHTML = `<div class="error-msg">⚠️ ${escapeHtml(t('quran_practice_no_speech'))}</div>`;
    result.classList.remove('hidden');
    return;
  }
  const matches = smartQuranLcsMatches(targetWords, spokenWords);
  const score = targetWords.length ? Math.round(matches.size / targetWords.length * 100) : 0;
  const errorCount = Math.max(0, targetWords.length + spokenWords.length - (matches.size * 2));
  const shouldCorrect = errorCount > 3;
  const marked = originalWords.map((word, index) =>
    `<span class="${matches.has(index) ? 'quran-word-ok' : 'quran-word-missed'}">${escapeHtml(word)}</span>`
  ).join(' ');
  result.innerHTML = `<div class="quran-practice-score"><strong>${score}٪</strong><span>${escapeHtml(t('quran_practice_result', { score }))}</span></div>
    ${shouldCorrect ? `<div class="quran-verse-text" lang="ar" dir="rtl">${marked}</div><p class="desc">${escapeHtml(t('quran_practice_missing'))}</p>` : `<p class="quran-practice-tolerated">${escapeHtml(t('quran_practice_tolerated', { count: errorCount }))}</p>`}`;
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
      chapter_name: (smartQuranState.page?.surahs || []).map(surah => surah.name).join('، '),
      verses: smartQuranSelectedVerses().map(verse => ({ id: `${verse.surah_id}:${verse.id}`, text: verse.text })),
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

function smartQuranSearchText(value) {
  return smartQuranNormalize(value).replace(/^سوره\s*/, '').toLowerCase();
}

function smartQuranRenderSearchResults(query) {
  const results = smartQuranEl('quranSurahResults');
  if (!results) return;
  const term = smartQuranSearchText(query);
  const matches = smartQuranState.chapters.filter(chapter => {
    if (!term) return Number(chapter.id) <= 8;
    const haystack = `${smartQuranSearchText(chapter.name)} ${String(chapter.transliteration || '').toLowerCase()} ${Number(chapter.id)}`;
    return haystack.includes(term);
  }).slice(0, 10);
  results.innerHTML = matches.length ? matches.map(chapter =>
    `<button type="button" data-quran-chapter="${Number(chapter.id)}"><span>${escapeHtml(chapter.name)}</span><small>${Number(chapter.id)} · ${escapeHtml(chapter.transliteration || '')}</small></button>`
  ).join('') : `<div class="quran-search-empty">${escapeHtml(t('quran_search_empty'))}</div>`;
}

async function smartQuranOpenChapter(chapterId) {
  smartQuranSetError('quranError', '');
  try {
    const response = await fetch(`${API_BASE}/api/quran/chapters/${Number(chapterId)}/start-page`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_unexpected'));
    const chapter = smartQuranState.chapters.find(item => Number(item.id) === Number(chapterId));
    smartQuranEl('quranSurahSearch').value = chapter?.name || '';
    smartQuranEl('quranSurahResults').classList.add('hidden');
    await loadSmartQuranPage(data.page);
  } catch (error) {
    smartQuranSetError('quranError', error.message || t('err_unexpected'));
  }
}

function smartQuranGoToPage(value) {
  const page = Math.max(1, Math.min(604, Number(value) || 1));
  return loadSmartQuranPage(page);
}

async function loadSmartQuranScreen() {
  smartQuranSetError('quranError', '');
  try {
    await loadSmartQuranChapters();
    const page = Number(localStorage.getItem('zakiy-quran-page')) || 1;
    if (!smartQuranState.page || Number(smartQuranState.page.number) !== page) {
      await loadSmartQuranPage(page);
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
  const searchInput = smartQuranEl('quranSurahSearch');
  searchInput.addEventListener('focus', () => {
    smartQuranRenderSearchResults(searchInput.value);
    smartQuranEl('quranSurahResults').classList.remove('hidden');
  });
  searchInput.addEventListener('input', () => {
    smartQuranRenderSearchResults(searchInput.value);
    smartQuranEl('quranSurahResults').classList.remove('hidden');
  });
  smartQuranEl('quranSurahResults').addEventListener('click', event => {
    const button = event.target.closest('[data-quran-chapter]');
    if (button) smartQuranOpenChapter(button.dataset.quranChapter);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.quran-surah-search')) smartQuranEl('quranSurahResults').classList.add('hidden');
  });
  smartQuranEl('quranPrevPageBtn').addEventListener('click', () => smartQuranGoToPage((smartQuranState.page?.number || 1) - 1));
  smartQuranEl('quranNextPageBtn').addEventListener('click', () => smartQuranGoToPage((smartQuranState.page?.number || 1) + 1));
  smartQuranEl('quranPageInput').addEventListener('change', event => smartQuranGoToPage(event.target.value));
  smartQuranEl('quranPageInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); smartQuranGoToPage(event.target.value); }
  });
  smartQuranEl('quranReciterSelect').addEventListener('change', event => localStorage.setItem('zakiy-quran-reciter', event.target.value));
  smartQuranEl('quranRepeatSelect').addEventListener('change', event => localStorage.setItem('zakiy-quran-repeat', event.target.value));
  smartQuranEl('quranReciterSelect').value = localStorage.getItem('zakiy-quran-reciter') || 'dosari';
  smartQuranEl('quranRepeatSelect').value = localStorage.getItem('zakiy-quran-repeat') || '1';
  smartQuranEl('quranVerses').addEventListener('dblclick', event => {
    const word = event.target.closest('[data-quran-word]');
    if (word) { event.preventDefault(); event.stopPropagation(); smartQuranSelectWord(word.dataset.quranWord, word); }
  });
  smartQuranEl('quranVerses').addEventListener('click', event => {
    const row = event.target.closest('[data-verse-key]');
    if (!row) return;
    smartQuranToggleVerse(row.dataset.verseKey, !smartQuranState.selected.has(row.dataset.verseKey));
  });
  smartQuranEl('quranVerses').addEventListener('keydown', event => {
    const row = event.target.closest('[data-verse-key]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      smartQuranToggleVerse(row.dataset.verseKey, !smartQuranState.selected.has(row.dataset.verseKey));
    }
  });
  smartQuranEl('quranPlaySelectedBtn').addEventListener('click', smartQuranPlaySelected);
  smartQuranEl('quranStopAudioBtn').addEventListener('click', smartQuranStopAudio);
  smartQuranEl('quranStartPracticeBtn').addEventListener('click', smartQuranOpenPractice);
  smartQuranEl('quranClearSelectionBtn').addEventListener('click', () => {
    smartQuranClearSelection();
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
