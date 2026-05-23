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

## Notes

- The app currently uses heuristic parsing for RuneWiki pages.
- The Windows build is configured through Electron Builder.
