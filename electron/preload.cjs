const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('questBridge', {
  saveQuest: (quest) => ipcRenderer.invoke('quest:save', quest),
  loadQuest: () => ipcRenderer.invoke('quest:load'),
  importQuest: (source) => ipcRenderer.invoke('quest:import', source),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close')
});