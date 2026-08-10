"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { useLoop } from "./store";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";
import { isIntake } from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";

// Render an item's KR as a compact reading for the summary prompt.
function krReading(it: Item): string {
  const k = it.kr;
  if (!k?.metric) return "";
  const bits: string[] = [];
  if (k.baseline != null && k.target != null)
    bits.push(`${k.baseline} → ${k.target}${k.unit ? " " + k.unit : ""}`);
  else if (k.target != null) bits.push(`target ${k.target}${k.unit ? " " + k.unit : ""}`);
  if (k.current != null) bits.push(`now ${k.current}`);
  return `${k.metric}${bits.length ? ": " + bits.join(", ") : ""}`;
}
function windowOf(it: Item): string {
  if (it.targetStart && it.targetEnd) return `${it.targetStart} → ${it.targetEnd}`;
  if (it.targetStart) return `from ${it.targetStart}`;
  return "";
}

// Manage the single active read-only share link: view, generate, copy,
// regenerate (rotate the secret), and revoke. Backed by the auth-gated
// /api/share route — only signed-in Campminder users reach this dialog.
export function ShareModal() {
  const { shareOpen, setShareOpen, toast, items } = useLoop();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const summaryAi = useAiSuggestion<{ text: string }>("summary");

  // Build the trimmed, non-sensitive snapshot the summary prompt runs on —
  // same rule as getPublicState: no killed items, no activity log, and nothing
  // still parked in Intake. This summary is written for an exec audience, so a
  // captured-but-unpromoted idea appearing in it would be read as a plan.
  const runSummary = async () => {
    const snapshot = items
      .filter((it) => !it.killed && !isIntake(it))
      .map((it) => ({
        title: it.title,
        mission: it.mission,
        stage: it.stage,
        horizon: it.horizon,
        kr: krReading(it),
        window: windowOf(it),
      }));
    if (!snapshot.length) return toast("Nothing to summarize yet.", true);
    const { data, error } = await summaryAi.run({ items: snapshot, audience: "exec" });
    if (!data) return toast(error ?? "Couldn't generate a summary.", true);
    setSummary(data.text);
  };

  const copySummary = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      toast("Summary copied to clipboard.");
    } catch {
      toast("Could not copy — select and copy manually.", true);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/share", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { link: { token: string } | null };
      setToken(data.link?.token ?? null);
    } catch {
      toast("Could not load the share link.", true);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Refresh whenever the dialog opens.
  useEffect(() => {
    if (shareOpen) load();
  }, [shareOpen, load]);

  if (!shareOpen) return null;

  const close = () => setShareOpen(false);
  const shareUrl = token
    ? `${window.location.origin}/share/${token}`
    : null;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/share", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      toast(token ? "Share link regenerated." : "Share link created.");
    } catch {
      toast("Could not update the share link.", true);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/share", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setToken(null);
      toast("Share link revoked.");
    } catch {
      toast("Could not revoke the share link.", true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("Link copied to clipboard.");
    } catch {
      toast("Could not copy — select and copy the link manually.", true);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>Share the roadmap</h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="helper" style={{ marginBottom: 16 }}>
            Anyone with this link can view the roadmap read-only — no Campminder
            login required. Killed ideas and internal activity notes are hidden
            from the shared view. Treat the link as a secret; regenerate it to
            invalidate the old one.
          </p>

          {loading ? (
            <p className="helper">Loading…</p>
          ) : shareUrl ? (
            <div className="field">
              <label>Read-only link</label>
              <div className="share-link-row">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="cm-button--outlined cm-button"
                  onClick={copy}
                >
                  <Copy size={15} strokeWidth={2.2} />
                  Copy
                </button>
              </div>
            </div>
          ) : (
            <p className="helper">No active share link yet.</p>
          )}

          <div className="field ai-summary">
            <label>Roadmap summary</label>
            <p className="helper" style={{ marginTop: 0 }}>
              Generate a plain-English update from the current board to paste
              alongside the link.
            </p>
            <div className="ai-inline">
              <SuggestButton
                loading={summaryAi.loading}
                onClick={runSummary}
                title="Generate an exec summary of the current roadmap"
              >
                Generate summary
              </SuggestButton>
              {summary && (
                <button className="cm-button--outlined cm-button" onClick={copySummary}>
                  <Copy size={15} strokeWidth={2.2} />
                  Copy
                </button>
              )}
            </div>
            {summary && <div className="ai-panel ai-summary-text">{summary}</div>}
          </div>
        </div>
        <div className="modal-actions">
          {shareUrl ? (
            <button
              className="link-button"
              onClick={revoke}
              disabled={busy}
            >
              <Trash2 size={14} strokeWidth={2.2} />
              Revoke
            </button>
          ) : (
            <span />
          )}
          <button className="cm-button" onClick={generate} disabled={busy}>
            <RefreshCw size={15} strokeWidth={2.2} />
            {shareUrl ? "Regenerate" : "Create link"}
          </button>
        </div>
      </div>
    </div>
  );
}
