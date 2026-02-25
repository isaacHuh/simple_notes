// ---- State ----
let appData = { items: [], settings: {} };

// ---- DOM References ----
const activeList = document.getElementById('active-list');
const completedList = document.getElementById('completed-list');
const emptyState = document.getElementById('empty-state');
const completedCount = document.getElementById('completed-count');
const completedToggle = document.getElementById('completed-toggle');
const clearCompletedBtn = document.getElementById('clear-completed');
const noteInput = document.getElementById('note-input');
const contextInput = document.getElementById('context-input');
const contextSection = document.getElementById('context-section');
const addContextBtn = document.getElementById('add-context-btn');
const submitBtn = document.getElementById('submit-btn');
const statusIndicator = document.getElementById('status-indicator');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const errorDismiss = document.getElementById('error-dismiss');
const loadingOverlay = document.getElementById('loading-overlay');

// ---- Initialization ----
async function init() {
  appData = await window.api.loadData();
  renderChecklist();
  checkOllamaStatus();
}

// ---- Rendering ----
function renderChecklist() {
  const active = appData.items.filter((i) => !i.completed);
  const completed = appData.items.filter((i) => i.completed);

  activeList.innerHTML = active.map((item) => createItemHTML(item)).join('');
  completedList.innerHTML = completed.map((item) => createItemHTML(item, true)).join('');

  completedCount.textContent = completed.length;

  // Show/hide empty state
  if (active.length === 0 && completed.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  // Show/hide completed section
  if (completed.length > 0) {
    document.getElementById('completed-section').style.display = '';
    clearCompletedBtn.classList.toggle('hidden', completedList.classList.contains('collapsed'));
  } else {
    document.getElementById('completed-section').style.display = 'none';
  }
}

function createItemHTML(item, isCompleted) {
  return `<li data-id="${item.id}" class="${isCompleted ? 'completed' : ''}">
      <label>
        <input type="checkbox" ${item.completed ? 'checked' : ''}>
        <span class="item-text">${escapeHtml(item.text)}</span>
      </label>
    </li>`;
}

// ---- Event Handlers ----

// Checkbox changes (event delegation)
activeList.addEventListener('change', handleCheckboxChange);
completedList.addEventListener('change', handleCheckboxChange);

function handleCheckboxChange(e) {
  if (e.target.type !== 'checkbox') return;
  const li = e.target.closest('li');
  if (!li) return;
  const id = li.dataset.id;
  const item = appData.items.find((i) => i.id === id);
  if (item) {
    item.completed = e.target.checked;
    save();
    renderChecklist();
  }
}

// Right-click to delete (event delegation)
activeList.addEventListener('contextmenu', handleItemContextMenu);
completedList.addEventListener('contextmenu', handleItemContextMenu);

function handleItemContextMenu(e) {
  const li = e.target.closest('li');
  if (!li) return;
  e.preventDefault();
  const id = li.dataset.id;
  const item = appData.items.find((i) => i.id === id);
  if (item && confirm(`Delete "${item.text}"?`)) {
    appData.items = appData.items.filter((i) => i.id !== id);
    save();
    renderChecklist();
  }
}

// Toggle completed section
completedToggle.addEventListener('click', () => {
  completedList.classList.toggle('collapsed');
  completedToggle.classList.toggle('expanded');
  clearCompletedBtn.classList.toggle('hidden', completedList.classList.contains('collapsed'));
});

// Clear completed
clearCompletedBtn.addEventListener('click', () => {
  const count = appData.items.filter((i) => i.completed).length;
  if (confirm(`Clear ${count} completed item${count !== 1 ? 's' : ''}?`)) {
    appData.items = appData.items.filter((i) => !i.completed);
    save();
    renderChecklist();
  }
});

// Add Context toggle
addContextBtn.addEventListener('click', () => {
  contextSection.classList.toggle('hidden');
  if (!contextSection.classList.contains('hidden')) {
    contextInput.focus();
  }
});

// Submit / Process
submitBtn.addEventListener('click', handleSubmit);

// Allow Ctrl/Cmd+Enter to submit
noteInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    handleSubmit();
  }
});

async function handleSubmit() {
  const noteText = noteInput.value.trim();
  if (!noteText) return;

  const context = contextInput.value.trim();
  showLoading(true);
  submitBtn.disabled = true;

  try {
    const newItems = await window.api.processNote(noteText, context);
    if (newItems.length === 0) {
      showError('Could not extract any checklist items. Try rephrasing your note.');
    } else {
      appData.items.push(...newItems);
      await save();
      renderChecklist();
      noteInput.value = '';
      contextInput.value = '';
      contextSection.classList.add('hidden');
    }
  } catch (err) {
    if (err.message.includes('fetch') || err.message.includes('ECONNREFUSED')) {
      showError('Ollama is not running. Start it with: ollama serve');
    } else if (err.message.includes('404') || err.message.includes('not found')) {
      const model = appData.settings.ollamaModel || 'qwen2.5:7b';
      showError(`Model not found. Run: ollama pull ${model}`);
    } else {
      showError(err.message);
    }
  } finally {
    showLoading(false);
    submitBtn.disabled = false;
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

// Check every 30 seconds
setInterval(checkOllamaStatus, 30000);

// ---- UI Helpers ----
function showLoading(visible) {
  loadingOverlay.classList.toggle('hidden', !visible);
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    errorBanner.classList.add('hidden');
  }, 8000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
