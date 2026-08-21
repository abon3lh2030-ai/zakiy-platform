// ================= دفتر الملاحظات (حساب فردي بس) =================
let notesFoldersCache = [];
let notesListCache = [];
let notesActiveFolder = null; // null = الكل، 'unfiled' = بدون مجلد، وإلا id المجلد
let notesSearchQuery = '';
let notesSearchDebounce = null;

async function loadNotesScreen() {
  try {
    const [foldersRes, notesRes] = await Promise.all([
      apiCall('GET', '/api/notes/folders'),
      apiCall('GET', '/api/notes'),
    ]);
    notesFoldersCache = foldersRes.folders;
    notesListCache = notesRes.notes;
    renderNotesFolders();
    renderNotesList();
  } catch (e) {
    document.getElementById('notesList').innerHTML = `<p class="desc">${escapeHtml(e.message)}</p>`;
  }
}

async function refreshNotesList() {
  const params = new URLSearchParams();
  if (notesActiveFolder && notesActiveFolder !== 'unfiled') params.set('folder_id', notesActiveFolder);
  if (notesSearchQuery) params.set('q', notesSearchQuery);
  const res = await apiCall('GET', `/api/notes?${params.toString()}`);
  notesListCache = notesActiveFolder === 'unfiled' ? res.notes.filter(n => !n.folder_id) : res.notes;
  renderNotesList();
}

function renderNotesFolders() {
  const row = document.getElementById('notesFoldersRow');
  const chips = [
    `<span class="folder-chip ${notesActiveFolder === null ? 'active' : ''}" data-folder="__all__">${t('notes_folder_all')}</span>`,
    `<span class="folder-chip ${notesActiveFolder === 'unfiled' ? 'active' : ''}" data-folder="__unfiled__">${t('notes_folder_unfiled')}</span>`,
    ...notesFoldersCache.map(f => `
      <span class="folder-chip ${notesActiveFolder === f.id ? 'active' : ''}" data-folder="${f.id}">
        ${escapeHtml(f.name)}
        <span class="folder-chip-del" data-del-folder="${f.id}">✕</span>
      </span>
    `),
    `<span class="folder-chip folder-chip-add" id="notesAddFolderChip">➕ ${t('notes_new_folder')}</span>`,
  ];
  row.innerHTML = chips.join('');

  row.querySelectorAll('[data-folder]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.folder;
      notesActiveFolder = val === '__all__' ? null : (val === '__unfiled__' ? 'unfiled' : val);
      renderNotesFolders();
      refreshNotesList();
    });
  });
  row.querySelectorAll('[data-del-folder]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm(t('notes_delete_folder_confirm'))) return;
      try {
        await apiCall('DELETE', `/api/notes/folders/${btn.dataset.delFolder}`);
        if (notesActiveFolder === btn.dataset.delFolder) notesActiveFolder = null;
        await loadNotesScreen();
      } catch (e) { alert(e.message); }
    });
  });
  document.getElementById('notesAddFolderChip').addEventListener('click', async () => {
    const name = prompt(t('notes_new_folder_prompt'));
    if (!name || !name.trim()) return;
    try {
      await apiCall('POST', '/api/notes/folders', { name: name.trim() });
      await loadNotesScreen();
    } catch (e) { alert(e.message); }
  });
}

function noteFolderName(folderId) {
  const f = notesFoldersCache.find(x => x.id === folderId);
  return f ? f.name : null;
}

function renderNotesList() {
  const list = document.getElementById('notesList');
  const empty = document.getElementById('notesEmptyState');
  empty.classList.toggle('hidden', notesListCache.length > 0);
  list.innerHTML = notesListCache.map(n => {
    const title = n.title && n.title.trim() ? escapeHtml(n.title) : t('notes_untitled');
    const folderTag = n.folder_id ? escapeHtml(noteFolderName(n.folder_id) || '') : '';
    const dateStr = new Date(n.updated_at).toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US');
    const typeIcon = n.note_type === 'checklist' ? '☑️' : '📝';
    return `
      <div class="note-card" data-note-id="${n.id}">
        <div class="note-card-top">
          <span class="note-card-title ${n.title && n.title.trim() ? '' : 'untitled'}">${typeIcon} ${title}</span>
          ${n.is_pinned ? '<span class="note-pin-icon">📌</span>' : ''}
        </div>
        <div class="note-card-meta">
          <span>${dateStr}</span>
          ${folderTag ? `<span>📁 ${folderTag}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      pushNavSnapshot();
      openNoteEditor(card.dataset.noteId);
      updateGlobalBackButton();
    });
  });
}

document.getElementById('notesSearchInput').addEventListener('input', (e) => {
  clearTimeout(notesSearchDebounce);
  notesSearchDebounce = setTimeout(() => {
    notesSearchQuery = e.target.value.trim();
    refreshNotesList();
  }, 350);
});

document.getElementById('notesNewBtn').addEventListener('click', async () => {
  try {
    const note = await apiCall('POST', '/api/notes', {
      title: '', content: '', note_type: 'text',
      folder_id: notesActiveFolder && notesActiveFolder !== 'unfiled' ? notesActiveFolder : null,
    });
    pushNavSnapshot();
    openNoteEditor(note.id, note);
    updateGlobalBackButton();
  } catch (e) { alert(e.message); }
});

// ---------- محرر الملاحظة (صفحة مستقلة لكل ملاحظة) ----------
let currentNoteId = null;
let currentNoteData = null;
let noteSaveDebounce = null;

function populateNoteFolderSelect() {
  const sel = document.getElementById('noteFolderSelect');
  sel.innerHTML = `<option value="">${t('notes_folder_unfiled')}</option>` +
    notesFoldersCache.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
}

async function openNoteEditor(noteId, prefetched) {
  showAccountScreen('step-note-editor');
  populateNoteFolderSelect();
  const note = prefetched || await apiCall('GET', `/api/notes/${noteId}`);
  currentNoteId = note.id;
  currentNoteData = note;

  document.getElementById('noteTitleInput').value = note.title || '';
  document.getElementById('noteContentTextarea').value = note.content || '';
  document.getElementById('noteFolderSelect').value = note.folder_id || '';
  document.getElementById('notePinBtn').classList.toggle('pinned', !!note.is_pinned);
  document.getElementById('noteSavedIndicator').textContent = '';
  setNoteTypeUI(note.note_type === 'checklist' ? 'checklist' : 'text');
  renderChecklistItems(note.checklist_items || []);
}

function setNoteTypeUI(type) {
  document.getElementById('noteTypeTextBtn').classList.toggle('active', type === 'text');
  document.getElementById('noteTypeChecklistBtn').classList.toggle('active', type === 'checklist');
  document.getElementById('noteContentTextarea').classList.toggle('hidden', type === 'checklist');
  document.getElementById('noteChecklistWrap').classList.toggle('hidden', type !== 'checklist');
}

async function saveCurrentNote(patch) {
  if (!currentNoteId) return;
  try {
    const updated = await apiCall('PATCH', `/api/notes/${currentNoteId}`, patch);
    currentNoteData = updated;
    document.getElementById('noteSavedIndicator').textContent = t('notes_saved_indicator');
    // نحدّث الكاش المحلي بدل إعادة تحميل كامل القائمة من السيرفر
    const idx = notesListCache.findIndex(n => n.id === currentNoteId);
    if (idx !== -1) notesListCache[idx] = { ...notesListCache[idx], ...updated };
  } catch (e) {
    document.getElementById('noteSavedIndicator').textContent = e.message;
  }
}

document.getElementById('noteTitleInput').addEventListener('input', (e) => {
  clearTimeout(noteSaveDebounce);
  noteSaveDebounce = setTimeout(() => saveCurrentNote({ title: e.target.value }), 600);
});
document.getElementById('noteTitleInput').addEventListener('blur', (e) => {
  clearTimeout(noteSaveDebounce);
  saveCurrentNote({ title: e.target.value });
});
document.getElementById('noteContentTextarea').addEventListener('input', (e) => {
  clearTimeout(noteSaveDebounce);
  noteSaveDebounce = setTimeout(() => saveCurrentNote({ content: e.target.value }), 600);
});
document.getElementById('noteContentTextarea').addEventListener('blur', (e) => {
  clearTimeout(noteSaveDebounce);
  saveCurrentNote({ content: e.target.value });
});
document.getElementById('noteFolderSelect').addEventListener('change', (e) => {
  saveCurrentNote({ folder_id: e.target.value || null });
});
document.getElementById('notePinBtn').addEventListener('click', () => {
  const nowPinned = !document.getElementById('notePinBtn').classList.contains('pinned');
  document.getElementById('notePinBtn').classList.toggle('pinned', nowPinned);
  saveCurrentNote({ is_pinned: nowPinned });
});
document.getElementById('noteDeleteBtn').addEventListener('click', async () => {
  if (!currentNoteId || !confirm(t('notes_delete_confirm'))) return;
  try {
    await apiCall('DELETE', `/api/notes/${currentNoteId}`);
    notesListCache = notesListCache.filter(n => n.id !== currentNoteId);
    document.getElementById('globalBackBtn').click();
  } catch (e) { alert(e.message); }
});
document.getElementById('noteTypeTextBtn').addEventListener('click', () => {
  setNoteTypeUI('text');
  saveCurrentNote({ note_type: 'text' });
});
document.getElementById('noteTypeChecklistBtn').addEventListener('click', () => {
  setNoteTypeUI('checklist');
  saveCurrentNote({ note_type: 'checklist' });
});

// ---------- عناصر قائمة المهام داخل الملاحظة ----------
function renderChecklistItems(items) {
  const wrap = document.getElementById('noteChecklistItems');
  wrap.innerHTML = items.map((item, idx) => `
    <div class="checklist-row ${item.done ? 'done' : ''}" data-idx="${idx}">
      <span class="checklist-toggle ${item.done ? 'done' : ''}">✓</span>
      <input type="text" class="checklist-text-input" value="${escapeHtml(item.text || '')}">
      <span class="checklist-del-btn">🗑️</span>
    </div>
  `).join('');

  wrap.querySelectorAll('.checklist-row').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.checklist-toggle').addEventListener('click', () => {
      const items = [...(currentNoteData.checklist_items || [])];
      const nowDone = !items[idx].done;
      items[idx] = { ...items[idx], done: nowDone };
      currentNoteData.checklist_items = items;
      row.classList.toggle('done', nowDone);
      row.querySelector('.checklist-toggle').classList.toggle('done', nowDone);
      saveCurrentNote({ checklist_items: items });
    });
    row.querySelector('.checklist-text-input').addEventListener('blur', (e) => {
      const items = [...(currentNoteData.checklist_items || [])];
      items[idx] = { ...items[idx], text: e.target.value };
      currentNoteData.checklist_items = items;
      saveCurrentNote({ checklist_items: items });
    });
    row.querySelector('.checklist-del-btn').addEventListener('click', () => {
      const items = (currentNoteData.checklist_items || []).filter((_, i) => i !== idx);
      currentNoteData.checklist_items = items;
      renderChecklistItems(items);
      saveCurrentNote({ checklist_items: items });
    });
  });
}

function addChecklistItem() {
  const input = document.getElementById('noteChecklistNewInput');
  const text = input.value.trim();
  if (!text) return;
  const items = [...(currentNoteData.checklist_items || []), { text, done: false }];
  currentNoteData.checklist_items = items;
  renderChecklistItems(items);
  saveCurrentNote({ checklist_items: items });
  input.value = '';
  input.focus();
}
document.getElementById('noteChecklistAddBtn').addEventListener('click', addChecklistItem);
document.getElementById('noteChecklistNewInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addChecklistItem();
});

