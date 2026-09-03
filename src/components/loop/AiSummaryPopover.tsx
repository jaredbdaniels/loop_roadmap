"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";
import type { Audience, Format, Length } from "./ai-summary-options";

// Shared trigger + popover for every "AI summary" button in the app (quarter
// column, Timeline toolbar, Bet theme chip). `body` is the feature-specific,
// audience-independent part of the request (e.g. { items, scope, scopeLabel }
// for "summary", or { bets, theme } for "theme-summary") — plain data, not a
// callback, so a Server Component (like BetDetail) can compute it and pass it
// straight through without crossing the server/client boundary with a function.
export function AiSummaryPopover({
  feature,
  body,
  triggerLabel = "Summarize",
  triggerTitle,
  align = "left",
}: {
  feature: string;
  body: Record<string, unknown>;
  triggerLabel?: string;
  triggerTitle?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("exec");
  const [length, setLength] = useState<Length>("medium");
  const [format, setFormat] = useState<Format>("prose");
  const [text, setText] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ai = useAiSuggestion<{ text: string }>(feature);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Picking a control only updates the selection — it doesn't fire a request.
  // The user reviews their choices, then generates explicitly, so nothing
  // regenerates (and no summary is spent) until they ask for it.
  const generate = async () => {
    const { data, error } = await ai.run({ ...body, audience, length, format });
    setText(data?.text ?? error ?? "Couldn't generate a summary.");
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard access denied — nothing actionable from here */
    }
  };

  return (
    <div className="ai-summary-popover" ref={rootRef}>
      <SuggestButton
        loading={false}
        onClick={() => setOpen((o) => !o)}
        title={triggerTitle}
      >
        {triggerLabel}
      </SuggestButton>
      {open && (
        <div
          className={"ai-summary-panel" + (align === "right" ? " align-right" : "")}
          role="dialog"
          aria-label={`${triggerLabel} panel`}
        >
          <div className="segmented ai-summary-audience" role="tablist" aria-label="Audience">
            {(["exec", "team"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={audience === a}
                className={audience === a ? "active" : ""}
                disabled={ai.loading}
                onClick={() => setAudience(a)}
              >
                {a === "exec" ? "Exec" : "Team"}
              </button>
            ))}
          </div>
          <div className="segmented ai-summary-length" role="tablist" aria-label="Length">
            {(["short", "medium", "long"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={length === l}
                className={length === l ? "active" : ""}
                disabled={ai.loading}
                onClick={() => setLength(l)}
              >
                {l === "short" ? "Short" : l === "medium" ? "Medium" : "Long"}
              </button>
            ))}
          </div>
          <div className="segmented ai-summary-format" role="tablist" aria-label="Format">
            {(["prose", "bullets"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={format === f}
                className={format === f ? "active" : ""}
                disabled={ai.loading}
                onClick={() => setFormat(f)}
              >
                {f === "prose" ? "Prose" : "Bullets"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cm-button cm-button--small"
            disabled={ai.loading}
            onClick={generate}
          >
            {ai.loading ? (
              <Loader2 size={13} strokeWidth={2.4} className="sync-spin" />
            ) : (
              <Sparkles size={13} strokeWidth={2.4} />
            )}
            {ai.loading ? (
              <span className="ai-thinking-label">
                Thinking
                <span className="ai-thinking-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            ) : text === null ? (
              "Generate summary"
            ) : (
              "Regenerate"
            )}
          </button>
          {text && !ai.loading && (
            <>
              <div className="ai-panel ai-summary-text">{text}</div>
              <button
                type="button"
                className="cm-button--outlined cm-button cm-button--small"
                onClick={copy}
              >
                <Copy size={13} strokeWidth={2.2} />
                Copy
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
