/**
 * Long-paste collapse for CLI-style session inputs.
 *
 * Pasting multi-kilobyte / multi-thousand-line text into a controlled textarea
 * re-renders and reflows every character → freezes the terminal UI. Other CLIs
 * (Claude Code, etc.) detect oversized pastes and replace the visible body with
 * a short token like `[Pasted text #1 +1640 lines]` while keeping the full
 * payload off-DOM until submit / expand.
 */

export type PasteAttachment = {
  id: number;
  content: string;
  lines: number;
  bytes: number;
  /** Display label, e.g. `[Pasted text #1 +1640 lines]` */
  label: string;
};

export type DraftSegment =
  | { kind: "text"; value: string }
  | { kind: "paste"; id: number };

/** Thresholds: any one met → collapse into a paste token. */
export const PASTE_COLLAPSE = {
  /** Min character length to collapse even if only a few lines */
  minChars: 400,
  /** Min line count to collapse when also above minCharsForLines */
  minLines: 8,
  /** Chars required alongside minLines */
  minCharsForLines: 120,
} as const;

/** Marker format embedded in the visible draft string. */
const MARKER_OPEN = "\u200B\u200BPASTE:";
const MARKER_CLOSE = "\u200B\u200B";

export function countLines(text: string): number {
  if (!text) return 0;
  // Trailing newline still counts as the last line content-wise for "N lines"
  const parts = text.split("\n");
  return parts.length;
}

export function shouldCollapsePaste(text: string): boolean {
  const chars = text.length;
  const lines = countLines(text);
  if (chars >= PASTE_COLLAPSE.minChars) return true;
  if (lines >= PASTE_COLLAPSE.minLines && chars >= PASTE_COLLAPSE.minCharsForLines) {
    return true;
  }
  return false;
}

export function makePasteLabel(id: number, lines: number): string {
  return `[Pasted text #${id} +${lines} lines]`;
}

export function createPasteAttachment(
  id: number,
  content: string,
): PasteAttachment {
  const lines = countLines(content);
  return {
    id,
    content,
    lines,
    bytes: new TextEncoder().encode(content).length,
    label: makePasteLabel(id, lines),
  };
}

/** Encode a paste id as an invisible-ish marker in the draft string. */
export function encodePasteMarker(id: number): string {
  return `${MARKER_OPEN}${id}${MARKER_CLOSE}`;
}

const MARKER_RE = /\u200B\u200BPASTE:(\d+)\u200B\u200B/g;

export function parseDraftSegments(draft: string): DraftSegment[] {
  const segments: DraftSegment[] = [];
  let last = 0;
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(draft)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: draft.slice(last, m.index) });
    }
    segments.push({ kind: "paste", id: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < draft.length) {
    segments.push({ kind: "text", value: draft.slice(last) });
  }
  return segments;
}

/** Visible draft for the textarea — markers replaced with human labels. */
export function draftToDisplay(
  draft: string,
  pastes: Map<number, PasteAttachment>,
): string {
  return draft.replace(MARKER_RE, (_full, idStr: string) => {
    const id = Number(idStr);
    const p = pastes.get(id);
    return p?.label ?? `[Pasted text #${id}]`;
  });
}

/**
 * Map a caret position in the *display* string back to an index in the
 * *internal* draft (with markers). Used so typing/cursor stay coherent when
 * paste labels are longer/shorter than markers.
 */
export function displayOffsetToDraft(
  draft: string,
  pastes: Map<number, PasteAttachment>,
  displayOffset: number,
): number {
  let displayI = 0;
  let draftI = 0;
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  let last = 0;

  while ((m = re.exec(draft)) !== null) {
    const textLen = m.index - last;
    if (displayOffset <= displayI + textLen) {
      return draftI + (displayOffset - displayI);
    }
    displayI += textLen;
    draftI = m.index;

    const id = Number(m[1]);
    const label = pastes.get(id)?.label ?? `[Pasted text #${id}]`;
    const markerLen = m[0].length;

    // Entire label is one atomic unit — caret snaps to either side
    if (displayOffset < displayI + label.length) {
      // Inside label: snap to end of marker (after paste)
      return draftI + markerLen;
    }
    if (displayOffset === displayI + label.length) {
      return draftI + markerLen;
    }

    displayI += label.length;
    draftI += markerLen;
    last = m.index + markerLen;
  }

  const tail = draft.length - last;
  const within = Math.min(displayOffset - displayI, tail);
  return draftI + Math.max(0, within);
}

export function draftOffsetToDisplay(
  draft: string,
  pastes: Map<number, PasteAttachment>,
  draftOffset: number,
): number {
  let displayI = 0;
  let draftI = 0;
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  let last = 0;

  while ((m = re.exec(draft)) !== null) {
    const textLen = m.index - last;
    if (draftOffset <= draftI + textLen) {
      return displayI + (draftOffset - draftI);
    }
    displayI += textLen;
    draftI = m.index;

    const id = Number(m[1]);
    const label = pastes.get(id)?.label ?? `[Pasted text #${id}]`;
    const markerLen = m[0].length;

    if (draftOffset < draftI + markerLen) {
      // Inside marker → start of label
      return displayI;
    }
    if (draftOffset === draftI + markerLen) {
      return displayI + label.length;
    }

    displayI += label.length;
    draftI += markerLen;
    last = m.index + markerLen;
  }

  return displayI + Math.max(0, draftOffset - draftI);
}

/**
 * Expand draft markers into full pasted content for the message that is sent.
 */
export function expandDraftForSend(
  draft: string,
  pastes: Map<number, PasteAttachment>,
): string {
  return draft.replace(MARKER_RE, (_full, idStr: string) => {
    const id = Number(idStr);
    const p = pastes.get(id);
    return p?.content ?? "";
  });
}

/**
 * Build a display-friendly message body where pastes stay collapsed as labels
 * (for the transcript) — avoids rendering megabytes in the scrollback.
 */
export function draftToCollapsedMessage(
  draft: string,
  pastes: Map<number, PasteAttachment>,
): { text: string; attachments: PasteAttachment[] } {
  const used: PasteAttachment[] = [];
  const text = draft.replace(MARKER_RE, (_full, idStr: string) => {
    const id = Number(idStr);
    const p = pastes.get(id);
    if (p) {
      used.push(p);
      return p.label;
    }
    return `[Pasted text #${id}]`;
  });
  return { text, attachments: used };
}

/**
 * Handle a paste into a draft. Returns updated draft + optional new attachment.
 * If the paste is small, content is inlined as plain text.
 */
export function applyPasteToDraft(
  draft: string,
  selectionStart: number,
  selectionEnd: number,
  pastedText: string,
  nextId: number,
): {
  draft: string;
  caret: number;
  attachment: PasteAttachment | null;
  nextId: number;
  collapsed: boolean;
} {
  const before = draft.slice(0, selectionStart);
  const after = draft.slice(selectionEnd);

  if (!shouldCollapsePaste(pastedText)) {
    const next = before + pastedText + after;
    return {
      draft: next,
      caret: before.length + pastedText.length,
      attachment: null,
      nextId,
      collapsed: false,
    };
  }

  const attachment = createPasteAttachment(nextId, pastedText);
  const marker = encodePasteMarker(attachment.id);
  const next = before + marker + after;
  return {
    draft: next,
    caret: before.length + marker.length,
    attachment,
    nextId: nextId + 1,
    collapsed: true,
  };
}

/**
 * Delete one "grapheme unit" backward from caret, treating paste markers as
 * atomic so Backspace removes the whole `[Pasted text #N …]` chip.
 */
export function backspaceDraft(
  draft: string,
  selectionStart: number,
  selectionEnd: number,
): { draft: string; caret: number; removedPasteId: number | null } {
  if (selectionStart !== selectionEnd) {
    return {
      draft: draft.slice(0, selectionStart) + draft.slice(selectionEnd),
      caret: selectionStart,
      removedPasteId: null,
    };
  }
  if (selectionStart <= 0) {
    return { draft, caret: 0, removedPasteId: null };
  }

  // If caret is right after a marker, remove the whole marker
  const before = draft.slice(0, selectionStart);
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  let lastMarker: RegExpExecArray | null = null;
  while ((m = re.exec(before)) !== null) {
    lastMarker = m;
  }
  if (lastMarker) {
    const end = lastMarker.index + lastMarker[0].length;
    if (end === selectionStart) {
      return {
        draft: draft.slice(0, lastMarker.index) + draft.slice(selectionStart),
        caret: lastMarker.index,
        removedPasteId: Number(lastMarker[1]),
      };
    }
  }

  // Normal single-char (or surrogate pair) delete
  const prev = before.codePointAt(before.length - 1);
  const delLen = prev !== undefined && prev > 0xffff ? 2 : 1;
  const caret = selectionStart - delLen;
  return {
    draft: draft.slice(0, caret) + draft.slice(selectionStart),
    caret,
    removedPasteId: null,
  };
}

/** Generate a large sample for demos / stress tests. */
export function generateSamplePaste(lines = 1640): string {
  const header = [
    "// Sample large paste — simulates dumping a long log / file into the CLI",
    `// Generated ${lines} lines to stress-test paste handling`,
    "",
  ];
  const body: string[] = [];
  for (let i = 1; i <= lines; i++) {
    body.push(
      `  [${String(i).padStart(5, "0")}] event=tick ts=${Date.now() + i} payload=${"x".repeat(48)} status=ok`,
    );
  }
  return [...header, ...body, "", "// end of sample"].join("\n");
}
