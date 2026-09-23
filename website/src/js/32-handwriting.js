// ---------- التعرّف على خط اليد (المحادثة / المذاكرة الفردية / السبورة) ----------
let handwritingDestination = 'chat';
let handwritingOriginalName = '';
const handwritingOverlay = document.getElementById('handwritingOverlay');
const handwritingInput = document.getElementById('handwritingFileInput');

function openHandwritingRecognizer(destination) {
  if (!requireAuthOrPrompt()) return;
  handwritingDestination = destination;
  handwritingOriginalName = '';
  handwritingInput.value = '';
  document.getElementById('handwritingResult').value = '';
  hide('handwritingFileRow');
  hide('handwritingProgress');
  hide('handwritingResultWrap');
  clearError('handwritingError');
  document.getElementById('handwritingUseBtn').disabled = true;
  document.getElementById('handwritingCopyBtn').disabled = true;
  handwritingOverlay.classList.remove('hidden');
}

function closeHandwritingRecognizer() {
  handwritingOverlay.classList.add('hidden');
}

document.getElementById('handwritingCloseBtn').addEventListener('click', closeHandwritingRecognizer);
handwritingOverlay.addEventListener('click', e => { if (e.target === handwritingOverlay) closeHandwritingRecognizer(); });
document.getElementById('handwritingChangeFileBtn').addEventListener('click', () => handwritingInput.click());
document.getElementById('aiHandwritingBtn').addEventListener('click', () => openHandwritingRecognizer('chat'));
document.getElementById('soloHandwritingBtn').addEventListener('click', () => openHandwritingRecognizer('solo'));
document.getElementById('sidebarHandwritingBtn').addEventListener('click', () => openHandwritingRecognizer('standalone'));
document.getElementById('classroomHandwritingBtn').addEventListener('click', () => openHandwritingRecognizer('board'));

handwritingInput.addEventListener('change', async () => {
  const file = handwritingInput.files && handwritingInput.files[0];
  if (!file) return;
  handwritingOriginalName = file.name;
  document.getElementById('handwritingFileName').textContent = file.name;
  show('handwritingFileRow');
  show('handwritingProgress');
  hide('handwritingResultWrap');
  clearError('handwritingError');
  document.getElementById('handwritingUseBtn').disabled = true;
  document.getElementById('handwritingCopyBtn').disabled = true;
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('lang', currentLang);
    form.append('context', ['solo', 'standalone'].includes(handwritingDestination) ? 'solo' : handwritingDestination);
    const res = await fetch(`${API_BASE}/api/handwriting/recognize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentAccessToken}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 402) offerTrialAtPaywall();
      throw new Error(data.error || t('handwriting_failed'));
    }
    document.getElementById('handwritingResult').value = data.text;
    show('handwritingResultWrap');
    document.getElementById('handwritingUseBtn').disabled = !data.text.trim();
    document.getElementById('handwritingCopyBtn').disabled = !data.text.trim();
  } catch (error) {
    showError('handwritingError', error.message || t('handwriting_failed'));
  } finally {
    hide('handwritingProgress');
  }
});

document.getElementById('handwritingResult').addEventListener('input', e => {
  const empty = !e.target.value.trim();
  document.getElementById('handwritingUseBtn').disabled = empty;
  document.getElementById('handwritingCopyBtn').disabled = empty;
});

document.getElementById('handwritingCopyBtn').addEventListener('click', async () => {
  const text = document.getElementById('handwritingResult').value.trim();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  document.getElementById('handwritingCopyBtn').textContent = `✓ ${t('copied')}`;
  setTimeout(() => { document.getElementById('handwritingCopyBtn').textContent = t('handwriting_copy'); }, 1200);
});

function addRecognizedTextToBoard(text) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, 24);
  const chunks = lines.length ? lines : [text.trim()];
  chunks.forEach((line, index) => {
    const stroke = {
      mode: 'text', id: `${clientId}-ocr-${Date.now()}-${index}`,
      text: line.slice(0, 180), x: 0.08, y: Math.min(0.88, 0.08 + index * 0.055),
      color: classroomCurrentColor, fontSize: 22,
    };
    classroomBoardStrokes.push(stroke);
    socket.emit('board_stroke', { room_code: currentRoomCode, stroke });
  });
  redrawClassroomBoard();
  classroomMoveMode = true;
  classroomTextMode = false;
  classroomErasing = false;
}

document.getElementById('handwritingUseBtn').addEventListener('click', async () => {
  const text = document.getElementById('handwritingResult').value.trim();
  if (!text) return;
  closeHandwritingRecognizer();
  if (handwritingDestination === 'chat') {
    await sendAiPayload({ content: `${t('handwriting_chat_context')}\n\n${text}` }, `✍️ ${t('handwriting_from_file')}: ${handwritingOriginalName}`);
    return;
  }
  if (handwritingDestination === 'board') {
    if (!canManageContent || !currentRoomCode) return;
    addRecognizedTextToBoard(text);
    return;
  }
  setStudyText(text);
  uploadedFilename = handwritingOriginalName || t('handwriting_default_title');
  if (handwritingDestination === 'standalone') {
    pushNavSnapshot();
    TOP_LEVEL_SCREENS.forEach(hide);
  }
  show('step-text');
  show('step-chat');
  if (currentAccessToken) show('saveToLibraryBtn');
  updateGlobalBackButton();
  document.getElementById('step-text').scrollIntoView({ behavior: 'smooth' });
});
