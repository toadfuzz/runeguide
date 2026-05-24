const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questBridge', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('window:toggleAlwaysOnTop'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop'),
  onAlwaysOnTopChanged: (cb) => {
    ipcRenderer.on('always-on-top-changed', (e, v) => cb(v));
  },
  onMaximizedChanged: (cb) => {
    ipcRenderer.on('window-maximized', (e, v) => cb(v));
  },
  // Quest management
  importQuest: (title) => ipcRenderer.invoke('quest:import', { title }),
  searchQuests: (term) => ipcRenderer.invoke('search:query', { query: term }),
  getPageUrl: (title) => ipcRenderer.invoke('search:pageUrl', { title }),
  saveQuest: (guide) => ipcRenderer.invoke('quest:save', { guide }),
  loadQuests: () => ipcRenderer.invoke('quest:load'),
  deleteQuest: (title) => ipcRenderer.invoke('quest:delete', { title }),
});