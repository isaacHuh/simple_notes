const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  processNote: (text, context) => ipcRenderer.invoke('process-note', text, context),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  listModels: () => ipcRenderer.invoke('list-models'),
  hideWindow: () => ipcRenderer.send('hide-window'),
});
