const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questBridge', {
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  // Quests
  saveQuest: (quest) => ipcRenderer.invoke('quest:save', quest),
  loadQuests: () => ipcRenderer.invoke('quest:load'),
  deleteQuest: (title) => ipcRenderer.invoke('quest:delete', title),
  importQuest: (query) => ipcRenderer.invoke('quest:import', query),
  // Search
  searchQuests: (term) => ipcRenderer.invoke('search:query', term),
  getPageUrl: (title) => ipcRenderer.invoke('search:pageUrl', title),
});