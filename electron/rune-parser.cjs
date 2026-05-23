/**
 * RuneGuide — RuneScape Wiki parser
 * Uses the RuneWiki API to fetch and parse quest pages section by section.
 */

const WALKTHROUGH_SKIP = new Set([
  'official description', 'overview', 'rewards', 'achievements',
  'required for completing', 'gallery', 'transcript', 'credits',
  'update history', 'trivia', 'references', 'external links',
  'see also', 'related achievements', 'quick guide', 'navigation',
]);

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
}

function htmlToPlain(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<ref[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*(?:navbox|infobox|metadata|portal|notice)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/{{\[edit\]\|?\s*/gi, '')
    .replace(/\[\[File:[^\]]+\]\]/gi, ' ')
    .replace(/\[\[(?:File|Image):[^\]]+\|([^\]]+)\]\]/gi, '$1')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/{\{([^|{}]+)\}\}/g, '$1')
    .replace(/{\{[^|{}]*\|([^}]+)\}\}/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, decodeHtmlEntities)
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeStep(text) {
  const stepWords = [
    'talk', 'go', 'head', 'walk', 'travel', 'enter', 'exit', 'climb',
    'pick', 'take', 'use', 'open', 'close', 'kill', 'fight', 'attack',
    'bank', 'teleport', 'buy', 'purchase', 'give', 'trade', 'accept',
    'search', 'dig', 'mine', 'chop', 'craft', 'cook', 'build', 'place',
    'push', 'pull', 'fill', 'pour', 'light', 'burn', 'cut', 'break',
    'unlock', 'activate', 'touch', 'stand', 'sit', 'rest', 'wait',
    'return', 'bring', 'fetch', 'collect', 'obtain', 'get', 'find',
    'equip', 'wield', 'wear', 'remove', 'drop', 'destroy', 'discard',
    'speak', 'ask', 'tell', 'say', 'reply', 'answer', 'agree', 'refuse',
    'read', 'inspect', 'examine', 'check', 'look', 'listen', 'smell',
    'lead', 'escort', 'accompany', 'follow', 'meet', 'greet', 'thank',
    'apologize', 'explain', 'describe', 'show', 'demonstrate', 'point',
    'switch', 'toggle', 'set', 'adjust', 'configure', 'choose', 'select',
    'solve', 'complete', 'finish', 'start', 'begin', 'start',
  ];
  const words = text.toLowerCase().split(/\s+/);
  const hasStepWord = stepWords.some(w => words[0] === w || words[1] === w);
  const startsWithNumber = /^\d+[\.)]/.test(text);
  return hasStepWord || startsWithNumber;
}

function classifyStep(text) {
  const lower = text.toLowerCase();
  if (lower.match(/\btalk\b|\bspeak\b|\bask\b|\btell\b|\bsay\b|\bagree\b|\breply\b|\banswer\b/)) return 'dialogue';
  if (lower.match(/\bgo\b|\bhead\b|\bwalk\b|\btravel\b|\benterggyy\b|\bclimb\b|\bteleport\b|\bapproach\b|\bleave\b|\bexit\b|\breturn\b|\bstand\b|\bsit\b/)) return 'movement';
  if (lower.match(/\bkill\b|\bfight\b|\battack\b|\bdefeat\b|\bstab\b|\bshoot\b|\bcast\b|\buse\b.*\bspell\b|\bcombo\b|\bwind\b|\bearth\b|\bwater\b|\bfire\b/)) return 'action';
  if (lower.match(/\buse\b|\bopen\b|\bclick\b|\boperate\b|\bactivate\b|\bdeactivate\b|\bpush\b|\bpull\b|\btouch\b|\bstand\b.*\non\b|\bplace\b|\bfill\b|\npour\b/)) return 'interaction';
  return 'general';
}

function cleanStep(text) {
  return text
    .replace(/^\s*[-–—•·|]\s*/, '')
    .replace(/\s*\(https?:\/\/[^\)]+\)\s*/g, ' ')
    .replace(/\s*\(click to expand\)\s*/gi, ' ')
    .replace(/\[edit \| edit source \]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse steps from a single section's plain text.
 */
function parseStepsFromSection(text) {
  const steps = [];
  const lines = text.split(/\n|\r/).map(l => l.trim()).filter(l => l.length > 5);

  for (const raw of lines) {
    const line = cleanStep(raw);

    // Numbered steps: "1. Do something" or "1 Do something"
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) {
      const num = parseInt(numbered[1]);
      const cleaned = cleanStep(numbered[2]);
      if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
        steps.push({ text: cleaned, kind: classifyStep(cleaned), _num: num });
      }
      continue;
    }

    // Bulleted steps: "- Kill the goblin" or "* Kill the goblin"
    const bulleted = line.match(/^[-–—•*]\s+(.+)/);
    if (bulleted) {
      const cleaned = cleanStep(bulleted[1]);
      if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
        steps.push({ text: cleaned, kind: classifyStep(cleaned) });
      }
      continue;
    }

    // "Do X → Y" or "Do X → Y." patterns
    const arrow = line.match(/^([^→\n]+?)→\s*([^→\n]+?)[\.!?]?\s*$/);
    if (arrow) {
      const a = cleanStep(arrow[1]);
      const b = cleanStep(arrow[2]);
      if (a.length > 5) steps.push({ text: a, kind: classifyStep(a) });
      if (b.length > 5) steps.push({ text: b, kind: classifyStep(b) });
      continue;
    }

    // "X. Y" without space: "1.Head north"
    const tightNum = line.match(/^(\d+)\.\s+(.+)/);
    if (tightNum) {
      const cleaned = cleanStep(tightNum[2]);
      if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
        steps.push({ text: cleaned, kind: classifyStep(cleaned) });
      }
    }
  }

  return steps;
}

/**
 * Main parse function — fetches quest title from wikitext (for title extraction
 * since the HTML parse endpoint doesn't give us a clean title in all cases).
 * @param {string} html - raw HTML of the quest page
 * @param {string} sourceUrl - URL the page was fetched from
 * @returns {{ title, sourceUrl, sections, steps }}
 */
function parseRuneWikiHtml(html, sourceUrl) {
  // Extract page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s*-\s*The RuneScape Wiki\s*$/i, '').replace(/\s*-\s*RuneScape Wiki\s*$/i, '').trim()
    : sourceUrl;

  // Extract section headings with positions
  const sectionMatches = [...html.matchAll(
    /<h2[^>]*>[\s\S]*?<span[^>]*class="[^"]*mw-headline[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/gi
  )];
  const sections = [];
  for (const m of sectionMatches) {
    const text = decodeHtmlEntities(m[1]).replace(/\[edit\]/gi, '').trim();
    if (text) sections.push(text);
  }

  // Strip junk from HTML before extracting text
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*(?:navbox|infobox|metadata|portal|notice)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ')
    .replace(/{{\[edit\]\|?\s*/gi, '');

  const plainText = htmlToPlain(body);

  // Walk through text, identify walkthrough sections
  const stepsMap = new Map(); // section -> steps
  let currentSection = '__intro__';
  let currentSteps = [];
  let skipMode = false;

  const allSections = sections.length > 0 ? sections : [];
  let sectionIdx = 0;

  const lines = plainText.split(/\n|\r/);
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Check if this line is a section heading
    let matchedSection = null;
    for (const s of allSections) {
      if (line === s || line.startsWith(s + ' ') || line.startsWith(s + ' [')) {
        matchedSection = s;
        break;
      }
    }

    if (matchedSection) {
      // Save previous section
      if (currentSteps.length > 0) {
        stepsMap.set(currentSection, currentSteps);
      }
      currentSection = matchedSection;
      currentSteps = [];
      sectionIdx++;

      // Determine if we should skip this section
      const lower = matchedSection.toLowerCase();
      skipMode = WALKTHROUGH_SKIP.has(lower) || lower.includes('reward') || lower.includes('achievement') || lower.includes('gallery') || lower.includes('trivia');
      continue;
    }

    if (skipMode) continue;

    // Parse steps from this line
    const parsed = parseStepsFromSection(line);
    for (const step of parsed) {
      currentSteps.push(step);
    }
  }

  // Save last section
  if (currentSteps.length > 0) {
    stepsMap.set(currentSection, currentSteps);
  }

  // Collect all steps, dedup
  const allSteps = [];
  const seen = new Set();
  for (const [, steps] of stepsMap) {
    for (const step of steps) {
      const key = step.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seen.has(key) && step.text.length >= 8) {
        seen.add(key);
        allSteps.push({ text: step.text, kind: step.kind });
      }
    }
  }

  return { title, sourceUrl, sections, steps: allSteps };
}

module.exports = { parseRuneWikiHtml };