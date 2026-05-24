const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let currentAlwaysOnTop = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 750,
    minWidth: 800, minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:4173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window controls — lowercase channels matching preload
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.on('window:close', () => win.close());
  ipcMain.on('window:toggleAlwaysOnTop', () => {
    currentAlwaysOnTop = !currentAlwaysOnTop;
    win.setAlwaysOnTop(currentAlwaysOnTop);
    win.webContents.send('always-on-top-changed', currentAlwaysOnTop);
  });
  ipcMain.handle('window:isMaximized', () => win.isMaximized());
  ipcMain.handle('window:getAlwaysOnTop', () => currentAlwaysOnTop);

  win.on('maximize', () => win.webContents.send('window-maximized', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized', false));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('always-on-top-changed', currentAlwaysOnTop);
  });

  mainWindow = win;
  return win;
}

function fetchUrlcurl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', [
      '-L', '-s', '-w', '\n__HTTP_CODE__:%{http_code}',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      '--connect-timeout', '10', '--max-time', '30', url,
    ]);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`curl exited ${code}`));
      const idx = stdout.lastIndexOf('\n__HTTP_CODE__:');
      if (idx === -1) return reject(new Error('No HTTP status in response'));
      const body = stdout.slice(0, idx);
      const status = parseInt(stdout.slice(idx + 14));
      resolve({ status, body });
    });
  });
}

function parseRuneWikiHtml(html) {
  const steps = [];
  const seen = new Set();

  // Try finding sections by id + mw-headline
  const re = /<h([23])\s[^>]*id="([^"]*)"[^>]*>[\s\S]*?<span[^>]*class="mw-headline"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[2].trim();
    const raw = m[3].replace(/<[^>]+>/g, '').trim();
    if (!id || !raw || seen.has(id)) continue;
    if (/^(?:edit|see also|references|coordinates|quick guide|walkthrough)$/i.test(raw)) continue;
    seen.add(id);
    const kind = /\b(?:talk|chat|speak|ask|tell|dialogue)\b/i.test(raw) ? 'dialogue'
      : /\b(?:click|use|interact|open|enter|go to|walk to|travel to)\b/i.test(raw) ? 'interaction'
      : /\b(?:run|walk|move|head|navigate|go south|north|east|west|through|climb|trek)\b/i.test(raw) ? 'movement'
      : /\b(?:kill|attack|fight|combat|pick up|collect|mine|cut)\b/i.test(raw) ? 'action'
      : 'general';
    steps.push({ id, title: raw, kind, text: raw });
  }

  // Fallback: split by h2 and extract text
  if (steps.length === 0) {
    const parts = html.split(/<h2[^>]*>/i);
    for (let i = 1; i < parts.length && steps.length < 30; i++) {
      const h = parts[i];
      const headMatch = h.match(/class="mw-headline"[^>]*>([^<]+)/i);
      const paraMatch = h.match(/<p>([\s\S]*?)<\/p>/);
      if (headMatch) {
        const title = headMatch[1].replace(/<[^>]+>/g, '').trim();
        const text = paraMatch ? paraMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 200) : '';
        if (title && title.length > 3) {
          steps.push({ id: `s${i}`, title, kind: 'general', text });
        }
      }
    }
  }

  return steps;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => { createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── IPC: Import quest from RuneScape Wiki ─────────────────────────────────────
ipcMain.handle('quest:import', async (event, { title }) => {
  if (!title || !title.trim()) return { error: 'No title provided' };
  try {
    const encoded = encodeURIComponent(title.trim().replace(/ /g, '_'));
    const { status, body } = await fetchUrlcurl(
      `https://runescape.wiki/api.php?action=parse&page=${encoded}&format=json&prop=text`
    );
    if (status !== 200) return { error: `HTTP ${status} — check your internet connection` };
    let parsed;
    try { parsed = JSON.parse(body); } catch { return { error: 'Malformed response from wiki' }; }
    if (!parsed?.parse) return { error: `Page "${title}" not found on wiki` };
    const text = parsed.parse.text?.['*'] || '';
    const steps = parseRuneWikiHtml(text);
    if (!steps.length) return { error: 'Could not parse walkthrough sections from this page' };
    return {
      guide: {
        title: parsed.parse.title || title,
        sourceUrl: `https://runescape.wiki/${encoded}`,
        sections: [],
        steps,
      },
    };
  } catch (e) {
    return { error: `Network error: ${e.message}` };
  }
});

// ── IPC: Search quests on RuneScape Wiki ──────────────────────────────────────
ipcMain.handle('search:query', async (event, { query }) => {
  if (!query || !query.trim()) return [];
  try {
    const { status, body } = await fetchUrlcurl(
      `https://runescape.wiki/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&namespace=0&format=json`
    );
    if (status !== 200) return [];
    const parsed = JSON.parse(body);
    return Array.isArray(parsed[1]) ? parsed[1] : [];
  } catch { return []; }
});

// ── IPC: Get wiki page URL for a quest title ───────────────────────────────────
ipcMain.handle('search:pageUrl', async (event, { title }) => {
  if (!title) return '';
  return `https://runescape.wiki/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`;
});

// ── IPC: Persistent quest storage (JSON file in app data) ────────────────────
const questPath = path.join(app.getPath('userData'), 'saved_quests.json');

function readQuests() {
  try { return JSON.parse(fs.readFileSync(questPath, 'utf8')); } catch { return []; }
}
function writeQuests(list) {
  fs.writeFileSync(questPath, JSON.stringify(list, null, 2));
}

ipcMain.handle('quest:load', async () => readQuests());
ipcMain.handle('quest:save', async (event, { guide }) => {
  if (!guide?.title) return { error: 'Invalid guide' };
  const list = readQuests();
  const idx = list.findIndex(q => q.title === guide.title);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(guide);
  writeQuests(list.slice(0, 30));
  return { ok: true };
});
ipcMain.handle('quest:delete', async (event, { title }) => {
  const list = readQuests().filter(q => q.title !== title);
  writeQuests(list);
  return { ok: true };
});