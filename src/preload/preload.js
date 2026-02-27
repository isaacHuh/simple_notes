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
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),
});
