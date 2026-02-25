const { app, ipcMain, Menu } = require('electron');
const { menubar } = require('menubar');
const path = require('path');
const store = require('./store');
const ollama = require('./ollama');
const { parseChecklist } = require('./parser');

const isDev = !app.isPackaged;
const assetsPath = isDev
  ? path.join(__dirname, '../../assets')
  : path.join(process.resourcesPath, 'assets');

const mb = menubar({
  index: `file://${path.join(__dirname, '../renderer/index.html')}`,
  icon: path.join(assetsPath, 'IconTemplate.png'),
  preloadWindow: true,
  tooltip: 'SimpleNotes',
  browserWindow: {
    width: 380,
    height: 600,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
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
    { label: 'Quit SimpleNotes', click: () => app.quit() },
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

ipcMain.handle('process-note', async (_event, text, context) => {
  const data = store.loadData();
  const model = data.settings.ollamaModel;
  const baseUrl = data.settings.ollamaUrl;

  const response = await ollama.processNote(text, context, model, baseUrl);
  const items = parseChecklist(response);
  return items;
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

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
