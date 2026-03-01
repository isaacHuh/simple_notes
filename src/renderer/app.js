// ---- Model Tiers ----
const MODEL_TIERS = {
  low:    { model: 'exaone3.5:2.4b', label: 'Low', desc: 'Fast and light, best format adherence at this size', size: '~1.6 GB' },
  medium: { model: 'gemma3:4b',  label: 'Medium', desc: 'Best instruction following at this size', size: '~3.3 GB' },
  high:   { model: 'qwen3:8b',  label: 'High',   desc: 'Best quality, slower on low-end hardware', size: '~5 GB' },
};

// ---- State ----
let appData = { items: [], versions: [], redoVersions: [], settings: {} };
let noteQueue = [];
let isProcessing = false;
let dragSourceIds = new Set();
let lockedTaskIds = new Set();
let selectedTaskIds = new Set();
let mergeQueue = [];
let queuedMergeIds = new Set();
let isShiftHeld = false;
let isSelecting = false;
let dropMode = null;       // 'merge' | 'reorder-above' | 'reorder-below'

document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isShiftHeld = true; });
document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isShiftHeld = false; });

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
const redoBtn = document.getElementById('redo-btn');
const settingsBtn = document.getElementById('settings-btn');
const contextMenu = document.getElementById('context-menu');
const ctxMerge = document.getElementById('ctx-merge');
const ctxDelete = document.getElementById('ctx-delete');

// ---- SVG Icons ----
const ICON_PLUS = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
  <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_GRIP = `<svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
  <circle cx="1.5" cy="1.5" r="1"/>
  <circle cx="4.5" cy="1.5" r="1"/>
  <circle cx="1.5" cy="5" r="1"/>
  <circle cx="4.5" cy="5" r="1"/>
  <circle cx="1.5" cy="8.5" r="1"/>
  <circle cx="4.5" cy="8.5" r="1"/>
</svg>`;

// ---- Setup Wizard ----
const setupWizard = document.getElementById('setup-wizard');
const stepInstall = document.getElementById('step-install');
const stepInstallHint = document.getElementById('step-install-hint');
const stepInstallActions = document.getElementById('step-install-actions');
const stepModel = document.getElementById('step-model');
const stepModelLabel = document.getElementById('step-model-label');
const stepModelHint = document.getElementById('step-model-hint');
const stepModelActions = document.getElementById('step-model-actions');
const stepModelProgress = document.getElementById('step-model-progress');
const pullProgressFill = document.getElementById('pull-progress-fill');
const pullProgressText = document.getElementById('pull-progress-text');
const setupFooter = document.getElementById('setup-footer');

function setStepStatus(stepEl, status) {
  stepEl.dataset.status = status;
  const checking = stepEl.querySelector('.step-checking');
  const pass = stepEl.querySelector('.step-pass');
  const fail = stepEl.querySelector('.step-fail');
  const waiting = stepEl.querySelector('.step-waiting');

  [checking, pass, fail, waiting].forEach((el) => { if (el) el.classList.add('hidden'); });

  if (status === 'checking' && checking) checking.classList.remove('hidden');
  else if (status === 'pass' && pass) pass.classList.remove('hidden');
  else if (status === 'fail' && fail) fail.classList.remove('hidden');
  else if (status === 'waiting' && waiting) waiting.classList.remove('hidden');
}

async function runSetupCheck() {
  const model = appData.settings.ollamaModel || 'exaone3.5:2.4b';
  stepModelLabel.textContent = `Model ready (${model})`;

  // Step 1: Check Ollama server
  setStepStatus(stepInstall, 'checking');
  stepInstallHint.classList.add('hidden');
  stepInstallActions.classList.add('hidden');

  const ollamaOk = await window.api.checkOllama();

  if (ollamaOk) {
    setStepStatus(stepInstall, 'pass');
    stepInstallHint.classList.add('hidden');
    stepInstallActions.classList.add('hidden');
  } else {
    setStepStatus(stepInstall, 'fail');
    stepInstallHint.textContent = 'Download and open Ollama to continue';
    stepInstallHint.classList.remove('hidden');
    stepInstallActions.classList.remove('hidden');
    // Reset model step to waiting
    setStepStatus(stepModel, 'waiting');
    stepModelHint.classList.add('hidden');
    stepModelActions.classList.add('hidden');
    stepModelProgress.classList.add('hidden');
    setupFooter.classList.add('hidden');
    return;
  }

  // Step 2: Check if model is available
  setStepStatus(stepModel, 'checking');
  stepModelHint.classList.add('hidden');
  stepModelActions.classList.add('hidden');

  try {
    const models = await window.api.listModels();
    const hasModel = models.some((m) => m === model);

    if (hasModel) {
      setStepStatus(stepModel, 'pass');
      setupFooter.classList.remove('hidden');
    } else {
      setStepStatus(stepModel, 'fail');
      stepModelHint.textContent = `"${model}" is not downloaded yet`;
      stepModelHint.classList.remove('hidden');
      stepModelActions.classList.remove('hidden');
      setupFooter.classList.add('hidden');
    }
  } catch {
    setStepStatus(stepModel, 'fail');
    stepModelHint.textContent = 'Could not check models';
    stepModelHint.classList.remove('hidden');
    stepModelActions.classList.remove('hidden');
    setupFooter.classList.add('hidden');
  }
}

async function needsSetup() {
  try {
    const ollamaOk = await window.api.checkOllama();
    if (!ollamaOk) return true;

    const model = appData.settings.ollamaModel || 'exaone3.5:2.4b';
    const models = await window.api.listModels();
    return !models.some((m) => m === model);
  } catch {
    return true;
  }
}

document.getElementById('btn-download-ollama').addEventListener('click', async () => {
  const platform = await window.api.getPlatform();
  const url = platform === 'win32'
    ? 'https://ollama.com/download/windows'
    : 'https://ollama.com/download/mac';
  window.api.openExternal(url);
});

document.getElementById('btn-recheck-ollama').addEventListener('click', () => {
  runSetupCheck();
});

document.getElementById('btn-pull-model').addEventListener('click', async () => {
  const model = appData.settings.ollamaModel || 'exaone3.5:2.4b';
  stepModelActions.classList.add('hidden');
  stepModelHint.classList.add('hidden');
  stepModelProgress.classList.remove('hidden');
  setStepStatus(stepModel, 'checking');
  pullProgressFill.style.width = '0%';
  pullProgressText.textContent = 'Starting download...';

  try {
    await window.api.pullModel(model);
    setStepStatus(stepModel, 'pass');
    stepModelProgress.classList.add('hidden');
    setupFooter.classList.remove('hidden');
  } catch (err) {
    setStepStatus(stepModel, 'fail');
    stepModelProgress.classList.add('hidden');
    stepModelHint.textContent = `Pull failed: ${err.message}`;
    stepModelHint.classList.remove('hidden');
    stepModelActions.classList.remove('hidden');
  }
});

document.getElementById('btn-setup-done').addEventListener('click', () => {
  setupWizard.classList.add('hidden');
  appData.settings.setupComplete = true;
  save();
  adjustWindowHeight(true);
});

document.getElementById('btn-setup-skip').addEventListener('click', () => {
  setupWizard.classList.add('hidden');
  appData.settings.setupComplete = true;
  save();
  adjustWindowHeight(true);
});

// ---- Initialization ----
async function init() {
  appData = await window.api.loadData();
  if (!appData.versions) appData.versions = [];
  if (!appData.redoVersions) appData.redoVersions = [];
  if (!appData.inputHistory) appData.inputHistory = [];

  // Auto-detect model tier on first launch (no modelTier saved yet)
  if (!appData.settings.modelTier) {
    const tier = await autoDetectModelTier();
    appData.settings.modelTier = tier;
    appData.settings.ollamaModel = MODEL_TIERS[tier].model;
    await save();
  }

  applyTheme(appData.settings.theme || 'dark');
  applyColorScheme(appData.settings.colorScheme || 'purple');

  renderChecklist(true);
  updateUndoButton();
  updateRedoButton();
  checkOllamaStatus();

  // Show setup wizard on first launch or if Ollama/model is missing
  if (!appData.settings.setupComplete || await needsSetup()) {
    setupWizard.classList.remove('hidden');
    runSetupCheck();
  }
}

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ---- Color Scheme ----
function applyColorScheme(scheme) {
  if (!scheme || scheme === 'purple') {
    document.documentElement.removeAttribute('data-color-scheme');
  } else {
    document.documentElement.setAttribute('data-color-scheme', scheme);
  }
}

// ---- Settings Button ----
settingsBtn.addEventListener('click', () => {
  window.api.openSettings();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.api.hideWindow();
});

window.api.onSettingsChanged(({ key, value }) => {
  appData.settings[key] = value;
  if (key === 'theme') applyTheme(value);
  if (key === 'colorScheme') applyColorScheme(value);
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
    adjustWindowHeight(true);
  }
}

function closeHistoryPanel() {
  historyPanel.classList.add('hidden');
  historyBtn.classList.remove('active');
  dragHandle.classList.remove('history-open');
  adjustWindowHeight(true);
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

// Pull progress for setup wizard
window.api.onPullProgress((data) => {
  if (!stepModelProgress.classList.contains('hidden')) {
    if (data.total && data.completed) {
      const pct = Math.round((data.completed / data.total) * 100);
      pullProgressFill.style.width = `${pct}%`;
      const mb = (n) => (n / 1024 / 1024).toFixed(0);
      pullProgressText.textContent = `${data.status || 'Downloading'}... ${mb(data.completed)} / ${mb(data.total)} MB (${pct}%)`;
    } else if (data.status) {
      pullProgressText.textContent = data.status;
    }
  }
});

// ---- Auto-detect Model Tier ----
async function autoDetectModelTier() {
  try {
    const info = await window.api.getSystemInfo();
    const ram = info.totalMemoryGB;
    if (ram <= 8) return 'low';
    if (ram <= 16) return 'medium';
    return 'high';
  } catch {
    return 'medium'; // safe default
  }
}

// ---- Version History ----
function pushVersion() {
  appData.versions.push({
    items: JSON.parse(JSON.stringify(appData.items)),
    timestamp: new Date().toISOString(),
  });
  if (appData.versions.length > 50) {
    appData.versions = appData.versions.slice(-50);
  }
  // New action invalidates the redo stack
  appData.redoVersions = [];
  updateUndoButton();
  updateRedoButton();
}

function undo() {
  if (appData.versions.length === 0) return;
  // Save current state to redo stack before restoring
  appData.redoVersions.push({
    items: JSON.parse(JSON.stringify(appData.items)),
    timestamp: new Date().toISOString(),
  });
  const version = appData.versions.pop();
  appData.items = version.items;
  save();
  renderChecklist(true);
  updateUndoButton();
  updateRedoButton();
}

function redo() {
  if (appData.redoVersions.length === 0) return;
  // Save current state to undo stack before restoring
  appData.versions.push({
    items: JSON.parse(JSON.stringify(appData.items)),
    timestamp: new Date().toISOString(),
  });
  const version = appData.redoVersions.pop();
  appData.items = version.items;
  save();
  renderChecklist(true);
  updateUndoButton();
  updateRedoButton();
}

function updateUndoButton() {
  const canUndo = appData.versions.length > 0;
  undoBtn.classList.toggle('disabled', !canUndo);
  undoBtn.title = canUndo ? `Undo (${appData.versions.length} version${appData.versions.length !== 1 ? 's' : ''})` : 'Undo';
}

function updateRedoButton() {
  const canRedo = appData.redoVersions.length > 0;
  redoBtn.classList.toggle('disabled', !canRedo);
  redoBtn.title = canRedo ? `Redo (${appData.redoVersions.length} version${appData.redoVersions.length !== 1 ? 's' : ''})` : 'Redo';
}

undoBtn.addEventListener('click', () => {
  if (!undoBtn.classList.contains('disabled')) {
    undo();
  }
});

redoBtn.addEventListener('click', () => {
  if (!redoBtn.classList.contains('disabled')) {
    redo();
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
  // Auto-link URLs (after escaping so angle brackets are safe)
  html = html.replace(
    /https?:\/\/[^\s<>&"'`)(]+(?:\([^\s<>&"'`)(]*\))*[^\s<>&"'`)(.,;:!?\]})]/gi,
    (url) => `<a href="${url}" class="task-link" title="${url}">${url}</a>`
  );
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  return html;
}

// ---- Rendering ----

// Build a fingerprint of all data that affects an item's rendered output.
// If the fingerprint is unchanged, we skip the DOM replacement entirely.
function itemFingerprint(item) {
  return JSON.stringify({
    t: item.text,
    c: item.completed,
    ch: item.children,
    l: lockedTaskIds.has(item.id),
    q: queuedMergeIds.has(item.id),
    s: selectedTaskIds.has(item.id),
  });
}

// Reconcile a <ul> to match the desired items list without a full innerHTML
// wipe. Only adds, removes, reorders, and updates the specific nodes that
// changed. Returns the set of newly inserted item IDs.
function reconcileList(listEl, items, isCompleted) {
  const existingNodes = new Map();
  for (const li of [...listEl.querySelectorAll(':scope > li.task-item')]) {
    existingNodes.set(li.dataset.id, li);
  }

  const desiredSet = new Set(items.map((i) => i.id));
  const newIds = new Set();

  // Remove nodes that are no longer in the list
  for (const [id, li] of existingNodes) {
    if (!desiredSet.has(id)) {
      li.remove();
      existingNodes.delete(id);
    }
  }

  let prevNode = null;

  for (const item of items) {
    let li = existingNodes.get(item.id);
    const isNew = !li;
    const fp = itemFingerprint(item);

    if (li) {
      // Existing node — only replace if data changed
      if (li.dataset.fp !== fp) {
        const temp = document.createElement('template');
        temp.innerHTML = createItemHTML(item, isCompleted);
        const replacement = temp.content.firstElementChild;
        replacement.dataset.fp = fp;
        li.replaceWith(replacement);
        li = replacement;
        existingNodes.set(item.id, li);
      }
    } else {
      // New node — create it
      const temp = document.createElement('template');
      temp.innerHTML = createItemHTML(item, isCompleted);
      li = temp.content.firstElementChild;
      li.dataset.fp = fp;
      existingNodes.set(item.id, li);
      newIds.add(item.id);
    }

    // Ensure correct position in the list
    const expectedNext = prevNode ? prevNode.nextElementSibling : listEl.firstElementChild;
    if (li !== expectedNext) {
      if (prevNode) {
        prevNode.after(li);
      } else {
        listEl.prepend(li);
      }
    }

    prevNode = li;
  }

  return newIds;
}

function renderChecklist(animate = false) {
  // Preserve any open context textarea state before reconciliation
  const openContextInputs = [];
  activeList.querySelectorAll('.task-context-input:not(.hidden)').forEach((div) => {
    const textarea = div.querySelector('textarea');
    if (textarea) {
      openContextInputs.push({
        taskId: div.dataset.for,
        value: textarea.value,
        selStart: textarea.selectionStart,
        selEnd: textarea.selectionEnd,
      });
    }
  });

  const active = appData.items.filter((i) => !i.completed);
  const completed = appData.items.filter((i) => i.completed);

  const newActiveIds = reconcileList(activeList, active, false);
  reconcileList(completedList, completed, true);

  // Restore open context textareas (needed if their node was replaced)
  for (const ctx of openContextInputs) {
    const inputDiv = activeList.querySelector(`.task-context-input[data-for="${ctx.taskId}"]`);
    if (inputDiv) {
      inputDiv.classList.remove('hidden');
      const textarea = inputDiv.querySelector('textarea');
      if (textarea) {
        textarea.value = ctx.value;
        textarea.selectionStart = ctx.selStart;
        textarea.selectionEnd = ctx.selEnd;
      }
    }
  }

  // Only animate genuinely new items, not the entire list
  if (animate && newActiveIds.size > 0) {
    let delay = 0;
    for (const id of newActiveIds) {
      const el = activeList.querySelector(`li[data-id="${id}"]`);
      if (el) {
        el.classList.add('animate-in');
        el.style.animationDelay = `${delay * 50}ms`;
        delay++;
      }
    }
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
  const isLocked = lockedTaskIds.has(item.id);

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
        </label>
        <span class="item-text">${renderMarkdown(child.text)}</span>
      </li>`;
    }).join('');
    childrenHTML = `<ul class="sub-list">${childItems}</ul>`;
  }

  const addContextBtn = !isCompleted && !isLocked
    ? `<button class="task-context-btn" data-id="${item.id}" title="Add context">${ICON_PLUS}</button>`
    : '';

  const deleteBtn = !isLocked
    ? `<button class="task-delete-btn" data-id="${item.id}" title="Delete">×</button>`
    : '';

  const isQueued = queuedMergeIds.has(item.id);
  const processingIndicator = isQueued
    ? `<div class="task-processing"><span class="queue-label">Queued</span></div>`
    : isLocked
    ? `<div class="task-processing"><span></span><span></span><span></span></div>`
    : '';

  const draggable = !isCompleted && !isLocked ? ' draggable="true"' : '';
  const lockedClass = isLocked ? ' locked' : '';
  const selectedClass = selectedTaskIds.has(item.id) ? ' selected' : '';

  const dragHandleHTML = !isCompleted && !isLocked
    ? `<span class="drag-handle" title="Drag to reorder or merge">${ICON_GRIP}</span>`
    : '';

  return `<li data-id="${item.id}" class="task-item ${isCompleted ? 'completed' : ''}${lockedClass}${selectedClass}"${draggable}>
      <div class="item-row">
        ${dragHandleHTML}
        <label>
          <input type="checkbox" ${item.completed ? 'checked' : ''}${isLocked ? ' disabled' : ''}>
        </label>
        <span class="item-text">${renderMarkdown(item.text)}</span>
        ${processingIndicator}
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

// Only allow drag initiation from the drag handle — disable draggable
// when mousedown is on anything else so text selection works naturally.
activeList.addEventListener('mousedown', (e) => {
  if (isShiftHeld) return;
  const handle = e.target.closest('.drag-handle');
  if (handle) return; // Allow drag from handle
  const li = e.target.closest('li[draggable="true"]');
  if (!li) return;
  li.removeAttribute('draggable');
  const restore = () => {
    li.setAttribute('draggable', 'true');
    document.removeEventListener('mouseup', restore);
  };
  document.addEventListener('mouseup', restore);
});

// Link clicks — open externally and stop propagation (event delegation)
function handleLinkClick(e) {
  const link = e.target.closest('a.task-link');
  if (!link) return;
  e.preventDefault();
  e.stopPropagation();
  window.api.openExternal(link.href);
}
activeList.addEventListener('click', handleLinkClick, true);
completedList.addEventListener('click', handleLinkClick, true);

// Checkbox changes (event delegation)
activeList.addEventListener('change', handleCheckboxChange);
completedList.addEventListener('change', handleCheckboxChange);

function handleCheckboxChange(e) {
  if (e.target.type !== 'checkbox') return;

  // Shift+click is for multi-selection, not checkbox toggling
  if (isShiftHeld) {
    e.target.checked = !e.target.checked;
    return;
  }

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

// ---- Context Menu ----
let ctxTargetId = null;
let ctxIsSubItem = false;
let ctxParentId = null;

function showContextMenu(x, y) {
  // Make visible off-screen to measure, then position
  contextMenu.style.left = '-9999px';
  contextMenu.style.top = '-9999px';
  contextMenu.classList.remove('hidden');

  const rect = contextMenu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 4;
  const maxY = window.innerHeight - rect.height - 4;
  contextMenu.style.left = `${Math.min(x, maxX)}px`;
  contextMenu.style.top = `${Math.min(y, maxY)}px`;
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  ctxTargetId = null;
  ctxIsSubItem = false;
  ctxParentId = null;
}

// Dismiss context menu on any click or Escape
document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideContextMenu(); });

activeList.addEventListener('contextmenu', handleItemContextMenu);
completedList.addEventListener('contextmenu', handleItemContextMenu);

function handleItemContextMenu(e) {
  const li = e.target.closest('li');
  if (!li) return;
  e.preventDefault();

  const id = li.dataset.id;
  ctxTargetId = id;
  ctxIsSubItem = li.classList.contains('sub-item');
  ctxParentId = null;

  if (ctxIsSubItem) {
    const parentLi = li.closest('li:not(.sub-item)');
    if (parentLi) ctxParentId = parentLi.dataset.id;
  }

  // If right-clicking on a non-selected active task, include it in selection context
  const isActive = li.closest('#active-list') !== null;
  if (isActive && !ctxIsSubItem && !li.classList.contains('locked')) {
    if (!selectedTaskIds.has(id)) {
      // If there's an existing selection, the user right-clicked outside it — focus on this one
      selectedTaskIds.clear();
      activeList.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    }
  }

  // Show merge option if we have 2+ selected active tasks (or selected + right-clicked)
  const mergeableIds = new Set(selectedTaskIds);
  if (isActive && !ctxIsSubItem && !li.classList.contains('locked') && !li.classList.contains('completed')) {
    mergeableIds.add(id);
  }

  if (mergeableIds.size >= 2) {
    ctxMerge.textContent = `Merge ${mergeableIds.size} tasks`;
    ctxMerge.classList.remove('hidden');
  } else {
    ctxMerge.classList.add('hidden');
  }

  showContextMenu(e.clientX, e.clientY);
}

// Context menu: Delete
ctxDelete.addEventListener('click', async (e) => {
  e.stopPropagation();

  // Capture values before hideContextMenu clears them
  const id = ctxTargetId;
  const isSubItem = ctxIsSubItem;
  const parentId = ctxParentId;
  hideContextMenu();

  if (!id) return;

  if (isSubItem && parentId) {
    const parent = appData.items.find((i) => i.id === parentId);
    if (parent && parent.children) {
      const child = parent.children.find((c) => c.id === id);
      if (child && await showConfirm(`Delete "${child.text}"?`)) {
        parent.children = parent.children.filter((c) => c.id !== id);
        save();
        renderChecklist();
      }
    }
    return;
  }

  const item = appData.items.find((i) => i.id === id);
  if (item && await showConfirm(`Delete "${item.text}"?`)) {
    appData.items = appData.items.filter((i) => i.id !== id);
    save();
    renderChecklist();
  }
});

// Context menu: Merge selected
ctxMerge.addEventListener('click', async (e) => {
  e.stopPropagation();

  // Capture target before hideContextMenu clears it
  const targetForMerge = ctxTargetId;
  hideContextMenu();

  // Collect all mergeable IDs (selected + right-click target)
  const mergeIds = new Set(selectedTaskIds);
  if (targetForMerge) mergeIds.add(targetForMerge);

  const ids = [...mergeIds].filter((id) => {
    const item = appData.items.find((i) => i.id === id);
    return item && !item.completed && !lockedTaskIds.has(id);
  });

  if (ids.length < 2) return;

  // Use the last item as the "target" (where merged result will appear)
  const targetId = ids.pop();
  const sourceIds = ids;

  if (sourceIds.length === 1) {
    await handleMerge(sourceIds[0], targetId);
  } else {
    await handleMultiMerge(sourceIds, targetId);
  }
});

// Per-task context button (event delegation)
activeList.addEventListener('click', (e) => {
  const ctxBtn = e.target.closest('.task-context-btn');
  if (ctxBtn) {
    e.preventDefault();
    const taskId = ctxBtn.dataset.id;
    const inputDiv = activeList.querySelector(`.task-context-input[data-for="${taskId}"]`);
    if (inputDiv) {
      inputDiv.classList.remove('hidden');
      const textarea = inputDiv.querySelector('textarea');
      textarea.focus();
      adjustWindowHeight();
      setTimeout(() => inputDiv.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
    return;
  }

  if (e.target.closest('.task-context-cancel')) {
    const inputDiv = e.target.closest('.task-context-input');
    if (inputDiv) {
      inputDiv.classList.add('hidden');
      inputDiv.querySelector('textarea').value = '';
      adjustWindowHeight();
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

  lockedTaskIds.add(taskId);
  renderChecklist();

  try {
    const updatedChildren = await window.api.processTaskContext(
      item.text,
      item.children || [],
      noteText
    );
    item.children = updatedChildren;
    await save();
  } catch (err) {
    handleOllamaError(err);
  } finally {
    lockedTaskIds.delete(taskId);
    renderChecklist(true);
  }
}

// ---- Multi-select (Shift + Drag to sweep-select) ----

// Shift+mousedown begins sweep selection
activeList.addEventListener('mousedown', (e) => {
  if (!isShiftHeld) return;
  if (e.target.closest('button, textarea')) return;

  const li = e.target.closest('#active-list > li.task-item');
  if (!li || li.classList.contains('locked') || li.classList.contains('completed')) return;

  e.preventDefault(); // Prevent drag initiation and text selection
  isSelecting = true;

  const id = li.dataset.id;
  selectedTaskIds.add(id);
  li.classList.add('selected');
});

// While sweeping, add every task the cursor enters
activeList.addEventListener('mouseover', (e) => {
  if (!isSelecting) return;

  const li = e.target.closest('#active-list > li.task-item');
  if (!li || li.classList.contains('locked') || li.classList.contains('completed')) return;

  const id = li.dataset.id;
  selectedTaskIds.add(id);
  li.classList.add('selected');
});

// Mouseup ends sweep
document.addEventListener('mouseup', () => {
  isSelecting = false;
});

// Prevent checkbox toggle and clear selection on normal click
activeList.addEventListener('click', (e) => {
  if (e.target.closest('button, textarea')) return;

  if (isShiftHeld) {
    e.preventDefault(); // Prevent checkbox toggle from label forwarding
    return;
  }

  // Clear selection on non-shift click
  if (selectedTaskIds.size > 0) {
    selectedTaskIds.clear();
    activeList.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
  }
});

// ---- Drag and Drop (merge task trees) ----
activeList.addEventListener('dragstart', (e) => {
  // Shift is for sweep-selection, not dragging
  if (isShiftHeld) {
    e.preventDefault();
    return;
  }

  const li = e.target.closest('#active-list > li');
  if (!li) return;

  const id = li.dataset.id;
  dragSourceIds.clear();

  // If dragging a selected item, drag all selected items
  if (selectedTaskIds.has(id) && selectedTaskIds.size > 1) {
    selectedTaskIds.forEach((sid) => dragSourceIds.add(sid));
  } else {
    // Single drag — clear any previous selection
    selectedTaskIds.clear();
    dragSourceIds.add(id);
  }

  dragSourceIds.forEach((sid) => {
    const el = activeList.querySelector(`li[data-id="${sid}"]`);
    if (el) el.classList.add('dragging');
  });

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);

  // Custom drag image for multi-drag
  if (dragSourceIds.size > 1) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = `${dragSourceIds.size} tasks`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => ghost.remove());
  }
});

activeList.addEventListener('dragend', () => {
  activeList.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  activeList.querySelectorAll('.drop-target, .drop-above, .drop-below').forEach((el) => {
    el.classList.remove('drop-target', 'drop-above', 'drop-below');
  });
  dragSourceIds.clear();
  dropMode = null;
});

activeList.addEventListener('dragover', (e) => {
  const li = e.target.closest('#active-list > li');
  if (!li || dragSourceIds.has(li.dataset.id)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  // Clear previous indicators
  activeList.querySelectorAll('.drop-target, .drop-above, .drop-below').forEach((el) => {
    el.classList.remove('drop-target', 'drop-above', 'drop-below');
  });

  // Determine zone: top 25% = reorder above, bottom 25% = reorder below, middle = merge
  const rect = li.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const ratio = y / rect.height;

  if (ratio < 0.25) {
    dropMode = 'reorder-above';
    li.classList.add('drop-above');
  } else if (ratio > 0.75) {
    dropMode = 'reorder-below';
    li.classList.add('drop-below');
  } else {
    dropMode = 'merge';
    li.classList.add('drop-target');
  }
});

activeList.addEventListener('dragleave', (e) => {
  const li = e.target.closest('#active-list > li');
  if (li && !li.contains(e.relatedTarget)) {
    li.classList.remove('drop-target', 'drop-above', 'drop-below');
    dropMode = null;
  }
});

activeList.addEventListener('drop', async (e) => {
  e.preventDefault();
  const targetLi = e.target.closest('#active-list > li');
  if (!targetLi || dragSourceIds.has(targetLi.dataset.id)) return;
  targetLi.classList.remove('drop-target', 'drop-above', 'drop-below');

  const sourceIds = [...dragSourceIds];
  const targetId = targetLi.dataset.id;
  const currentDropMode = dropMode;
  dragSourceIds.clear();
  dropMode = null;

  // Reorder mode — move tasks to new position
  if (currentDropMode === 'reorder-above' || currentDropMode === 'reorder-below') {
    handleReorder(sourceIds, targetId, currentDropMode);
    return;
  }

  // Merge mode (existing behavior)
  // Check if target is locked (currently merging) — queue instead
  if (lockedTaskIds.has(targetId)) {
    sourceIds.forEach((id) => {
      lockedTaskIds.add(id);
      queuedMergeIds.add(id);
    });
    mergeQueue.push({ sourceIds, targetId });
    renderChecklist();
    return;
  }

  if (sourceIds.length === 1) {
    await handleMerge(sourceIds[0], targetId);
  } else {
    await handleMultiMerge(sourceIds, targetId);
  }
});

function handleReorder(sourceIds, targetId, mode) {
  pushVersion();

  // Extract items being moved (preserve order)
  const movedItems = [];
  for (const id of sourceIds) {
    const idx = appData.items.findIndex((i) => i.id === id);
    if (idx !== -1) movedItems.push(appData.items[idx]);
  }
  if (movedItems.length === 0) return;

  // Remove moved items from array
  appData.items = appData.items.filter((i) => !sourceIds.includes(i.id));

  // Find new target index (after removal)
  let insertIdx = appData.items.findIndex((i) => i.id === targetId);
  if (insertIdx === -1) insertIdx = appData.items.length;
  if (mode === 'reorder-below') insertIdx += 1;

  // Insert at new position
  appData.items.splice(insertIdx, 0, ...movedItems);

  selectedTaskIds.clear();
  save();
  renderChecklist();
}

async function handleMerge(sourceId, targetId) {
  const source = appData.items.find((i) => i.id === sourceId);
  const target = appData.items.find((i) => i.id === targetId);
  if (!source || !target) return;

  pushInput(`[merge] "${source.text}" + "${target.text}"`, 'merge');
  pushVersion();

  lockedTaskIds.add(sourceId);
  lockedTaskIds.add(targetId);
  renderChecklist();

  try {
    const merged = await window.api.mergeTasks(source, target);

    lockedTaskIds.delete(sourceId);
    lockedTaskIds.delete(targetId);

    if (!merged) {
      showError('Could not merge tasks. Try again.');
      renderChecklist();
      processQueuedMerge([sourceId, targetId], null);
      return;
    }

    const targetIndex = appData.items.findIndex((i) => i.id === targetId);
    appData.items = appData.items.filter((i) => i.id !== sourceId && i.id !== targetId);
    appData.items.splice(Math.min(targetIndex, appData.items.length), 0, merged);

    await save();
    selectedTaskIds.clear();
    renderChecklist(true);
    processQueuedMerge([sourceId, targetId], merged.id);
  } catch (err) {
    lockedTaskIds.delete(sourceId);
    lockedTaskIds.delete(targetId);
    handleOllamaError(err);
    renderChecklist();
    processQueuedMerge([sourceId, targetId], null);
  }
}

async function handleMultiMerge(sourceIds, targetId) {
  const sources = sourceIds.map((id) => appData.items.find((i) => i.id === id)).filter(Boolean);
  const target = appData.items.find((i) => i.id === targetId);
  if (sources.length === 0 || !target) return;

  const allTasks = [...sources, target];
  const allIds = [...sourceIds, targetId];

  pushInput(`[merge] ${allTasks.map((t) => `"${t.text}"`).join(' + ')}`, 'merge');
  pushVersion();

  allIds.forEach((id) => lockedTaskIds.add(id));
  renderChecklist();

  try {
    const merged = await window.api.mergeMultipleTasks(allTasks);

    allIds.forEach((id) => lockedTaskIds.delete(id));

    if (!merged) {
      showError('Could not merge tasks. Try again.');
      renderChecklist();
      processQueuedMerge(allIds, null);
      return;
    }

    const targetIndex = appData.items.findIndex((i) => i.id === targetId);
    appData.items = appData.items.filter((i) => !allIds.includes(i.id));
    appData.items.splice(Math.min(targetIndex, appData.items.length), 0, merged);

    await save();
    selectedTaskIds.clear();
    renderChecklist(true);
    processQueuedMerge(allIds, merged.id);
  } catch (err) {
    allIds.forEach((id) => lockedTaskIds.delete(id));
    handleOllamaError(err);
    selectedTaskIds.clear();
    renderChecklist();
    processQueuedMerge(allIds, null);
  }
}

function processQueuedMerge(oldIds, newMergedId) {
  if (mergeQueue.length === 0) return;

  for (const entry of mergeQueue) {
    if (oldIds.includes(entry.targetId)) {
      if (newMergedId) {
        entry.targetId = newMergedId;
      } else {
        // Merge failed — unlock queued sources
        entry.sourceIds.forEach((id) => {
          lockedTaskIds.delete(id);
          queuedMergeIds.delete(id);
        });
        entry.failed = true;
      }
    }
  }

  mergeQueue = mergeQueue.filter((e) => !e.failed);

  if (mergeQueue.length === 0) {
    renderChecklist();
    return;
  }

  const next = mergeQueue.shift();
  next.sourceIds.forEach((id) => {
    queuedMergeIds.delete(id);
    lockedTaskIds.delete(id);
  });

  if (next.sourceIds.length === 1) {
    handleMerge(next.sourceIds[0], next.targetId);
  } else {
    handleMultiMerge(next.sourceIds, next.targetId);
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
  adjustWindowHeight();
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
    const model = appData.settings.ollamaModel || 'exaone3.5:2.4b';
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
// Measure desired window height by summing visible body children.
// force=true bypasses user-resize lock (used for panel toggles).
function adjustWindowHeight(force = false) {
  let h = 0;
  for (const child of document.body.children) {
    if (child.style.display === 'none') continue;
    if (child.classList.contains('hidden')) continue;
    const cs = getComputedStyle(child);
    if (cs.position === 'fixed' || cs.position === 'absolute') continue;

    if (child.id === 'checklist-section') {
      // Sum inner children to bypass flex-grow inflation
      for (const inner of child.children) {
        if (!inner.classList.contains('hidden')) h += inner.offsetHeight;
      }
      h += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    } else {
      h += child.offsetHeight;
    }
  }
  window.api.resizeWindow(h, force);
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
