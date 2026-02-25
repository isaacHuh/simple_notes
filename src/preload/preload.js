const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  processNote: (text) => ipcRenderer.invoke('process-note', text),
  processTaskContext: (parentText, existingChildren, noteText) =>
    ipcRenderer.invoke('process-task-context', parentText, existingChildren, noteText),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  listModels: () => ipcRenderer.invoke('list-models'),
  hideWindow: () => ipcRenderer.send('hide-window'),
});
