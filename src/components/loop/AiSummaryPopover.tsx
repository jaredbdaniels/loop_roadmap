"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";
import { resolveSummaryOptions, type Audience, type Format, type Length } from "./ai-summary-options";

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

  // Accepts only the dimension the caller just changed — React state set in
  // this same tick isn't readable synchronously, so whichever of
  // audience/length/format was just clicked has to be passed explicitly,
  // while the other two fall back to current state.
  const generate = async (
    overrides: Partial<{ audience: Audience; length: Length; format: Format }> = {},
  ) => {
    const { audience: a, length: l, format: f } = resolveSummaryOptions(
      { audience, length, format },
      overrides,
    );
    setAudience(a);
    setLength(l);
    setFormat(f);
    const { data, error } = await ai.run({ ...body, audience: a, length: l, format: f });
    setText(data?.text ?? error ?? "Couldn't generate a summary.");
  };

  // Generate immediately the first time the popover opens, so the common case
  // (click the sparkle, read the summary) is one click, not two. Re-picking
  // any control afterwards just regenerates.
  useEffect(() => {
    if (open && text === null && !ai.loading) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
                onClick={() => generate({ audience: a })}
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
                onClick={() => generate({ length: l })}
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
                onClick={() => generate({ format: f })}
              >
                {f === "prose" ? "Prose" : "Bullets"}
              </button>
            ))}
          </div>
          {ai.loading && <p className="helper">Thinking…</p>}
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
