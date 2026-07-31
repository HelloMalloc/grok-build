import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ClipboardPaste, SendHorizontal, Trash2 } from "lucide-react";
import {
  applyPasteToDraft,
  backspaceDraft,
  draftOffsetToDisplay,
  draftToCollapsedMessage,
  draftToDisplay,
  displayOffsetToDraft,
  encodePasteMarker,
  expandDraftForSend,
  generateSamplePaste,
  type PasteAttachment,
} from "@/lib/cli/paste";

type Props = {
  disabled?: boolean;
  onSubmit: (payload: {
    displayText: string;
    fullText: string;
    attachments: PasteAttachment[];
  }) => void;
  onToast?: (message: string) => void;
};

export function SessionInput({ disabled, onSubmit, onToast }: Props) {
  const [draft, setDraft] = useState("");
  const [pastes, setPastes] = useState<Map<number, PasteAttachment>>(
    () => new Map(),
  );
  const [nextId, setNextId] = useState(1);
  const [preview, setPreview] = useState<PasteAttachment | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const caretDraftRef = useRef(0);

  const display = draftToDisplay(draft, pastes);

  const syncCaretFromDraft = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    const d = caretDraftRef.current;
    const displayPos = draftOffsetToDisplay(draft, pastes, d);
    try {
      el.setSelectionRange(displayPos, displayPos);
    } catch {
      // ignore if not focused
    }
  }, [draft, pastes]);

  useLayoutEffect(() => {
    syncCaretFromDraft();
  }, [display, syncCaretFromDraft]);

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [display, resize]);

  const insertAtSelection = useCallback(
    (text: string) => {
      const el = taRef.current;
      const displayStart = el?.selectionStart ?? display.length;
      const displayEnd = el?.selectionEnd ?? display.length;
      const draftStart = displayOffsetToDraft(draft, pastes, displayStart);
      const draftEnd = displayOffsetToDraft(draft, pastes, displayEnd);

      const result = applyPasteToDraft(
        draft,
        draftStart,
        draftEnd,
        text,
        nextId,
      );

      if (result.attachment) {
        setPastes((prev) => {
          const next = new Map(prev);
          next.set(result.attachment!.id, result.attachment!);
          return next;
        });
        setNextId(result.nextId);
        onToast?.(
          `Collapsed paste #${result.attachment.id} (+${result.attachment.lines} lines, ${formatBytes(result.attachment.bytes)}) — UI stays responsive`,
        );
      }

      setDraft(result.draft);
      caretDraftRef.current = result.caret;
      requestAnimationFrame(() => {
        taRef.current?.focus();
      });
    },
    [display.length, draft, nextId, onToast, pastes],
  );

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    insertAtSelection(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const el = taRef.current;
      if (!el) return;
      const displayStart = el.selectionStart;
      const displayEnd = el.selectionEnd;
      const draftStart = displayOffsetToDraft(draft, pastes, displayStart);
      const draftEnd = displayOffsetToDraft(draft, pastes, displayEnd);

      const result = backspaceDraft(draft, draftStart, draftEnd);
      // Intercept when deleting a whole paste chip or a selection
      if (result.removedPasteId != null || draftStart !== draftEnd) {
        e.preventDefault();
        if (result.removedPasteId != null) {
          setPastes((prev) => {
            const next = new Map(prev);
            next.delete(result.removedPasteId!);
            return next;
          });
        }
        setDraft(result.draft);
        caretDraftRef.current = result.caret;
      }
    }
  };

  const handleChange = (e: FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const newDisplay = el.value;
    const rebuilt = rebuildDraftFromDisplay(newDisplay, pastes);
    setDraft(rebuilt.draft);
    if (rebuilt.droppedIds.length) {
      setPastes((prev) => {
        const next = new Map(prev);
        for (const id of rebuilt.droppedIds) next.delete(id);
        return next;
      });
    }
    const caretDisplay = el.selectionStart ?? newDisplay.length;
    caretDraftRef.current = displayOffsetToDraft(
      rebuilt.draft,
      rebuilt.pastes,
      caretDisplay,
    );
  };

  const submit = () => {
    if (!draft.trim() && pastes.size === 0) return;

    const { text, attachments } = draftToCollapsedMessage(draft, pastes);
    if (!text.trim() && attachments.length === 0) return;

    const fullText = expandDraftForSend(draft, pastes);
    onSubmit({
      displayText: text.trimEnd(),
      fullText,
      attachments,
    });
    setDraft("");
    setPastes(new Map());
    caretDraftRef.current = 0;
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const demoLargePaste = () => {
    insertAtSelection(generateSamplePaste(1640));
  };

  const clear = () => {
    setDraft("");
    setPastes(new Map());
    caretDraftRef.current = 0;
    taRef.current?.focus();
  };

  const activePastes = [...pastes.values()];

  return (
    <div className="border-t border-border bg-bg-elevated">
      {activePastes.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 sm:px-4">
          {activePastes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreview(p)}
              className="inline-flex items-center gap-1.5 rounded-full border border-chip-border bg-chip px-2.5 py-1 font-mono text-xs text-chip-fg transition-colors hover:border-border-strong hover:text-fg"
              title="Click to preview full paste"
            >
              <ClipboardPaste className="size-3 opacity-70" aria-hidden />
              {p.label}
            </button>
          ))}
          <span className="self-center text-xs text-fg-subtle">
            Full content kept off the input — click to preview
          </span>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-3 sm:px-4">
        <span
          className="mb-2.5 select-none font-mono text-sm text-prompt"
          aria-hidden
        >
          ›
        </span>
        <textarea
          ref={taRef}
          value={display}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          spellCheck={false}
          placeholder="Type a message, or paste a large log / file…"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50"
          aria-label="Session input"
        />
        <div className="mb-0.5 flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={demoLargePaste}
            disabled={disabled}
            className="hidden h-10 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg sm:inline-flex"
            title="Simulate pasting 1640 lines"
          >
            <ClipboardPaste className="size-3.5" aria-hidden />
            Demo paste
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={disabled || (!draft && pastes.size === 0)}
            className="inline-flex size-10 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg disabled:opacity-30"
            aria-label="Clear input"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || (!display.trim() && pastes.size === 0)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <SendHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2 font-mono text-[11px] text-fg-subtle sm:px-4">
        <span>
          Enter send · Shift+Enter newline · long paste →{" "}
          <span className="text-chip-fg">[Pasted text #N +lines]</span>
        </span>
        <button
          type="button"
          onClick={demoLargePaste}
          className="text-user underline-offset-2 hover:underline sm:hidden"
        >
          Demo 1640-line paste
        </button>
      </div>

      {preview && (
        <PastePreviewDialog
          paste={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function rebuildDraftFromDisplay(
  display: string,
  pastes: Map<number, PasteAttachment>,
): {
  draft: string;
  pastes: Map<number, PasteAttachment>;
  droppedIds: number[];
} {
  const entries = [...pastes.values()].sort(
    (a, b) => b.label.length - a.label.length,
  );
  let remaining = display;
  type Piece =
    | { kind: "text"; value: string }
    | { kind: "paste"; id: number };
  const pieces: Piece[] = [];
  const used = new Set<number>();

  while (remaining.length > 0) {
    let earliest = -1;
    let hit: PasteAttachment | null = null;
    for (const p of entries) {
      if (used.has(p.id)) continue;
      const idx = remaining.indexOf(p.label);
      if (idx === -1) continue;
      if (earliest === -1 || idx < earliest) {
        earliest = idx;
        hit = p;
      }
    }
    if (!hit || earliest === -1) {
      pieces.push({ kind: "text", value: remaining });
      break;
    }
    if (earliest > 0) {
      pieces.push({ kind: "text", value: remaining.slice(0, earliest) });
    }
    pieces.push({ kind: "paste", id: hit.id });
    used.add(hit.id);
    remaining = remaining.slice(earliest + hit.label.length);
  }

  let draft = "";
  for (const piece of pieces) {
    if (piece.kind === "text") draft += piece.value;
    else draft += encodePasteMarker(piece.id);
  }

  const droppedIds = [...pastes.keys()].filter((id) => !used.has(id));
  const nextPastes = new Map(pastes);
  for (const id of droppedIds) nextPastes.delete(id);

  return { draft, pastes: nextPastes, droppedIds };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function PastePreviewDialog({
  paste,
  onClose,
}: {
  paste: PasteAttachment;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const headLines = 40;
  const tailLines = 20;
  const lines = paste.content.split("\n");
  const truncated = lines.length > headLines + tailLines + 5;
  const previewText = truncated
    ? [
        ...lines.slice(0, headLines),
        "",
        `… ${lines.length - headLines - tailLines} lines omitted …`,
        "",
        ...lines.slice(-tailLines),
      ].join("\n")
    : paste.content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Paste preview"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-mono text-sm text-fg">{paste.label}</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {paste.lines.toLocaleString()} lines · {formatBytes(paste.bytes)} ·
              stored off-DOM until send
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            Close
          </button>
        </div>
        <pre className="overflow-auto p-4 font-mono text-xs leading-relaxed text-fg-muted">
          {previewText}
        </pre>
      </div>
    </div>
  );
}
