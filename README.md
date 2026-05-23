# RuneGuide

RuneGuide is a Windows-only RuneScape 3 quest guide overlay.

It is meant to feel like part of the game: a small overlay-style helper that imports guides from RuneWiki, highlights the next step, and keeps the player focused on where to walk or what to do next.

## What it does

- Imports RuneWiki quest pages on the fly
- Breaks guides into actionable steps
- Highlights movement, dialogue, and interaction cues
- Saves the last imported guide locally
- Ships as a Windows installer

## Branding

- App name: **RuneGuide**
- Mascot/logo: a frog dressed like a knight
- Target feel: more RuneScape 3, less generic desktop utility

## Build scripts

- `bun run dev` — start the web preview
- `bun run build` — build the frontend
- `bun run dist:installer` — produce the Windows installer

## Roadmap

### Done ✓
- [x] Custom titlebar with always-on-top toggle
- [x] RuneWiki page import via URL or quest title
- [x] Step kinds: movement, dialogue, interaction, action, general
- [x] Progress tracking (step X of Y)
- [x] Local guide persistence via Electron store
- [x] Windows NSIS installer (electron-builder)
- [x] Frog knight logo

### In progress → Next up
- [ ] **Better parser** — current heuristic parsing misses steps on pages with complex layouts. Need to: detect numbered walkthrough sections first, strip infobox/navbox content, handle nested wiki templates `{{}}` properly, prioritize NPC dialogue lines, and ignore non-quest guide sections like "quest requirements" and "rewards"

### Planned
- [ ] **Quest search/autocomplete** — type a name, get a dropdown of matching RuneScape 3 quests from the wiki API
- [ ] **Step-by-step minimap indicators** — show a small directional arrow on steps flagged as `movement`, giving a visual "head north" cue
- [ ] **Quick-jump step list** — sidebar panel showing all steps with click-to-jump, current step highlighted
- [ ] **Guide thumbnail** — extract and display the quest's wiki image
- [ ] **Dark/light theme toggle** — switch between the dark RuneScape feel and a lighter option
- [ ] **Keyboard shortcuts** — `→` next step, `←` prev step, `Ctrl+F` to focus search
- [ ] **Portable mode** — no install needed, just run the `.exe`

### Eventually
- [ ] **Multiple saved quests** — keep a list of completed/in-progress quests
- [ ] **GPacket integration** — pull live player position from RuneScape's own GPacket stream so step arrows point to actual in-game location
- [ ] **Mobile companion** — a smaller web view that mirrors the current step and stays synced

## Notes

- The app uses a two-layer parse: raw HTML is cleaned of scripts/styles, then run through a step detector that prioritizes numbered list items and lines starting with action verbs.
- If you see "0 steps" after importing, the page format likely changed — check the [RuneWiki parser source](/electron/rune-parser.cjs) and open an issue with the quest name.