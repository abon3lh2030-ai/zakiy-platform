// ---------- مجلدات ومستندات المدرسة المشتركة ----------
const schoolDocumentsState = { folders: [], documents: [], activeFolder: 'all', query: '' };

function schoolDocumentFormatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function schoolDocumentIcon(name) {
  const extension = String(name || '').split('.').pop().toLowerCase();
  if (extension === 'pdf') return '📕';
  if (['doc', 'docx', 'txt'].includes(extension)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(extension)) return '📊';
  if (['ppt', 'pptx'].includes(extension)) return '📙';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return '🖼️';
  if (extension === 'zip') return '🗜️';
  return '📄';
}

function schoolDocumentFolderName(folderId) {
  if (!folderId) return t('school_documents_unfiled');
  return schoolDocumentsState.folders.find(folder => folder.id === folderId)?.name || t('school_documents_unfiled');
}

function renderSchoolDocumentFolders() {
  const list = document.getElementById('schoolFoldersList');
  const unfiledCount = schoolDocumentsState.documents.filter(document => !document.folder_id).length;
  const rows = [
    { id: 'all', name: t('school_documents_all'), icon: '🗂️', count: schoolDocumentsState.documents.length, protected: true },
    { id: 'unfiled', name: t('school_documents_unfiled'), icon: '📄', count: unfiledCount, protected: true },
    ...schoolDocumentsState.folders.map(folder => ({ ...folder, icon: '📁', count: folder.documents_count || 0 })),
  ];
  list.innerHTML = rows.map(folder => `
    <div class="school-folder-row ${schoolDocumentsState.activeFolder === folder.id ? 'active' : ''}">
      <button class="school-folder-button" data-school-folder="${folder.id}"><b>${folder.icon}</b><span>${escapeHtml(folder.name)}</span><small>${folder.count}</small></button>
      ${folder.protected ? '' : `<div class="school-folder-menu"><button title="${t('btn_rename')}" data-rename-school-folder="${folder.id}">✏️</button><button title="${t('btn_delete')}" data-delete-school-folder="${folder.id}">🗑️</button></div>`}
    </div>`).join('');

  list.querySelectorAll('[data-school-folder]').forEach(button => button.addEventListener('click', () => {
    schoolDocumentsState.activeFolder = button.dataset.schoolFolder;
    renderSchoolDocumentFolders();
    renderSchoolDocuments();
  }));
  list.querySelectorAll('[data-rename-school-folder]').forEach(button => button.addEventListener('click', async () => {
    const folder = schoolDocumentsState.folders.find(item => item.id === button.dataset.renameSchoolFolder);
    const name = prompt(t('prompt_rename_school_folder'), folder?.name || '');
    if (!name?.trim()) return;
    try {
      await apiCall('PATCH', `/api/school/document-folders/${button.dataset.renameSchoolFolder}`, { name: name.trim() });
      await loadSchoolDocuments();
    } catch (error) { showError('schoolDocumentsError', error.message); }
  }));
  list.querySelectorAll('[data-delete-school-folder]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm(t('confirm_delete_school_folder'))) return;
    try {
      await apiCall('DELETE', `/api/school/document-folders/${button.dataset.deleteSchoolFolder}`);
      if (schoolDocumentsState.activeFolder === button.dataset.deleteSchoolFolder) schoolDocumentsState.activeFolder = 'unfiled';
      await loadSchoolDocuments();
    } catch (error) { showError('schoolDocumentsError', error.message); }
  }));

  const select = document.getElementById('schoolDocumentFolderSelect');
  const previous = select.value;
  select.innerHTML = `<option value="">${t('school_documents_unfiled')}</option>${schoolDocumentsState.folders.map(folder => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join('')}`;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  else if (schoolDocumentsState.activeFolder !== 'all' && schoolDocumentsState.activeFolder !== 'unfiled') select.value = schoolDocumentsState.activeFolder;
}

function renderSchoolDocuments() {
  const list = document.getElementById('schoolDocumentsList');
  const query = schoolDocumentsState.query.trim().toLocaleLowerCase(currentLang === 'ar' ? 'ar' : 'en');
  const filtered = schoolDocumentsState.documents.filter(document => {
    const folderMatches = schoolDocumentsState.activeFolder === 'all'
      || (schoolDocumentsState.activeFolder === 'unfiled' && !document.folder_id)
      || document.folder_id === schoolDocumentsState.activeFolder;
    const searchMatches = !query || String(document.file_name || '').toLocaleLowerCase().includes(query);
    return folderMatches && searchMatches;
  });
  const heading = schoolDocumentsState.activeFolder === 'all'
    ? t('school_documents_all')
    : schoolDocumentsState.activeFolder === 'unfiled'
      ? t('school_documents_unfiled')
      : schoolDocumentFolderName(schoolDocumentsState.activeFolder);
  document.getElementById('schoolDocumentsCurrentFolder').textContent = heading;
  list.innerHTML = filtered.length ? filtered.map(document => `
    <article class="school-document-card">
      <span class="school-document-icon">${schoolDocumentIcon(document.file_name)}</span>
      <div class="school-document-info"><strong title="${escapeHtml(document.file_name)}">${escapeHtml(document.file_name)}</strong><small>${escapeHtml(schoolDocumentFolderName(document.folder_id))} · ${schoolDocumentFormatBytes(document.size_bytes)}<br>${t('school_document_uploaded_by', { name: escapeHtml(document.uploaded_by_name || '—') })} · ${new Date(document.created_at).toLocaleString(currentLang === 'ar' ? 'ar-SA' : 'en-US')}</small></div>
      <div class="school-document-actions"><button title="${t('btn_download')}" data-download-school-document="${document.id}">⬇️</button><button class="danger" title="${t('btn_delete')}" data-delete-school-document="${document.id}">🗑️</button></div>
    </article>`).join('') : `<div class="school-documents-empty"><div style="font-size:34px;margin-bottom:8px;">📭</div><strong>${query ? t('school_documents_no_search_results') : t('school_documents_empty')}</strong></div>`;

  list.querySelectorAll('[data-download-school-document]').forEach(button => button.addEventListener('click', async () => {
    try {
      const data = await apiCall('GET', `/api/school/documents/${button.dataset.downloadSchoolDocument}/download`);
      const anchor = document.createElement('a');
      anchor.href = data.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) { showError('schoolDocumentsError', error.message); }
  }));
  list.querySelectorAll('[data-delete-school-document]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm(t('confirm_delete_school_document'))) return;
    try {
      await apiCall('DELETE', `/api/school/documents/${button.dataset.deleteSchoolDocument}`);
      await loadSchoolDocuments();
    } catch (error) { showError('schoolDocumentsError', error.message); }
  }));
}

async function loadSchoolDocuments() {
  clearError('schoolDocumentsError');
  document.getElementById('schoolDocumentsList').innerHTML = `<div class="school-documents-empty">${t('loading')}</div>`;
  try {
    const data = await apiCall('GET', '/api/school/documents');
    schoolDocumentsState.folders = data.folders || [];
    schoolDocumentsState.documents = data.documents || [];
    document.getElementById('schoolDocumentsSummary').textContent = t('school_documents_summary', {
      files: data.summary?.documents_count || 0,
      folders: data.summary?.folders_count || 0,
      size: schoolDocumentFormatBytes(data.summary?.total_bytes || 0),
    });
    renderSchoolDocumentFolders();
    renderSchoolDocuments();
  } catch (error) {
    showError('schoolDocumentsError', error.message);
    document.getElementById('schoolDocumentsList').innerHTML = '';
  }
}

document.getElementById('schoolFolderCreateBtn').addEventListener('click', async () => {
  const input = document.getElementById('schoolFolderNameInput');
  if (!input.value.trim()) { showError('schoolDocumentsError', t('err_school_folder_name_required')); return; }
  try {
    const folder = await apiCall('POST', '/api/school/document-folders', { name: input.value.trim() });
    input.value = '';
    schoolDocumentsState.activeFolder = folder.id;
    await loadSchoolDocuments();
  } catch (error) { showError('schoolDocumentsError', error.message); }
});

document.getElementById('schoolFolderNameInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('schoolFolderCreateBtn').click();
});

const schoolDocumentDrop = document.querySelector('.school-document-drop');
const schoolDocumentFileInput = document.getElementById('schoolDocumentFileInput');
function updateSchoolDocumentFileLabel() {
  schoolDocumentDrop.classList.toggle('has-file', !!schoolDocumentFileInput.files.length);
  schoolDocumentDrop.querySelector('strong').textContent = schoolDocumentFileInput.files[0]?.name || t('school_document_upload_title');
}
schoolDocumentFileInput.addEventListener('change', updateSchoolDocumentFileLabel);
['dragenter', 'dragover'].forEach(type => schoolDocumentDrop.addEventListener(type, event => { event.preventDefault(); schoolDocumentDrop.classList.add('has-file'); }));
['dragleave', 'drop'].forEach(type => schoolDocumentDrop.addEventListener(type, event => { event.preventDefault(); if (type === 'dragleave') updateSchoolDocumentFileLabel(); }));
schoolDocumentDrop.addEventListener('drop', event => {
  if (event.dataTransfer.files.length) {
    schoolDocumentFileInput.files = event.dataTransfer.files;
    updateSchoolDocumentFileLabel();
  }
});

document.getElementById('schoolDocumentUploadBtn').addEventListener('click', async () => {
  const file = schoolDocumentFileInput.files[0];
  if (!file) { showError('schoolDocumentsError', t('err_pick_school_document')); return; }
  if (file.size > 20 * 1024 * 1024) { showError('schoolDocumentsError', t('err_school_document_too_large')); return; }
  clearError('schoolDocumentsError');
  const button = document.getElementById('schoolDocumentUploadBtn');
  const defaultText = t('btn_upload_school_document');
  const progress = document.getElementById('schoolDocumentProgress');
  const progressBar = progress.firstElementChild;
  const body = new FormData();
  body.append('file', file);
  body.append('folder_id', document.getElementById('schoolDocumentFolderSelect').value);
  button.disabled = true;
  button.textContent = t('school_document_uploading');
  progress.classList.remove('hidden');
  progressBar.style.width = '45%';
  try {
    const response = await fetch(`${API_BASE}/api/school/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${currentAccessToken}` }, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t('err_upload_failed'));
    progressBar.style.width = '100%';
    schoolDocumentFileInput.value = '';
    updateSchoolDocumentFileLabel();
    await loadSchoolDocuments();
  } catch (error) { showError('schoolDocumentsError', error.message); }
  finally {
    button.disabled = false;
    button.textContent = defaultText;
    setTimeout(() => { progress.classList.add('hidden'); progressBar.style.width = '0'; }, 350);
  }
});

document.getElementById('schoolDocumentsSearch').addEventListener('input', event => {
  schoolDocumentsState.query = event.target.value;
  renderSchoolDocuments();
});
