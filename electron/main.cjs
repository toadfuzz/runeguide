const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

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
      sandbox: true,
    },
  });

  // Load the built frontend
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:4173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window control handlers
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());
  ipcMain.on('window-toggle-always-on-top', () => {
    currentAlwaysOnTop = !currentAlwaysOnTop;
    win.setAlwaysOnTop(currentAlwaysOnTop);
    win.webContents.send('always-on-top-changed', currentAlwaysOnTop);
  });
  ipcMain.handle('window-is-maximized', () => win.isMaximized());
  ipcMain.handle('window-get-always-on-top', () => currentAlwaysOnTop);

  win.on('maximize', () => win.webContents.send('window-maximized', true));
  win.on('unmaximize', () => win.webContents.send('window-maximized', false));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('always-on-top-changed', currentAlwaysOnTop);
  });

  mainWindow = win;
  return win;
}

// ── Fetch a URL using curl (bypasses Cloudflare) ──────────────────────────────
function fetchUrlcurl(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '-L', '-s', '-w', '\n__HTTP_CODE__:%{http_code}',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.5',
      '--connect-timeout', '10', '--max-time', '30',
      url,
    ];
    const child = spawn('curl', args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`curl exited ${code}: ${stderr}`));
      const httpMatch = stdout.match(/\n__HTTP_CODE__:(\d+)$/);
      const body = httpMatch ? stdout.replace(/\n__HTTP_CODE__:\d+$/, '') : stdout;
      const httpCode = httpMatch ? parseInt(httpMatch[1]) : 200;
      resolve({ body, httpCode });
    });
  });
}

// ── RuneWiki API helpers ───────────────────────────────────────────────────────
async function fetchRuneWikiPage(title) {
  // Normalize title
  const normalized = title.replace(/ /g, '_');
  const apiUrl = `https://runescape.wiki/api.php?action=parse&page=${encodeURIComponent(normalized)}&prop=sections|text&format=json`;

  let data;
  try {
    const { body, httpCode } = await fetchUrlcurl(apiUrl);
    if (httpCode !== 200) throw new Error(`API returned HTTP ${httpCode}`);
    data = JSON.parse(body);
  } catch (e) {
    throw new Error(`Failed to fetch wiki page: ${e.message}`);
  }

  const parse = data.parse;
  if (!parse) throw new Error(`No parse result for "${title}". Check the quest name.`);

  // Extract section list
  const sections = (parse.sections || []).map(s => ({ index: s.index, line: s.line, toclevel: s.toclevel }));

  // Walkthrough sections: toclevel=1 and not in skip list
  const skip = new Set([
    'official description', 'overview', 'rewards', 'achievements',
    'required for completing', 'gallery', 'transcript', 'credits',
    'update history', 'trivia', 'references', 'external links',
    'see also', 'quick guide', 'navigation', 'infobox',
  ]);

  const guideSections = [];
  for (const s of sections) {
    const lower = s.line.toLowerCase();
    if (!skip.has(lower) && !lower.includes('reward') && !lower.includes('achievement') && !lower.includes('gallery') && !lower.includes('trivia')) {
      guideSections.push(s);
    }
  }

  // Fetch each walkthrough section individually (avoids Cloudflare on full page)
  const steps = [];
  const seen = new Set();

  for (const sec of guideSections) {
    const sectionUrl = `https://runescape.wiki/api.php?action=parse&page=${encodeURIComponent(normalized)}&prop=text&section=${sec.index}&format=json`;
    try {
      const { body: secBody, httpCode: secCode } = await fetchUrlcurl(sectionUrl);
      if (secCode !== 200) continue;
      const secData = JSON.parse(secBody);
      const html = secData.parse?.text?.['*'] || '';
      const lines = extractStepsFromHtml(html, sec.line);
      for (const step of lines) {
        const key = step.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!seen.has(key) && key.length >= 8) {
          seen.add(key);
          steps.push({ text: step, kind: classifyStep(step) });
        }
      }
    } catch (e) {
      // Skip failing sections
    }
  }

  const titleText = parse.title || title;
  return { title: titleText, sourceUrl: `https://runescape.wiki/w/${normalized}`, sections: guideSections.map(s => s.line), steps };
}

function extractStepsFromHtml(html, sectionName) {
  // Strip HTML tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<ref[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*(?:navbox|infobox|metadata|notice|portal)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\[\[([^|\]]+)\]\]/g, '$1').replace(/\[\[[^|]*\|([^\]]+)\]\]/g, '$1')
    .replace(/{\{[^|{}]*\|([^}]+)\}\}/g, '$1').replace(/{\{([^|{}]+)\}\}/g, '$1')
    .replace(/\[edit[^\]]*\]/gi, '').replace(/\|[\w\s]+'}/g, ' ')
    .replace(/\s{2,}/g, ' ').trim();

  const lines = [];
  const rawLines = text.split(/[\.\n\r]/);

  for (const raw of rawLines) {
    let line = raw.replace(/^[\s\-\–\:]+/, '').trim();
    if (line.length < 8) continue;

    // Numbered: "1 Do X" or "1. Do X"
    const numbered = line.match(/^\d+[\.\)]\s+(.+)/);
    if (numbered) { line = numbered[1].trim(); }

    // Bullets: "- Do X"
    const bulleted = line.match(/^[-–—•]\s+(.+)/);
    if (bulleted) { line = bulleted[1].trim(); }

    line = line.replace(/^[\s\-\–\:]+/, '').trim();
    if (line.length < 8) continue;

    // Skip lines that look like requirements tables or infobox
    if (/^(needed|recommended|release|quest|members|difficulty|length|combat|voice|series|age|timeline|requirement|skill|frequency|artist|developer|writer|QA|audio|graphics|questhelp|jagex|update|patch|type|date)/i.test(line)) continue;
    // Skip lines with lots of commas in a row (table data)
    if ((line.match(/,/g) || []).length > 6) continue;

    if (looksLikeStep(line)) {
      lines.push(line.charAt(0).toUpperCase() + line.slice(1));
    }
  }

  return lines;
}

const STEP_VERBS = new Set([
  'talk', 'go', 'head', 'walk', 'travel', 'enter', 'exit', 'climb', 'pick',
  'take', 'use', 'open', 'close', 'kill', 'fight', 'attack', 'bank', 'teleport',
  'buy', 'purchase', 'give', 'search', 'dig', 'mine', 'chop', 'craft', 'cook',
  'place', 'push', 'pull', 'fill', 'light', 'cut', 'break', 'unlock', 'activate',
  'stand', 'sit', 'return', 'bring', 'fetch', 'collect', 'obtain', 'get', 'find',
  'equip', 'wield', 'wear', 'drop', 'speak', 'ask', 'tell', 'say', 'reply', 'answer',
  'read', 'inspect', 'examine', 'check', 'look', 'listen', 'show', 'solve',
  'switch', 'toggle', 'set', 'choose', 'select', 'complete', 'finish', 'start',
  'lead', 'escort', 'follow', 'meet', 'agree', 'refuse', 'explain', 'describe',
]);

const STEP_SECOND = new Set(['to', 'the', 'a', 'an', 'your', 'him', 'her', 'them', 'it']);

function looksLikeStep(text) {
  const words = text.toLowerCase().split(/\s+/);
  const first = words[0];
  const second = words[1];
  if (STEP_VERBS.has(first)) return true;
  if (STEP_SECOND.has(first) && STEP_VERBS.has(second)) return true;
  if (/^\d+[\.\)]/.test(text)) return true;
  return false;
}

function classifyStep(text) {
  const lower = text.toLowerCase();
  if (/\b(talk|speak|ask|tell|say|reply|answer|agree|respond)\b/.test(lower)) return 'dialogue';
  if (/\b(go|head|walk|travel|enter|climb|teleport|approach|leave|exit|return|stand|sit|run|fly|sail)\b/.test(lower)) return 'movement';
  if (/\b(kill|fight|attack|defeat|strike|shoot|cast|punch|kick|smash)\b/.test(lower)) return 'action';
  if (/\b(use|click|operate|activate|deactivate|push|pull|touch|place|fill|pour|insert|turn|hold)\b/.test(lower)) return 'interaction';
  return 'general';
}

// ── IPC handlers ───────────────────────────────────────────────────────────────
ipcMain.handle('import-quest', async (event, { title }) => {
  try {
    const guide = await fetchRuneWikiPage(title);
    return { ok: true, guide };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('search-quests', async (event, { query }) => {
  if (!query || query.length < 2) return [];
  const { body, httpCode } = await fetchUrlcurl(
    `https://runescape.wiki/api.php?action=opensearch&search=${encodeURIComponent(query + ' quest')}&limit=10&namespace=0&format=json`
  );
  if (httpCode !== 200) return [];
  try {
    const [,, titles] = JSON.parse(body);
    return titles;
  } catch {
    return [];
  }
});

ipcMain.handle('get-saved-quests', async () => {
  const filePath = path.join(app.getPath('userData'), 'saved-quests.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

ipcMain.handle('save-quest', async (event, { guide }) => {
  const filePath = path.join(app.getPath('userData'), 'saved-quests.json');
  let saved = [];
  try {
    const data = await fs.readFile(filePath, 'utf8');
    saved = JSON.parse(data);
  } catch { /* ignore */ }

  // Dedupe by title
  saved = saved.filter(s => s.title !== guide.title);
  saved.unshift({ title: guide.title, sourceUrl: guide.sourceUrl, savedAt: Date.now() });
  if (saved.length > 20) saved = saved.slice(0, 20);
  await fs.writeFile(filePath, JSON.stringify(saved, null, 2));
  return saved;
});

ipcMain.handle('delete-saved-quest', async (event, { title }) => {
  const filePath = path.join(app.getPath('userData'), 'saved-quests.json');
  let saved = [];
  try {
    const data = await fs.readFile(filePath, 'utf8');
    saved = JSON.parse(data);
  } catch { /* ignore */ }
  saved = saved.filter(s => s.title !== title);
  await fs.writeFile(filePath, JSON.stringify(saved, null, 2));
  return saved;
});

ipcMain.handle('get-current-guide', async () => {
  const filePath = path.join(app.getPath('userData'), 'current-guide.json');
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
});

ipcMain.handle('save-current-guide', async (event, { guide }) => {
  const filePath = path.join(app.getPath('userData'), 'current-guide.json');
  await fs.writeFile(filePath, JSON.stringify(guide, null, 2));
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});