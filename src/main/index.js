const { app, ipcMain, Menu, shell } = require('electron');
const { menubar } = require('menubar');
const path = require('path');
const store = require('./store');
const ollama = require('./ollama');
const { parseChecklist, parseSubItems } = require('./parser');

const isDev = !app.isPackaged;
const assetsPath = isDev
  ? path.join(__dirname, '../../assets')
  : path.join(process.resourcesPath, 'assets');

const mb = menubar({
  index: `file://${path.join(__dirname, '../renderer/index.html')}`,
  icon: path.join(assetsPath, 'IconTemplate.png'),
  preloadWindow: true,
  tooltip: 'Sticky',
  browserWindow: {
    width: 400,
    height: 500,
    frame: false,
    resizable: false,
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

mb.on('ready', () => {
  // Hide dock icon on macOS
  if (app.dock) {
    app.dock.hide();
  }

  // Right-click context menu on tray
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => mb.showWindow() },
    { type: 'separator' },
    { label: 'Preferences...', enabled: false },
    { type: 'separator' },
    { label: 'Quit Sticky', click: () => app.quit() },
  ]);

  mb.tray.on('right-click', () => {
    mb.tray.popUpContextMenu(contextMenu);
  });
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
    const clamped = Math.min(Math.max(Math.round(height), 120), 800);
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

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
