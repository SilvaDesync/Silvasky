const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-desktop-sources'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  sendLog: (logData) => ipcRenderer.send('log-entry', logData),
  onNewLog: (callback) => ipcRenderer.on('new-log', (event, value) => callback(value)),
  connectExternalApp: (port) => ipcRenderer.invoke('connect-external-app', port)
});
