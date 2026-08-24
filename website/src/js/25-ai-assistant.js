// ============================================================================
// ---------- المساعد الذكي (محادثات محفوظة + تلخيص كتب) ----------
// ============================================================================
let aiConversationsCache = [];
let currentAiConversationId = null;

document.getElementById('sidebarAiHelpBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  pushNavSnapshot();
  showAiListScreen();
  updateGlobalBackButton();
});

async function loadAiConversationsList() {
  const list = document.getElementById('aiConversationsList');
  list.innerHTML = '';
  try {
    const { conversations } = await apiCall('GET', '/api/ai/conversations');
    aiConversationsCache = conversations;
    renderAiConversationsList();
  } catch (e) {
    list.innerHTML = `<div class="error-msg">⚠️ ${escapeHtml(e.message)}</div>`;
  }
}

function renderAiConversationsList() {
  const list = document.getElementById('aiConversationsList');
  document.getElementById('aiConversationsEmpty').classList.toggle('hidden', aiConversationsCache.length > 0);
  list.innerHTML = aiConversationsCache.map(c => {
    const hasTitle = c.title && c.title.trim();
    const title = hasTitle ? escapeHtml(c.title) : t('ai_new_chat_title');
    const dateStr = new Date(c.updated_at).toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US');
    const bookTag = c.book_title ? `<div class="ai-list-meta">📚 ${escapeHtml(c.book_title)}</div>` : '';
    return `
      <div class="ai-list-card" data-conversation-id="${c.id}">
        <div class="ai-list-icon">🤖</div>
        <div style="flex:1; min-width:0;">
          <div class="ai-list-title ${hasTitle ? '' : 'untitled'}">${title}</div>
          <div class="ai-list-meta">${dateStr}</div>
          ${bookTag}
        </div>
      </div>
    `;
  }).join('');
  list.querySelectorAll('.ai-list-card').forEach(card => {
    card.addEventListener('click', () => {
      pushNavSnapshot();
      openAiConversation(card.dataset.conversationId);
      updateGlobalBackButton();
    });
  });
}

document.getElementById('aiNewConversationBtn').addEventListener('click', async () => {
  try {
    const convo = await apiCall('POST', '/api/ai/conversations', {});
    pushNavSnapshot();
    openAiConversation(convo.id, convo);
    updateGlobalBackButton();
  } catch (e) {
    alert(e.message);
  }
});

// زر الرجوع لقائمة المحادثات (⋮ فوق يسار المحادثة نفسها)
document.getElementById('aiChatBackBtn').addEventListener('click', () => {
  document.getElementById('globalBackBtn').click();
});

async function openAiConversation(id, prefetched) {
  showAccountScreen('step-ai-conversation');
  currentAiConversationId = id;
  document.getElementById('aiConversationMessages').innerHTML = '';
  document.getElementById('aiConversationInput').value = '';
  document.getElementById('aiChatTitle').textContent = t('ai_new_chat_title');
  clearError('aiChatError2');
  try {
    const convo = (prefetched && prefetched.messages) ? prefetched : await apiCall('GET', `/api/ai/conversations/${id}`);
    document.getElementById('aiChatTitle').textContent = (convo.title && convo.title.trim()) ? convo.title : t('ai_new_chat_title');
    (convo.messages || []).forEach(m => appendAiBubble(m.role, m.content));
    scrollAiMessagesToBottom();
  } catch (e) {
    showError('aiChatError2', e.message);
  }
  document.getElementById('aiConversationInput').focus();
}

function appendAiBubble(role, text) {
  const container = document.getElementById('aiConversationMessages');
  const row = document.createElement('div');
  row.className = `ai-bubble-row ${role === 'user' ? 'user' : 'assistant'}`;
  const avatar = document.createElement('div');
  avatar.className = 'ai-bubble-avatar';
  avatar.textContent = role === 'user' ? '🙂' : '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'ai-bubble';
  bubble.textContent = text;
  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  return row;
}

function scrollAiMessagesToBottom() {
  const container = document.getElementById('aiConversationMessages');
  container.scrollTop = container.scrollHeight;
}

function showAiTypingIndicator() {
  const container = document.getElementById('aiConversationMessages');
  const row = document.createElement('div');
  row.className = 'ai-bubble-row assistant';
  row.id = 'aiTypingRow';
  row.innerHTML = `<div class="ai-bubble-avatar">🤖</div><div class="ai-bubble"><span class="ai-typing-dots"><span></span><span></span><span></span></span></div>`;
  container.appendChild(row);
  scrollAiMessagesToBottom();
}
function removeAiTypingIndicator() {
  const row = document.getElementById('aiTypingRow');
  if (row) row.remove();
}

async function sendAiPayload(payload, userBubbleText) {
  clearError('aiChatError2');
  appendAiBubble('user', userBubbleText);
  scrollAiMessagesToBottom();
  showAiTypingIndicator();
  try {
    const body = Object.assign({ lang: currentLang }, payload);
    const data = await apiCall('POST', `/api/ai/conversations/${currentAiConversationId}/messages`, body);
    removeAiTypingIndicator();
    appendAiBubble('assistant', data.reply);
    scrollAiMessagesToBottom();
    if (data.title) document.getElementById('aiChatTitle').textContent = data.title;
  } catch (e) {
    removeAiTypingIndicator();
    showError('aiChatError2', e.message);
  }
}

document.getElementById('aiConversationSendBtn').addEventListener('click', () => {
  const input = document.getElementById('aiConversationInput');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  sendAiPayload({ content }, content);
});
document.getElementById('aiConversationInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('aiConversationSendBtn').click();
});

// ---------- زر تلخيص كتاب (جمب مكان كتابة الرسالة) ----------
document.getElementById('aiBookBtn').addEventListener('click', () => {
  pushNavSnapshot();
  showAiBookPickerScreen();
  updateGlobalBackButton();
});

function showAiBookPickerScreen() {
  showAccountScreen('step-ai-book-picker');
  clearError('aiBookPickerError');
  document.querySelectorAll('.ai-book-source-btn').forEach(b => b.classList.toggle('active', b.dataset.source === 'library'));
  show('aiBookLibrarySource');
  hide('aiBookUploadSource');
  aiBookSelectedFile = null;
  document.getElementById('aiBookFileInput').value = '';
  updateAiBookFileChip();
  loadAiBookLibraryList();
}

document.querySelectorAll('.ai-book-source-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ai-book-source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isLibrary = btn.dataset.source === 'library';
    document.getElementById('aiBookLibrarySource').classList.toggle('hidden', !isLibrary);
    document.getElementById('aiBookUploadSource').classList.toggle('hidden', isLibrary);
  });
});

async function loadAiBookLibraryList() {
  const list = document.getElementById('aiBookLibraryList');
  try {
    const books = await fetchLibraryBooks();
    document.getElementById('aiBookLibraryEmpty').classList.toggle('hidden', books.length > 0);
    list.innerHTML = books.map(b => `
      <div class="ai-list-card" data-book-id="${b.id}">
        <div class="ai-list-icon">📘</div>
        <div style="flex:1; min-width:0;">
          <div class="ai-list-title">${escapeHtml(b.title)}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-book-id]').forEach(card => {
      card.addEventListener('click', () => pickLibraryBookForAiSummary(card.dataset.bookId));
    });
  } catch (e) {
    showError('aiBookPickerError', e.message);
  }
}

async function pickLibraryBookForAiSummary(bookId) {
  clearError('aiBookPickerError');
  try {
    const book = await apiCall('GET', `/api/library/${bookId}`);
    pushNavSnapshot();
    openAiBookScopeScreen(book.title, book.extracted_text);
    updateGlobalBackButton();
  } catch (e) {
    showError('aiBookPickerError', e.message);
  }
}

// ---------- اختيار نطاق التلخيص (الكتاب كامل أو جزء منه) قبل الإرسال ----------
let aiBookScopeBookTitle = '';

function openAiBookScopeScreen(bookTitle, fullText) {
  showAccountScreen('step-ai-book-scope');
  clearError('aiBookScopeError');
  aiBookScopeBookTitle = bookTitle;
  document.getElementById('aiBookScopeTitle').textContent = bookTitle;
  document.getElementById('aiBookScopeText').value = fullText;
}

document.getElementById('aiBookScopeSummarizeBtn').addEventListener('click', async () => {
  const text = document.getElementById('aiBookScopeText').value.trim();
  clearError('aiBookScopeError');
  if (!text) { showError('aiBookScopeError', t('err_text_required')); return; }
  const title = aiBookScopeBookTitle;
  // نرجع خطوتين (صفحة اختيار النطاق ← صفحة اختيار الكتاب ← المحادثة) قبل
  // ما نرسل، عشان المستخدم يشوف الرد يتكون بصفحة المحادثة نفسها
  document.getElementById('globalBackBtn').click();
  document.getElementById('globalBackBtn').click();
  await sendAiPayload(
    { book_title: title, book_text: text },
    `📚 ${t('ai_summarize_label')}: ${title}`
  );
});

// ---------- رفع ملف جديد للتلخيص ----------
let aiBookSelectedFile = null;
const aiBookDropzone = document.getElementById('aiBookDropzone');
const aiBookFileInput = document.getElementById('aiBookFileInput');
aiBookDropzone.addEventListener('click', () => aiBookFileInput.click());
aiBookDropzone.addEventListener('dragover', (e) => { e.preventDefault(); aiBookDropzone.classList.add('drag'); });
aiBookDropzone.addEventListener('dragleave', () => aiBookDropzone.classList.remove('drag'));
aiBookDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  aiBookDropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) setAiBookFile(e.dataTransfer.files[0]);
});
aiBookFileInput.addEventListener('change', () => {
  if (aiBookFileInput.files.length) setAiBookFile(aiBookFileInput.files[0]);
});
function setAiBookFile(file) {
  if (file.type !== 'application/pdf') {
    showError('aiBookPickerError', t('err_must_be_pdf'));
    return;
  }
  aiBookSelectedFile = file;
  clearError('aiBookPickerError');
  updateAiBookFileChip();
}
function updateAiBookFileChip() {
  const chip = document.getElementById('aiBookFileChip');
  chip.classList.toggle('show', !!aiBookSelectedFile);
  document.getElementById('aiBookFileName').textContent = aiBookSelectedFile ? aiBookSelectedFile.name : '';
  document.getElementById('aiBookSummarizeUploadBtn').disabled = !aiBookSelectedFile;
}
document.getElementById('aiBookRemoveFile').addEventListener('click', () => {
  aiBookSelectedFile = null;
  aiBookFileInput.value = '';
  updateAiBookFileChip();
});

document.getElementById('aiBookSummarizeUploadBtn').addEventListener('click', async () => {
  if (!aiBookSelectedFile) return;
  clearError('aiBookPickerError');
  const btn = document.getElementById('aiBookSummarizeUploadBtn');
  const btnLabel = t('ai_summarize_btn');
  setLoading(btn, true, btnLabel);
  try {
    const formData = new FormData();
    formData.append('file', aiBookSelectedFile);
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

    const bookTitle = aiBookSelectedFile.name.replace(/\.pdf$/i, '');
    aiBookSelectedFile = null;
    aiBookFileInput.value = '';
    updateAiBookFileChip();
    pushNavSnapshot();
    openAiBookScopeScreen(bookTitle, extractData.text);
    updateGlobalBackButton();
  } catch (e) {
    showError('aiBookPickerError', e.message);
  } finally {
    setLoading(btn, false, btnLabel);
  }
});
