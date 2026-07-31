# Change record: Long paste collapse (session / prompt input)

**Date:** 2026-07-31  
**Repo:** [HelloMalloc/grok-build](https://github.com/HelloMalloc/grok-build)  
**Branch:** `docs/long-paste-collapse`  
**Status:** Reference design + web demo recorded (TUI already ships paste chips)

## Summary

Record the long-paste collapse design so oversized pastes never freeze the
session/prompt UI. Large clipboard payloads are stored off the visible buffer
and replaced with a short chip token; the full body is expanded only on send
or explicit peek.

## Problem

Pasting thousands of lines (logs, dumps, multi-file content) into a session
input mounts every character in the editable buffer and reflows on each
keystroke. That freezes the terminal / web UI and makes the prompt unusable
until the paste is cleared.

## Solution

Same pattern used by modern CLI coding agents (and already partially present
in the Grok Build TUI prompt widget):

1. Intercept paste (`Event::Paste` / `clipboard paste` / DOM `paste`)
2. If content exceeds threshold, **do not** put the full body in the visible input
3. Store full body in an attachment map keyed by id
4. Insert a short chip, e.g. `[Pasted text #1 +1640 lines]` / `[Pasted: N lines]`
5. On send, expand chips to the full payload
6. Transcript / scrollback may keep chips; click/peek shows head+tail
7. Backspace / delete treats a chip as a single atomic unit

### Thresholds (web reference demo)

| Rule | Value |
|------|-------|
| Collapse if chars ≥ | 400 |
| Or lines ≥ and chars ≥ | 8 lines **and** 120 chars |

### Thresholds (existing TUI — `prompt_widget`)

| Rule | Value |
|------|-------|
| Multi-line chip | ≥ 4 lines (2 in compact mode) |
| Single-line large paste | > 10_000 bytes (`PASTE_CHIP_DISPLAY_BYTES`) |
| Display form | `[Pasted: N lines]` / size-based chip label |

Relevant TUI code (already on `main`):

- `crates/codegen/xai-grok-pager/src/views/prompt_widget/mod.rs` — `handle_paste`, chip elements
- `crates/codegen/xai-grok-pager/src/app/agent_view/paste.rs` — paste routing, deferred clipboard probe
- PTY e2e: `paste_bracketed_chip_text_sends_full_payload.rs`, `paste_chip_*` scenarios
- Bench: `crates/codegen/xai-grok-pager-pty-harness/benches/paste_latency.rs`

## Web reference demo (this branch)

A self-contained React session-input demo lives under:

```text
docs/examples/long-paste-collapse-web/
  src/lib/cli/paste.ts              # collapse / expand / atomic delete
  src/lib/cli/paste.test-manual.ts
  src/components/cli/SessionInput.tsx
  src/components/cli/SessionApp.tsx
```

### Behavior checklist

- [x] Demo paste (~1640-line log) shows a short chip, not the full dump
- [x] Send expands full payload; transcript keeps chip with peek
- [x] Atomic chip delete on backspace when caret is on chip
- [x] Short pastes stay inline (below threshold)
- [x] Production build of the demo app succeeds (companion workspace)

## Files touched by this change record

| Path | Role |
|------|------|
| `docs/proposals/long-paste-collapse.md` | This change record |
| `docs/examples/long-paste-collapse-web/**` | Portable reference implementation (web) |

## Notes

- The Grok Build TUI already implements paste chips. This record documents the
  design and keeps a small web reference for product/UX review without
  rewriting the Rust monorepo.
- Companion sandbox demo was previously staged at
  `HelloMalloc/cli-session-long-paste` (PR #1); **this repo is the intended
  home for the change record.**
