const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  processNote: (text) => ipcRenderer.invoke('process-note', text),
  mergeTasks: (taskA, taskB) => ipcRenderer.invoke('merge-tasks', taskA, taskB),
  mergeMultipleTasks: (tasks) => ipcRenderer.invoke('merge-multiple-tasks', tasks),
  processTaskContext: (parentText, existingChildren, noteText) =>
    ipcRenderer.invoke('process-task-context', parentText, existingChildren, noteText),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  listModels: () => ipcRenderer.invoke('list-models'),
  pullModel: (model) => ipcRenderer.invoke('pull-model', model),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onPullProgress: (callback) => {
    ipcRenderer.on('pull-progress', (_event, data) => callback(data));
  },
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  resizeWindow: (height, force) => ipcRenderer.send('resize-window', height, force),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  openSettings: () => ipcRenderer.send('open-settings'),
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (_event, data) => callback(data));
  },
});
