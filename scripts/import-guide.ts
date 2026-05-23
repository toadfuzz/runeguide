import { fetchRuneWikiGuide } from '../shared/runewiki.ts';

const source = process.argv[2];

if (!source) {
  console.error('Usage: bun scripts/import-guide.ts <quest-title-or-url>');
  process.exit(1);
}

const guide = await fetchRuneWikiGuide(source);
console.log(JSON.stringify(guide, null, 2));
