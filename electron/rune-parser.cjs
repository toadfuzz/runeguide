function normalizeGuideText(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function guessStepKind(text) {
  const lower = text.toLowerCase();
  if (/(walk|run|head|go|travel|enter|leave|climb|descend|teleport|take|board|sail)/.test(lower)) return 'movement';
  if (/(talk to|speak to|ask|report to|tell)/.test(lower)) return 'dialogue';
  if (/(use|open|activate|pull|push|search|inspect|read|check)/.test(lower)) return 'interaction';
  if (/(kill|defeat|fight|attack|cast|collect|gather|mine|fish|chop|craft|cook)/.test(lower)) return 'action';
  return 'general';
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function slugifyQuestTitle(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchRuneWikiGuide(source) {
  const url = source.startsWith('http')
    ? source
    : `https://runescape.wiki/w/${encodeURIComponent(source.replace(/ /g, '_'))}`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 RS3QuestGuide/0.1',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch RuneWiki page: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  return parseRuneWikiHtml(html, url);
}

function parseRuneWikiHtml(html, sourceUrl) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/ - The RuneScape Wiki$/i, '').trim() : sourceUrl;
  const sectionRegex = /<h2[^>]*>\s*<span class="mw-headline"[^>]*>(.*?)<\/span>\s*<\/h2>/gi;
  const sections = [];
  let match;
  while ((match = sectionRegex.exec(html))) {
    sections.push(decodeHtml(match[1]).trim());
  }
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  const lines = normalizeGuideText(bodyText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length > 3)
    .filter((line) => !/^this article/i.test(line))
    .slice(0, 600);
  const steps = [];
  for (const line of lines) {
    const clean = line.replace(/^\d+[.)]\s*/, '').trim();
    if (!clean) continue;
    if (/^(edit|view source|history|discussion|read as wikitext|citation needed)$/i.test(clean)) continue;
    if (/^(navigation|quest walkthrough|strategy|walkthrough|guides?)$/i.test(clean)) continue;
    if (clean.length < 8) continue;
    steps.push({ text: clean, kind: guessStepKind(clean) });
    if (steps.length >= 120) break;
  }
  return { title, sourceUrl, sections, steps };
}

module.exports = { fetchRuneWikiGuide, parseRuneWikiHtml, slugifyQuestTitle };
