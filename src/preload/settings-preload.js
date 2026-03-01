const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),
  listModels: () => ipcRenderer.invoke('list-models'),
  pullModel: (model) => ipcRenderer.invoke('pull-model', model),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  onPullProgress: (cb) => {
    ipcRenderer.on('pull-progress', (_event, data) => cb(data));
  },
  onSettingsChanged: (cb) => {
    ipcRenderer.on('settings-changed', (_event, data) => cb(data));
  },
  closeSettings: () => ipcRenderer.send('close-settings'),
});
