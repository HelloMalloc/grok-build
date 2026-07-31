import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Info,
  MessageSquare,
  Terminal,
  Zap,
} from "lucide-react";
import { SessionInput } from "./SessionInput";
import { runPasteSelfCheck } from "@/lib/cli/paste.test-manual";
import type { PasteAttachment } from "@/lib/cli/paste";

type Role = "system" | "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  displayText: string;
  fullText: string;
  attachments: PasteAttachment[];
  /** Unix ms; null until client sets it (avoids SSR hydration mismatch) */
  ts: number | null;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const INTRO: Message[] = [
  {
    id: "intro-1",
    role: "system",
    displayText:
      "Session input with long-paste collapse. Paste a huge log or hit Demo paste — the input stays a short chip instead of freezing.",
    fullText: "",
    attachments: [],
    ts: null,
  },
  {
    id: "intro-2",
    role: "assistant",
    displayText:
      "Without collapse, a 1k+ line paste forces the textarea + React to reflow the entire string on every keystroke. Here, oversized pastes become [Pasted text #N +lines] tokens; full payload lives in a Map until you send or preview.",
    fullText: "",
    attachments: [],
    ts: null,
  },
];

export function SessionApp() {
  const [messages, setMessages] = useState<Message[]>(INTRO);
  const [toast, setToast] = useState<string | null>(null);
  const [selfCheck, setSelfCheck] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelfCheck(runPasteSelfCheck());
    // Stamp intro timestamps only on the client
    setMessages((prev) =>
      prev.map((m, i) =>
        m.ts == null ? { ...m, ts: Date.now() - (prev.length - i) * 1000 } : m,
      ),
    );
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const handleSubmit = (payload: {
    displayText: string;
    fullText: string;
    attachments: PasteAttachment[];
  }) => {
    const userMsg: Message = {
      id: uid(),
      role: "user",
      displayText: payload.displayText,
      fullText: payload.fullText,
      attachments: payload.attachments,
      ts: Date.now(),
    };

    const summary =
      payload.attachments.length > 0
        ? `Received ${payload.attachments.length} collapsed paste(s): ${payload.attachments
            .map((a) => a.label)
            .join(", ")}. Full body is ${payload.fullText.length.toLocaleString()} chars — transcript only shows the token so scrollback stays fast.`
        : `Got it (${payload.fullText.length} chars). Short messages stay inline; only large pastes collapse.`;

    const reply: Message = {
      id: uid(),
      role: "assistant",
      displayText: summary,
      fullText: summary,
      attachments: [],
      ts: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, reply]);
  };

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg-subtle">
            <Terminal className="size-4 text-fg-muted" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              CLI Session Input
            </h1>
            <p className="truncate text-xs text-fg-muted">
              Long-paste safe · Claude-style collapse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selfCheck !== null && (
            <span
              className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] sm:inline-flex ${
                selfCheck
                  ? "border-success/30 text-success"
                  : "border-danger/30 text-danger"
              }`}
            >
              <CheckCircle2 className="size-3" aria-hidden />
              {selfCheck ? "paste engine ok" : "paste engine fail"}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-subtle px-2 py-0.5 font-mono text-[11px] text-fg-muted">
            <Zap className="size-3 text-warn" aria-hidden />
            no freeze
          </span>
        </div>
      </header>

      <div className="shrink-0 border-b border-border bg-bg-subtle/50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-user" aria-hidden />
          <div className="space-y-1 text-sm text-fg-muted">
            <p>
              <strong className="font-medium text-fg">Problem:</strong> dumping
              thousands of lines into the session box freezes the whole UI
              because every character is mounted and re-laid-out.
            </p>
            <p>
              <strong className="font-medium text-fg">Fix:</strong> intercept
              paste, threshold long content, store full text off-DOM, show{" "}
              <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-chip-fg">
                [Pasted text #1 +1640 lines]
              </code>{" "}
              like other CLIs. Transcript keeps the chip; send still carries the
              full payload.
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ul className="space-y-4" aria-live="polite">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </ul>
          <div ref={bottomRef} />
        </div>

        <SessionInput onSubmit={handleSubmit} onToast={showToast} />
      </main>

      {toast && (
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-40 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-center text-xs text-fg shadow-lg sm:bottom-28"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const [showFull, setShowFull] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <li className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border ${
          isUser
            ? "bg-bg-subtle text-user"
            : isSystem
              ? "bg-bg-subtle text-fg-muted"
              : "bg-bg-subtle text-prompt"
        }`}
      >
        {isUser ? (
          <MessageSquare className="size-3.5" aria-hidden />
        ) : (
          <Terminal className="size-3.5" aria-hidden />
        )}
      </div>
      <div
        className={`min-w-0 max-w-[min(100%,36rem)] rounded-xl border px-3 py-2.5 ${
          isUser
            ? "border-border bg-bg-elevated"
            : isSystem
              ? "border-border/80 bg-bg-subtle/40"
              : "border-border bg-bg-elevated"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          <span>{isUser ? "you" : isSystem ? "system" : "cli"}</span>
          {message.ts != null && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={new Date(message.ts).toISOString()}>
                {new Date(message.ts).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-fg">
          {showFull && message.fullText
            ? message.fullText.slice(0, 4000) +
              (message.fullText.length > 4000
                ? `\n\n… (${(message.fullText.length - 4000).toLocaleString()} more chars truncated in view)`
                : "")
            : message.displayText}
        </p>
        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex rounded-full border border-chip-border bg-chip px-2 py-0.5 font-mono text-[11px] text-chip-fg"
              >
                {a.label}
              </span>
            ))}
            {message.fullText.length > message.displayText.length && (
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                className="text-[11px] text-user underline-offset-2 hover:underline"
              >
                {showFull ? "Show collapsed" : "Peek full body"}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
