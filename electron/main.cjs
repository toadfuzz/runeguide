const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { fetchRuneWikiGuide } = require('./rune-parser.cjs');

let mainWindow;
let storedQuest = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    frame: false,
    transparent: false,
    backgroundColor: '#0b1110',
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const prodIndex = path.join(app.getAppPath(), 'dist', 'index.html');
  if (app.isPackaged) {
    console.log(`Loading packaged UI: ${prodIndex}`);
    mainWindow.loadFile(prodIndex);
  } else {
    console.log(`Loading dev UI: ${devUrl}`);
    mainWindow.loadURL(devUrl);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('quest:save', async (_event, quest) => {
  storedQuest = quest;
  const file = path.join(app.getPath('userData'), 'quests.json');
  await fs.writeFile(file, JSON.stringify({ quest }, null, 2), 'utf8');
  return { ok: true };
});

ipcMain.handle('quest:load', async () => {
  if (storedQuest) return storedQuest;
  const file = path.join(app.getPath('userData'), 'quests.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    storedQuest = parsed.quest ?? null;
    return storedQuest;
  } catch {
    return null;
  }
});

ipcMain.handle('quest:import', async (_event, source) => {
  if (!source || typeof source !== 'string') {
    throw new Error('Quest title or URL is required.');
  }
  const guide = await fetchRuneWikiGuide(source.trim());
  storedQuest = guide;
  return guide;
});
