/**
 * Lightweight self-check (imported by the app in dev for a console assert).
 * Full unit tests are not wired; logic is verified in the browser demo.
 */
import {
  applyPasteToDraft,
  backspaceDraft,
  draftToDisplay,
  expandDraftForSend,
  generateSamplePaste,
  shouldCollapsePaste,
} from "./paste";

export function runPasteSelfCheck(): boolean {
  const big = generateSamplePaste(100);
  if (!shouldCollapsePaste(big)) return false;
  if (shouldCollapsePaste("hi")) return false;

  let nextId = 1;
  const pastes = new Map();
  const r = applyPasteToDraft("", 0, 0, big, nextId);
  if (!r.collapsed || !r.attachment) return false;
  pastes.set(r.attachment.id, r.attachment);
  nextId = r.nextId;

  const display = draftToDisplay(r.draft, pastes);
  if (!display.includes("Pasted text #1")) return false;
  if (display.length > 80) return false; // must stay tiny

  const expanded = expandDraftForSend(r.draft, pastes);
  if (expanded !== big) return false;

  const bs = backspaceDraft(r.draft, r.caret, r.caret);
  if (bs.draft !== "" || bs.removedPasteId !== 1) return false;

  return true;
}
