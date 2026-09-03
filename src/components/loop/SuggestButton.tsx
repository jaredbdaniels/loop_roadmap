"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useAiEnabled } from "./useAi";

// Shared "✨ Suggest" affordance. Renders nothing when AI is off (flag or key
// missing), so every AI feature disappears cleanly rather than erroring — the
// graceful-degradation contract, enforced in one place.
export function SuggestButton({
  onClick,
  loading,
  children,
  title,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  const enabled = useAiEnabled();
  if (!enabled) return null;
  return (
    <button
      type="button"
      className="cm-button cm-button--small ai-suggest edit-only"
      onClick={onClick}
      disabled={loading}
      title={title}
    >
      {loading ? (
        <Loader2 size={13} strokeWidth={2.4} className="sync-spin" />
      ) : (
        <Sparkles size={13} strokeWidth={2.4} />
      )}
      {loading ? (
        <span className="ai-thinking-label">
          Thinking
          <span className="ai-thinking-dots">
            <span />
            <span />
            <span />
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
