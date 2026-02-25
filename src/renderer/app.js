// ---- State ----
let appData = { items: [], versions: [], settings: {} };
let noteQueue = [];
let isProcessing = false;
let dragSourceId = null;

// ---- DOM References ----
const activeList = document.getElementById('active-list');
const completedList = document.getElementById('completed-list');
const emptyState = document.getElementById('empty-state');
const completedCount = document.getElementById('completed-count');
const completedToggle = document.getElementById('completed-toggle');
const noteInput = document.getElementById('note-input');
const addBtn = document.getElementById('add-btn');
const inputSection = document.getElementById('input-section');
const statusIndicator = document.getElementById('status-indicator');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const errorDismiss = document.getElementById('error-dismiss');
const loadingOverlay = document.getElementById('loading-overlay');
const themeToggle = document.getElementById('theme-toggle');
const undoBtn = document.getElementById('undo-btn');
const queueIndicator = document.getElementById('queue-indicator');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const historyClose = document.getElementById('history-close');
const dragHandle = document.getElementById('drag-handle');
const clearCompletedBtn = document.getElementById('clear-completed');

// ---- SVG Icons ----
const ICON_PLUS = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// ---- Initialization ----
async function init() {
  appData = await window.api.loadData();
  if (!appData.versions) appData.versions = [];
  if (!appData.inputHistory) appData.inputHistory = [];
  applyTheme(appData.settings.theme || 'dark');
  renderChecklist(true);
  updateUndoButton();
  checkOllamaStatus();
}

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  appData.settings.theme = next;
  save();
});

// ---- Input History ----
function pushInput(text, source = 'note') {
  appData.inputHistory.push({
    text,
    source,
    timestamp: new Date().toISOString(),
  });
  if (appData.inputHistory.length > 50) {
    appData.inputHistory = appData.inputHistory.slice(-50);
  }
}

function formatHistoryTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function renderHistory() {
  const entries = [...appData.inputHistory].reverse();
  if (entries.length === 0) {
    historyList.innerHTML = '';
    historyEmpty.classList.remove('hidden');
    return;
  }
  historyEmpty.classList.add('hidden');
  historyList.innerHTML = entries.map((entry) => {
    const time = formatHistoryTime(entry.timestamp);
    const badge = entry.source.toUpperCase();
    return `<li data-text="${escapeAttr(entry.text)}">
      <div class="history-text">${escapeHtml(entry.text)}</div>
      <div class="history-meta">
        <span class="history-badge">${badge}</span>
        <span class="history-time">${time}</span>
      </div>
    </li>`;
  }).join('');
}

function toggleHistoryPanel() {
  const isOpen = !historyPanel.classList.contains('hidden');
  if (isOpen) {
    closeHistoryPanel();
  } else {
    renderHistory();
    historyPanel.classList.remove('hidden');
    historyBtn.classList.add('active');
    dragHandle.classList.add('history-open');
    adjustWindowHeight();
  }
}

function closeHistoryPanel() {
  historyPanel.classList.add('hidden');
  historyBtn.classList.remove('active');
  dragHandle.classList.remove('history-open');
  adjustWindowHeight();
}

historyBtn.addEventListener('click', toggleHistoryPanel);
historyClose.addEventListener('click', closeHistoryPanel);

// Click history item to restore its text to input
historyList.addEventListener('click', (e) => {
  const li = e.target.closest('#history-list li');
  if (!li) return;
  const text = li.dataset.text;
  if (text) {
    noteInput.value = text;
    updateAddButton();
    closeHistoryPanel();
    setTimeout(() => noteInput.focus(), 50);
  }
});

// ---- Version History ----
function pushVersion() {
  appData.versions.push({
    items: JSON.parse(JSON.stringify(appData.items)),
    timestamp: new Date().toISOString(),
  });
  if (appData.versions.length > 50) {
    appData.versions = appData.versions.slice(-50);
  }
  updateUndoButton();
}

function undo() {
  if (appData.versions.length === 0) return;
  const version = appData.versions.pop();
  appData.items = version.items;
  save();
  renderChecklist(true);
  updateUndoButton();
}

function updateUndoButton() {
  const canUndo = appData.versions.length > 0;
  undoBtn.classList.toggle('disabled', !canUndo);
  undoBtn.title = canUndo ? `Undo (${appData.versions.length} version${appData.versions.length !== 1 ? 's' : ''})` : 'Undo';
}

undoBtn.addEventListener('click', () => {
  if (!undoBtn.classList.contains('disabled')) {
    undo();
  }
});

// ---- Custom Confirm Dialog ----
function showConfirm(message) {
  return new Promise((resolve) => {
    confirmMessage.textContent = message;
    confirmDialog.classList.remove('hidden');

    function handleOk() {
      cleanup();
      resolve(true);
    }
    function handleCancel() {
      cleanup();
      resolve(false);
    }
    function cleanup() {
      confirmOkBtn.removeEventListener('click', handleOk);
      confirmCancelBtn.removeEventListener('click', handleCancel);
      confirmDialog.classList.add('hidden');
    }

    confirmOkBtn.addEventListener('click', handleOk);
    confirmCancelBtn.addEventListener('click', handleCancel);
  });
}

// ---- Markdown Rendering ----
function renderMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  return html;
}

// ---- Rendering ----
function renderChecklist(animate = false) {
  const active = appData.items.filter((i) => !i.completed);
  const completed = appData.items.filter((i) => i.completed);

  activeList.innerHTML = active.map((item) => createItemHTML(item, false)).join('');
  completedList.innerHTML = completed.map((item) => createItemHTML(item, true)).join('');

  if (animate) {
    const items = activeList.querySelectorAll(':scope > li');
    items.forEach((el, i) => {
      el.classList.add('animate-in');
      el.style.animationDelay = `${i * 50}ms`;
    });
  }

  completedCount.textContent = completed.length;

  if (active.length === 0 && completed.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  if (completed.length > 0) {
    document.getElementById('completed-section').style.display = '';
    clearCompletedBtn.classList.toggle('hidden', completedList.classList.contains('collapsed'));
  } else {
    document.getElementById('completed-section').style.display = 'none';
  }

  adjustWindowHeight();
}

function createItemHTML(item, isCompleted) {
  let childrenHTML = '';
  if (item.children && item.children.length > 0) {
    const childItems = item.children.map((child) => {
      if (child.isContext) {
        return `<li data-id="${child.id}" class="sub-item context-note">
          <span class="context-text">${renderMarkdown(child.text)}</span>
        </li>`;
      }
      return `<li data-id="${child.id}" class="sub-item ${child.completed ? 'completed' : ''}">
        <label>
          <input type="checkbox" ${child.completed ? 'checked' : ''}>
          <span class="item-text">${renderMarkdown(child.text)}</span>
        </label>
      </li>`;
    }).join('');
    childrenHTML = `<ul class="sub-list">${childItems}</ul>`;
  }

  const addContextBtn = !isCompleted
    ? `<button class="task-context-btn" data-id="${item.id}" title="Add context">${ICON_PLUS}</button>`
    : '';

  const deleteBtn = `<button class="task-delete-btn" data-id="${item.id}" title="Delete">×</button>`;

  const draggable = !isCompleted ? ' draggable="true"' : '';

  return `<li data-id="${item.id}" class="task-item ${isCompleted ? 'completed' : ''}"${draggable}>
      <div class="item-row">
        <label>
          <input type="checkbox" ${item.completed ? 'checked' : ''}>
          <span class="item-text">${renderMarkdown(item.text)}</span>
        </label>
        ${addContextBtn}
        ${deleteBtn}
      </div>
      ${childrenHTML}
      <div class="task-context-input hidden" data-for="${item.id}">
        <textarea placeholder="Add context to this task..." rows="2"></textarea>
        <div class="task-context-actions">
          <button class="task-context-cancel text-button">Cancel</button>
          <button class="task-context-submit primary-button">Add</button>
        </div>
      </div>
    </li>`;
}

// ---- Event Handlers ----

// Checkbox changes (event delegation)
activeList.addEventListener('change', handleCheckboxChange);
completedList.addEventListener('change', handleCheckboxChange);

function handleCheckboxChange(e) {
  if (e.target.type !== 'checkbox') return;
  const checkbox = e.target;
  const li = checkbox.closest('li');
  if (!li) return;
  const id = li.dataset.id;

  if (checkbox.checked) {
    checkbox.classList.add('just-checked');
    checkbox.addEventListener('animationend', () => {
      checkbox.classList.remove('just-checked');
    }, { once: true });
  }

  const parentLi = li.closest('li:not(.sub-item)');
  if (li.classList.contains('sub-item') && parentLi) {
    const parentId = parentLi.dataset.id;
    const parent = appData.items.find((i) => i.id === parentId);
    if (parent && parent.children) {
      const child = parent.children.find((c) => c.id === id);
      if (child) {
        child.completed = checkbox.checked;
        save();
        renderChecklist();
        return;
      }
    }
  }

  const item = appData.items.find((i) => i.id === id);
  if (item) {
    item.completed = checkbox.checked;
    save();
    renderChecklist();
  }
}

// Delete button click (event delegation)
activeList.addEventListener('click', handleItemClick);
completedList.addEventListener('click', handleItemClick);

async function handleItemClick(e) {
  const deleteBtn = e.target.closest('.task-delete-btn');
  if (deleteBtn) {
    e.preventDefault();
    const id = deleteBtn.dataset.id;
    const item = appData.items.find((i) => i.id === id);
    if (item && await showConfirm(`Delete "${item.text}"?`)) {
      appData.items = appData.items.filter((i) => i.id !== id);
      save();
      renderChecklist();
    }
    return;
  }
}

// Right-click to delete (keep as alternative)
activeList.addEventListener('contextmenu', handleItemContextMenu);
completedList.addEventListener('contextmenu', handleItemContextMenu);

async function handleItemContextMenu(e) {
  const li = e.target.closest('li');
  if (!li) return;
  e.preventDefault();
  const id = li.dataset.id;

  if (li.classList.contains('sub-item')) {
    const parentLi = li.closest('li:not(.sub-item)');
    if (parentLi) {
      const parentId = parentLi.dataset.id;
      const parent = appData.items.find((i) => i.id === parentId);
      if (parent && parent.children) {
        const child = parent.children.find((c) => c.id === id);
        if (child && await showConfirm(`Delete "${child.text}"?`)) {
          parent.children = parent.children.filter((c) => c.id !== id);
          save();
          renderChecklist();
          return;
        }
      }
    }
  }

  const item = appData.items.find((i) => i.id === id);
  if (item && await showConfirm(`Delete "${item.text}"?`)) {
    appData.items = appData.items.filter((i) => i.id !== id);
    save();
    renderChecklist();
  }
}

// Per-task context button (event delegation)
activeList.addEventListener('click', (e) => {
  const ctxBtn = e.target.closest('.task-context-btn');
  if (ctxBtn) {
    e.preventDefault();
    const taskId = ctxBtn.dataset.id;
    const inputDiv = activeList.querySelector(`.task-context-input[data-for="${taskId}"]`);
    if (inputDiv) {
      inputDiv.classList.remove('hidden');
      inputDiv.querySelector('textarea').focus();
    }
    return;
  }

  if (e.target.closest('.task-context-cancel')) {
    const inputDiv = e.target.closest('.task-context-input');
    if (inputDiv) {
      inputDiv.classList.add('hidden');
      inputDiv.querySelector('textarea').value = '';
    }
    return;
  }

  const submitBtnEl = e.target.closest('.task-context-submit');
  if (submitBtnEl) {
    const inputDiv = e.target.closest('.task-context-input');
    const taskId = inputDiv.dataset.for;
    const textarea = inputDiv.querySelector('textarea');
    const text = textarea.value.trim();
    if (text) {
      handleTaskContext(taskId, text);
    }
    return;
  }
});

// Enter to submit context, Shift+Enter for new line
activeList.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const inputDiv = e.target.closest('.task-context-input');
    if (inputDiv) {
      e.preventDefault();
      const taskId = inputDiv.dataset.for;
      const text = e.target.value.trim();
      if (text) {
        handleTaskContext(taskId, text);
      }
    }
  }
});

async function handleTaskContext(taskId, noteText) {
  const item = appData.items.find((i) => i.id === taskId);
  if (!item) return;

  pushInput(noteText, 'context');
  pushVersion();
  showLoading(true);

  try {
    const updatedChildren = await window.api.processTaskContext(
      item.text,
      item.children || [],
      noteText
    );
    item.children = updatedChildren;
    await save();
    renderChecklist(true);
  } catch (err) {
    handleOllamaError(err);
  } finally {
    showLoading(false);
  }
}

// ---- Drag and Drop (merge task trees) ----
activeList.addEventListener('dragstart', (e) => {
  const li = e.target.closest('#active-list > li');
  if (!li) return;
  dragSourceId = li.dataset.id;
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSourceId);
});

activeList.addEventListener('dragend', (e) => {
  const li = e.target.closest('#active-list > li');
  if (li) li.classList.remove('dragging');
  activeList.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
  dragSourceId = null;
});

activeList.addEventListener('dragover', (e) => {
  const li = e.target.closest('#active-list > li');
  if (!li || li.dataset.id === dragSourceId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  activeList.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
  li.classList.add('drop-target');
});

activeList.addEventListener('dragleave', (e) => {
  const li = e.target.closest('#active-list > li');
  if (li && !li.contains(e.relatedTarget)) {
    li.classList.remove('drop-target');
  }
});

activeList.addEventListener('drop', async (e) => {
  e.preventDefault();
  const targetLi = e.target.closest('#active-list > li');
  if (!targetLi || targetLi.dataset.id === dragSourceId) return;
  targetLi.classList.remove('drop-target');

  const sourceId = dragSourceId;
  const targetId = targetLi.dataset.id;
  dragSourceId = null;

  await handleMerge(sourceId, targetId);
});

async function handleMerge(sourceId, targetId) {
  const source = appData.items.find((i) => i.id === sourceId);
  const target = appData.items.find((i) => i.id === targetId);
  if (!source || !target) return;

  pushInput(`[merge] "${source.text}" + "${target.text}"`, 'merge');
  pushVersion();
  showLoading(true);

  try {
    const merged = await window.api.mergeTasks(source, target);
    if (!merged) {
      showError('Could not merge tasks. Try again.');
      return;
    }

    const targetIndex = appData.items.findIndex((i) => i.id === targetId);
    appData.items = appData.items.filter((i) => i.id !== sourceId && i.id !== targetId);
    appData.items.splice(Math.min(targetIndex, appData.items.length), 0, merged);

    await save();
    renderChecklist(true);
  } catch (err) {
    handleOllamaError(err);
  } finally {
    showLoading(false);
  }
}

// Toggle completed section
completedToggle.addEventListener('click', () => {
  completedList.classList.toggle('collapsed');
  completedToggle.classList.toggle('expanded');
  clearCompletedBtn.classList.toggle('hidden', completedList.classList.contains('collapsed'));
  adjustWindowHeight();
});

// Clear completed
clearCompletedBtn.addEventListener('click', async () => {
  const count = appData.items.filter((i) => i.completed).length;
  if (await showConfirm(`Clear ${count} completed item${count !== 1 ? 's' : ''}?`)) {
    appData.items = appData.items.filter((i) => !i.completed);
    save();
    renderChecklist();
  }
});

// ---- Input Bar ----
function updateAddButton() {
  addBtn.classList.toggle('hidden', !noteInput.value.trim());
}

noteInput.addEventListener('input', updateAddButton);

noteInput.addEventListener('focus', () => {
  inputSection.classList.add('focused');
});

noteInput.addEventListener('blur', () => {
  inputSection.classList.remove('focused');
});

noteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
});

addBtn.addEventListener('click', handleSubmit);

// ---- Async Note Queue ----
function handleSubmit() {
  const noteText = noteInput.value.trim();
  if (!noteText) return;

  pushInput(noteText, 'note');
  noteInput.value = '';
  updateAddButton();
  noteInput.focus();
  noteQueue.push(noteText);
  updateQueueIndicator();
  processQueue();
}

async function processQueue() {
  if (isProcessing || noteQueue.length === 0) return;

  isProcessing = true;
  updateQueueIndicator();

  while (noteQueue.length > 0) {
    const noteText = noteQueue.shift();
    updateQueueIndicator();

    pushVersion();

    try {
      const newItems = await window.api.processNote(noteText);
      if (newItems.length === 0) {
        showError('Could not extract any checklist items. Try rephrasing your note.');
      } else {
        appData.items = [...appData.items, ...newItems];
        await save();
        renderChecklist(true);
      }
    } catch (err) {
      handleOllamaError(err);
    }
  }

  isProcessing = false;
  updateQueueIndicator();
}

function updateQueueIndicator() {
  const pending = noteQueue.length;
  const total = pending + (isProcessing ? 1 : 0);

  if (total > 0) {
    const label = total === 1
      ? 'Processing note...'
      : `Processing note... (${pending} queued)`;
    queueIndicator.textContent = label;
    queueIndicator.classList.remove('hidden');
  } else {
    queueIndicator.classList.add('hidden');
  }
}

// Error banner
errorDismiss.addEventListener('click', () => {
  errorBanner.classList.add('hidden');
});

// ---- Persistence ----
async function save() {
  await window.api.saveData(appData);
}

// ---- Ollama Status ----
async function checkOllamaStatus() {
  try {
    const online = await window.api.checkOllama();
    statusIndicator.classList.toggle('online', online);
    statusIndicator.classList.toggle('offline', !online);
    statusIndicator.title = online ? 'Ollama: connected' : 'Ollama: not running';
  } catch {
    statusIndicator.classList.remove('online');
    statusIndicator.classList.add('offline');
    statusIndicator.title = 'Ollama: not running';
  }
}

setInterval(checkOllamaStatus, 30000);

// ---- UI Helpers ----
function showLoading(visible) {
  loadingOverlay.classList.toggle('hidden', !visible);
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  setTimeout(() => {
    errorBanner.classList.add('hidden');
  }, 8000);
}

function handleOllamaError(err) {
  if (err.message.includes('fetch') || err.message.includes('ECONNREFUSED')) {
    showError('Ollama is not running. Start it with: ollama serve');
  } else if (err.message.includes('404') || err.message.includes('not found')) {
    const model = appData.settings.ollamaModel || 'qwen3:8b';
    showError(`Model not found. Run: ollama pull ${model}`);
  } else {
    showError(err.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Dynamic Window Sizing ----
function adjustWindowHeight() {
  requestAnimationFrame(() => {
    const height = document.body.scrollHeight;
    window.api.resizeWindow(height);
  });
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
