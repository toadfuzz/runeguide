/**
 * RuneGuide RuneWiki Parser
 * 
 * Strategy:
 * 1. Extract page title from <title> or <h1>
 * 2. Find the walkthrough section — skip requirements, rewards, quest details
 * 3. Parse numbered step lists as primary step source
 * 4. Handle wiki templates {{}} by stripping outer template name only
 * 5. Filter out navboxes, infoboxes, and non-guide content
 * 6. Classify each step by keyword detection
 */

function normalize(text) {
  return text
    .replace(/\r/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function decodeHtmlEntities(text) {
  return normalize(text);
}

/**
 * Strip the outer template from a wiki {{template|...}} expression.
 * e.g. "{{Quest inline|Slay a dragon}}" → "Slay a dragon"
 * e.g. "{{coord|32|4}}" → "32,4"
 */
function stripOuterTemplate(text) {
  const match = text.match(/^\{\{([^{}|]+)(?:\|[^{}]*)?\}\}$/i);
  if (match) {
    const templateName = match[1].trim().toLowerCase();
    const innerPipe = text.indexOf('|');
    if (innerPipe !== -1) {
      return text.slice(innerPipe + 1, text.lastIndexOf('}}')).trim();
    }
    return match[1].trim();
  }
  return text;
}

/**
 * Expand common RuneScape inline templates, stripping the rest.
 */
function expandTemplates(text) {
  return text
    .replace(/\{\{Quest inline\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{Quest\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{NPC\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{NPC\|([^|]+)\|([^}]+)\}\}/gi, '$2')
    .replace(/\{\{Item\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{Location\|([^}]+)\}\}/gi, '$1')
    .replace(/\{\{Clear\}\}/gi, '')
    .replace(/\{\{clr\}\}/gi, '')
    .replace(/\{\{---?\}\}/gi, '')
    .replace(/\{\{[^}]+\}\}/g, '');
}

/**
 * Strip HTML tags and decode entities.
 */
function htmlToPlain(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, '')
    .replace(/\[\[([^|\]]+)\|([^]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+\]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Detect which section we're in based on heading text.
 */
function sectionPriority(heading) {
  const h = heading.toLowerCase();
  if (/walkth?rough|guide|steps?|procedure/i.test(h)) return 1;
  if (/details?|walkthrough overview/i.test(h)) return 2;
  if (/quick guide/i.test(h)) return 3;
  if (/sub-?steps?/i.test(h)) return 4;
  if (/requirements?/.test(h)) return 100;
  if (/rewards?/.test(h)) return 101;
  if (/quest (details?|info)/i.test(h)) return 102;
  if (/npcs? (involved)?/.test(h)) return 103;
  if (/journal|lore/i.test(h)) return 104;
  return 50;
}

/**
 * Classify a step by content keywords.
 */
function classifyStep(text) {
  const lower = text.toLowerCase();
  const singleQuotes = (text.match(/'/g) || []).length;
  if (singleQuotes >= 3 && /[A-Z]/.test(text)) return 'dialogue';
  if (/^(talk to|speak to|ask|report to|tell|ask for|consult)/i.test(lower)) return 'dialogue';
  if (/^(walk|run|head|go|travel|enter|leave|climb|descend|teleport|port|take|board|sail|fly|navigate)/i.test(lower)) return 'movement';
  if (/^(use|open|activate|pull|push|search|inspect|read|check|click|operate)/i.test(lower)) return 'interaction';
  if (/^(kill|defeat|fight|attack|cast|collect|gather|mine|fish|chop|craft|cook|bank|deposit)/i.test(lower)) return 'action';
  return 'general';
}

function cleanStep(text) {
  let cleaned = expandTemplates(text);
  cleaned = stripOuterTemplate(cleaned);
  cleaned = cleaned.replace(/^[\s\-–—•*]+/, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

function looksLikeStep(line) {
  const l = line.trim().toLowerCase();
  if (l.length < 8) return false;
  if (/^(edit|view source|history|read as wikitext)$/i.test(l)) return false;
  if (/^(navigation|search this wiki|random article|about)$/i.test(l)) return false;
  if (/^quest (details?|overview|requirements?|rewards?)/i.test(l)) return false;
  if (/^this article/i.test(l)) return false;
  if (/^(return to|back to|main page|page contents)/i.test(l)) return false;
  if (/^retrieved from/i.test(l)) return false;
  if (/^categor(y|ies)/i.test(l)) return false;
  if (/^\[?(?:edit|view|source|history)\]?$/i.test(l)) return false;
  return true;
}

/**
 * Parse the walkthrough section of a RuneWiki quest page.
 * Returns an array of step objects.
 */
function parseWalkthrough(rawText, sectionHeadings) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const steps = [];
  let inWalkthrough = false;
  let currentSectionPriority = 50;
  const seenNumbers = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    
    // Check if this line is a section heading (starts with ##)
    const h2Match = line.match(/^##\s+(.+)/i);
    if (h2Match) {
      const headingText = decodeHtmlEntities(h2Match[1]).trim();
      const pri = sectionPriority(headingText);
      if (pri < currentSectionPriority) {
        inWalkthrough = (pri <= 4);
        currentSectionPriority = pri;
      }
      continue;
    }

    // Only collect steps in walkthrough sections
    if (!inWalkthrough) continue;

    // Numbered steps: "1. Do something" or "1 Do something"
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) {
      const num = parseInt(numbered[1]);
      if (!seenNumbers.has(num)) {
        seenNumbers.add(num);
        const cleaned = cleanStep(numbered[2]);
        if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
          steps.push({ text: cleaned, kind: classifyStep(cleaned), _num: num });
        }
      }
      continue;
    }

    // Bulleted sub-steps: "- Kill the goblin"
    const bulleted = line.match(/^[-–—•*]\s+(.+)/);
    if (bulleted) {
      const cleaned = cleanStep(bulleted[1]);
      if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
        steps.push({ text: cleaned, kind: classifyStep(cleaned) });
      }
      continue;
    }

    // Sub-bullets (indented)
    const subBulleted = line.match(/^\s{2,}[-–—•*]\s+(.+)/);
    if (subBulleted) {
      const cleaned = cleanStep(subBulleted[1]);
      if (cleaned.length >= 8 && looksLikeStep(cleaned)) {
        steps.push({ text: cleaned, kind: classifyStep(cleaned) });
      }
    }
  }

  return steps;
}

/**
 * Main entry point for parsing a RuneWiki page.
 * @param {string} html - raw HTML of the quest page
 * @param {string} sourceUrl - the URL the page was fetched from
 * @returns {{ title, sourceUrl, sections, steps }}
 */
function parseRuneWikiHtml(html, sourceUrl) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/ - The RuneScape Wiki$/i, '').replace(/ - RuneScape Wiki$/i, '').trim()
    : sourceUrl;

  // Collect section headings with their positions
  const sectionMatches = [...html.matchAll(/<h2[^>]*>[\s\S]*?<span[^>]*class="[^"]*(?:mw-headline|mw-editsection)[^"]*"[^>]*>[\s\S]*?<\/span>[\s\S]*?<\/h2>/gi)];
  const sections = [];
  for (const m of sectionMatches) {
    const textMatch = m[0].match(/class="[^"]*mw-headline[^"]*"[^>]*>(.*?)<\/span>/i);
    if (textMatch) {
      const headingText = decodeHtmlEntities(textMatch[1]).replace(/\[edit\]/gi, '').trim();
      if (headingText) sections.push(headingText);
    }
  }

  // Get walkthrough content (strip scripts, styles, nav)
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<div[^>]*class="[^"]*(?:navbox|infobox|metadata)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ');

  const rawText = htmlToPlain(body);

  // Parse steps using walkthrough-aware logic
  const stepsRaw = parseWalkthrough(rawText, sections);

  // Deduplicate by text content
  const seen = new Set();
  const steps = [];
  for (const step of stepsRaw) {
    const key = step.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.add(key);
      steps.push({ text: step.text, kind: step.kind });
    }
  }

  return { title, sourceUrl, sections, steps };
}

module.exports = { parseRuneWikiHtml };