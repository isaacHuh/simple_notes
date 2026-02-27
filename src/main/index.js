const { app, ipcMain, Menu, shell } = require('electron');
const os = require('os');
const { menubar } = require('menubar');
const path = require('path');
const store = require('./store');
const ollama = require('./ollama');
const { parseChecklist, parseSubItems } = require('./parser');

const isDev = !app.isPackaged;
const assetsPath = isDev
  ? path.join(__dirname, '../../assets')
  : path.join(process.resourcesPath, 'assets');

// ── Update Check ──
const REPO_OWNER = 'isaacHuh';
const REPO_NAME = 'simple_notes';
let updateState = { status: 'idle', latestVersion: null, downloadUrl: null };
// status: 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error'

async function checkForUpdate() {
  updateState = { status: 'checking', latestVersion: null, downloadUrl: null };
  rebuildContextMenu();

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Sticky-App' } }
    );

    if (!res.ok) {
      updateState = { status: 'error', latestVersion: null, downloadUrl: null };
      rebuildContextMenu();
      return updateState;
    }

    const release = await res.json();
    const latestTag = release.tag_name || '';
    const latestVersion = latestTag.replace(/^v/, '');
    const currentVersion = app.getVersion();
    const downloadUrl = release.html_url;

    if (isNewerVersion(latestVersion, currentVersion)) {
      updateState = { status: 'update-available', latestVersion, downloadUrl };
    } else {
      updateState = { status: 'up-to-date', latestVersion, downloadUrl: null };
    }
  } catch {
    updateState = { status: 'error', latestVersion: null, downloadUrl: null };
  }

  rebuildContextMenu();
  return updateState;
}

function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

const mb = menubar({
  index: `file://${path.join(__dirname, '../renderer/index.html')}`,
  icon: path.join(assetsPath, 'IconTemplate.png'),
  preloadWindow: true,
  tooltip: 'Sticky',
  browserWindow: {
    width: 400,
    height: 500,
    minWidth: 300,
    minHeight: 200,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#131318',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  },
});

let currentContextMenu = null;

function rebuildContextMenu() {
  if (!mb.tray) return;

  let updateItem;
  switch (updateState.status) {
    case 'checking':
      updateItem = { label: 'Checking for Updates...', enabled: false };
      break;
    case 'update-available':
      updateItem = {
        label: `Update Available (v${updateState.latestVersion})`,
        click: () => {
          if (updateState.downloadUrl) {
            shell.openExternal(updateState.downloadUrl);
          }
        },
      };
      break;
    case 'up-to-date':
      updateItem = { label: 'Up to Date', enabled: false };
      break;
    case 'error':
      updateItem = { label: 'Check for Updates', click: () => checkForUpdate() };
      break;
    default:
      updateItem = { label: 'Check for Updates', click: () => checkForUpdate() };
      break;
  }

  currentContextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => mb.showWindow() },
    { type: 'separator' },
    updateItem,
    { type: 'separator' },
    { label: 'Preferences...', enabled: false },
    { type: 'separator' },
    { label: 'Quit Sticky', click: () => app.quit() },
  ]);
}

mb.on('ready', () => {
  // Hide dock icon on macOS
  if (app.dock) {
    app.dock.hide();
  }

  // Set up right-click handler once, referencing the current menu
  mb.tray.on('right-click', () => {
    if (currentContextMenu) {
      mb.tray.popUpContextMenu(currentContextMenu);
    }
  });

  // Build initial context menu and check for updates
  rebuildContextMenu();
  checkForUpdate();
});

// --- IPC Handlers ---

ipcMain.handle('load-data', () => {
  return store.loadData();
});

ipcMain.handle('save-data', (_event, data) => {
  store.saveData(data);
  return true;
});

ipcMain.handle('process-note', async (_event, text) => {
  const data = store.loadData();
  const model = data.settings.ollamaModel;
  const baseUrl = data.settings.ollamaUrl;

  const response = await ollama.processNote(text, model, baseUrl);
  const items = parseChecklist(response);
  return items;
});

ipcMain.handle('merge-tasks', async (_event, taskA, taskB) => {
  const data = store.loadData();
  const model = data.settings.ollamaModel;
  const baseUrl = data.settings.ollamaUrl;

  const response = await ollama.mergeTasks(taskA, taskB, model, baseUrl);
  const items = parseChecklist(response);
  return items[0] || null;
});

ipcMain.handle('merge-multiple-tasks', async (_event, tasks) => {
  const data = store.loadData();
  const model = data.settings.ollamaModel;
  const baseUrl = data.settings.ollamaUrl;

  const response = await ollama.mergeMultipleTasks(tasks, model, baseUrl);
  const items = parseChecklist(response);
  return items[0] || null;
});

ipcMain.handle('process-task-context', async (_event, parentText, existingChildren, noteText) => {
  const data = store.loadData();
  const model = data.settings.ollamaModel;
  const baseUrl = data.settings.ollamaUrl;

  const response = await ollama.processTaskContext(parentText, existingChildren, noteText, model, baseUrl);
  const children = parseSubItems(response);
  return children;
});

ipcMain.handle('check-ollama', async () => {
  const data = store.loadData();
  return ollama.healthCheck(data.settings.ollamaUrl);
});

ipcMain.handle('list-models', async () => {
  const data = store.loadData();
  return ollama.listModels(data.settings.ollamaUrl);
});

ipcMain.on('hide-window', () => {
  mb.hideWindow();
});

ipcMain.on('resize-window', (_event, height) => {
  const win = mb.window;
  if (win) {
    const [width] = win.getSize();
    const clamped = Math.max(Math.round(height), 120);
    win.setSize(width, clamped);
  }
});

ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('pull-model', async (_event, model) => {
  const data = store.loadData();
  const baseUrl = data.settings.ollamaUrl || 'http://localhost:11434';
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pull failed (${res.status}): ${text}`);
  }

  const win = mb.window;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (win && !win.isDestroyed()) {
          win.webContents.send('pull-progress', json);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return true;
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('get-system-info', () => {
  return {
    totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3)),
  };
});

ipcMain.handle('check-for-updates', async () => {
  return checkForUpdate();
});

ipcMain.handle('get-update-status', () => {
  return updateState;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
