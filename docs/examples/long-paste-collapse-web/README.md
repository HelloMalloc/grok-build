# Long paste collapse — web reference

Portable reference for collapsing oversized pastes in a CLI-style session input.

See the full change record: [`docs/proposals/long-paste-collapse.md`](../../proposals/long-paste-collapse.md)

## Core API (`src/lib/cli/paste.ts`)

- `shouldCollapsePaste(text)` — threshold check
- `createPasteAttachment(id, content)` — off-DOM store entry
- `encodePasteMarker` / `draftToDisplay` — internal draft vs visible chip
- `expandDraftForSend` — full payload on submit
- Atomic chip delete helpers for backspace

## UI

- `SessionInput.tsx` — intercepts `paste`, renders chips, peek modal
- `SessionApp.tsx` — demo terminal + **Demo paste** button (~1640 lines)

This folder is a **reference**, not a crate in the Rust workspace.
