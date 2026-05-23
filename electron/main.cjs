/**
 * RuneGuide — RuneScape 3 Quest Companion
 * electron/main.cjs — Main process
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const https = require('node:https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RuneGuide/1.0 (Electron; contact@runeguide.app)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse response')); }
      });
    }).on('error', reject);
  });
}

// ─── Quest Storage ─────────────────────────────────────────────────────────────

const questsFile = () => path.join(app.getPath('userData'), 'quests.json');

async function readQuests() {
  try {
    const raw = await fs.readFile(questsFile(), 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

async function writeQuests(data) {
  await fs.writeFile(questsFile(), JSON.stringify(data, null, 2), 'utf8');
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    frame: false,
    transparent: false,
    backgroundColor: '#0b0f0e',
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());

// ─── Window Controls ─────────────────────────────────────────────────────────

ipcMain.handle('window:toggleAlwaysOnTop', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next);
  return next;
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:close', () => mainWindow?.close());

// ─── Quest Persistence ────────────────────────────────────────────────────────

ipcMain.handle('quest:save', async (_event, quest) => {
  const quests = await readQuests();
  const key = quest.title.toLowerCase().replace(/\s+/g, '_');
  quests[key] = { ...quest, savedAt: Date.now() };
  await writeQuests(quests);
  return { ok: true };
});

ipcMain.handle('quest:load', async () => {
  const quests = await readQuests();
  const list = Object.values(quests).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return list;
});

ipcMain.handle('quest:delete', async (_event, title) => {
  const quests = await readQuests();
  const key = title.toLowerCase().replace(/\s+/g, '_');
  delete quests[key];
  await writeQuests(quests);
  return { ok: true };
});

ipcMain.handle('quest:import', async (_event, query) => {
  if (!query || typeof query !== 'string') throw new Error('Quest title or URL is required.');

  // Normalise RuneWiki URL → page title
  let pageTitle = query.trim();
  const urlMatch = pageTitle.match(/runescape\.wiki\/w\/(.+?)(?:\/|$)/);
  if (urlMatch) pageTitle = decodeURIComponent(urlMatch[1].replace(/_/g, ' '));

  // Fetch via API
  const encoded = encodeURIComponent(pageTitle);
  const [htmlData, searchData] = await Promise.all([
    fetchJson(`https://runescape.wiki/api.php?action=parse&page=${encoded}&format=json&prop=text`),
    fetchJson(`https://runescape.wiki/api.php?action=opensearch&search=${encoded}&format=json&limit=1`),
  ]);

  const html = htmlData.parse?.text?.['*'] || '';
  if (!html) throw new Error(`No content found for "${pageTitle}".`);

  const { parseRuneWikiHtml } = require('./rune-parser.cjs');
  const guide = parseRuneWikiHtml(html, `https://runescape.wiki/${encoded.replace(/%/g, '%25')}`);
  return { ...guide, title: searchData[1]?.[0] || pageTitle };
});

// ─── Search ───────────────────────────────────────────────────────────────────

ipcMain.handle('search:query', async (_event, term) => {
  if (!term || term.length < 2) return [];
  const encoded = encodeURIComponent(term.trim());
  const data = await fetchJson(
    `https://runescape.wiki/api.php?action=opensearch&search=${encoded}&format=json&limit=8`
  );
  return data[1] || [];
});

ipcMain.handle('search:pageUrl', async (_event, title) => {
  const encoded = encodeURIComponent(title);
  const data = await fetchJson(
    `https://runescape.wiki/api.php?action=parse&page=${encoded}&format=json&prop=text`
  );
  const exists = data.parse?.text?.['*'];
  return exists ? `https://runescape.wiki/${encoded}` : null;
});