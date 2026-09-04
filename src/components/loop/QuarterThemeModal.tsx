"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  activeThemeMission,
  dateForQuarterIndex,
  fiscalQuarterLabel,
  fiscalSeasonLabel,
  quarterThemeId,
} from "@/lib/loop/logic";
import type { QuarterlyTheme } from "@/lib/loop/types";
import { nowISO, useLoop } from "./store";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";

// Set or clear the narrative theme for one fiscal quarter. Opened from a click
// on a quarter's header in the Horizon quarter board or the Timeline quarter
// ruler (see HorizonView.tsx / TimelineView.tsx) — never from a toolbar "new"
// button, because every quarter is always a valid, addressable edit target,
// whether or not a theme has been set for it yet.
//
// Scoped by the active team filter (activeThemeMission — exactly one team
// selected): with a single team in view this edits that team's own theme;
// with zero or several teams in view it edits the cross-cutting theme shown
// everywhere else. See quarterThemeForIndex() in logic.ts for how the two are
// reconciled when rendering a column/cell.
export function QuarterThemeModal({ userEmail }: { userEmail: string | null }) {
  const {
    quarterlyThemeEditIndex,
    closeQuarterlyTheme,
    quarterlyThemes,
    filterMission,
    saveQuarterlyTheme,
    refresh,
    toast,
    readOnly,
  } = useLoop();

  const quarterIndex = quarterlyThemeEditIndex;
  const liveMission = activeThemeMission(filterMission);
  // Captured once when the modal opens for a given quarter, not recomputed
  // on every render: the team filter lives on the page behind this modal
  // and (for a keyboard user tabbing past the overlay) can still change
  // while the form is open. Recomputing live would remount the form
  // mid-edit — discarding unsaved text — and could retarget Save at a
  // different team's (or the cross-cutting) theme than the one opened.
  const [opened, setOpened] = useState<{
    quarterIndex: number;
    mission: string | null;
  } | null>(null);
  if (quarterIndex === null) {
    if (opened !== null) setOpened(null);
  } else if (opened?.quarterIndex !== quarterIndex) {
    setOpened({ quarterIndex, mission: liveMission });
  }
  const mission = opened?.quarterIndex === quarterIndex ? opened.mission : liveMission;
  // Looked up directly (not via quarterThemeForIndex) because editing needs
  // the *raw* row for the active scope, not the resolved-with-fallback theme
  // a column displays — a team with no theme of its own must edit a blank
  // form, even though the column it clicked is currently showing the
  // cross-cutting title as a fallback.
  const crossCutting =
    quarterIndex !== null
      ? (quarterlyThemes.find(
          (t) => t.quarterIndex === quarterIndex && t.mission === null,
        ) ?? null)
      : null;
  const teamTheme =
    quarterIndex !== null && mission
      ? (quarterlyThemes.find(
          (t) => t.quarterIndex === quarterIndex && t.mission === mission,
        ) ?? null)
      : null;
  const existing = mission ? teamTheme : crossCutting;

  return quarterIndex !== null ? (
    <QuarterThemeForm
      key={`${quarterIndex}:${mission ?? ""}`}
      quarterIndex={quarterIndex}
      mission={mission}
      existing={existing}
      inheritedFrom={mission && !teamTheme?.title ? crossCutting : null}
      readOnly={readOnly}
      onClose={closeQuarterlyTheme}
      onSave={saveQuarterlyTheme}
      onRefresh={refresh}
      toast={toast}
      userEmail={userEmail}
    />
  ) : null;
}

function QuarterThemeForm({
  quarterIndex,
  mission,
  existing,
  inheritedFrom,
  readOnly,
  onClose,
  onSave,
  onRefresh,
  toast,
  userEmail,
}: {
  quarterIndex: number;
  mission: string | null;
  existing: QuarterlyTheme | null;
  // The cross-cutting theme this team is currently falling back to, when it
  // has none of its own — null once the team has its own title, or when
  // `mission` is null (already editing the cross-cutting row).
  inheritedFrom: QuarterlyTheme | null;
  readOnly: boolean;
  onClose: () => void;
  onSave: (t: QuarterlyTheme) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  toast: (msg: string, warn?: boolean) => void;
  userEmail: string | null;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [narrative, setNarrative] = useState(existing?.narrative ?? "");
  const [refreshing, setRefreshing] = useState(false);
  // The background poll that normally keeps this data current is paused for
  // as long as this modal is open (see pollPausedRef in store.tsx) — on
  // purpose, so a pull mid-edit can't swap the record out from under someone
  // typing. That means someone else's update to this same title/narrative
  // (a teammate editing it concurrently, or a bulk description refresh)
  // won't show up here until the modal is closed and reopened, unless the
  // user explicitly asks for it with this button. `existing` is a fresh
  // object on every refresh (normalizeQuarterThemes always re-spreads), so
  // this effect fires once per completed refresh even when nothing changed.
  const pendingRefreshRef = useRef(false);
  useEffect(() => {
    if (!pendingRefreshRef.current) return;
    pendingRefreshRef.current = false;
    setTitle(existing?.title ?? "");
    setNarrative(existing?.narrative ?? "");
    toast("Pulled the latest saved theme.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  // Blocks closing until the save round-trips. Closing right after firing the
  // request (the previous behaviour) let the background poll resume before
  // the write was confirmed — a poll landing in that window would refetch
  // pre-save state and silently overwrite the just-added theme. Waiting here
  // keeps the poll paused (quarterlyThemeEditIndex stays non-null — see
  // store.tsx's pollPausedRef) for the entire request, not just until the
  // optimistic local update.
  const [saving, setSaving] = useState(false);
  const titleAi = useAiSuggestion<{ title: string }>("theme-title");

  const refreshFromServer = async () => {
    if (saving || refreshing) return;
    const dirty =
      title !== (existing?.title ?? "") || narrative !== (existing?.narrative ?? "");
    if (
      dirty &&
      !window.confirm(
        "Refreshing will discard your unsaved changes to this theme. Continue?",
      )
    ) {
      return;
    }
    setRefreshing(true);
    pendingRefreshRef.current = true;
    await onRefresh();
    setRefreshing(false);
  };

  const generateTitle = async () => {
    if (!narrative.trim()) return toast("Add a narrative to generate a title from first.", true);
    const { data, error } = await titleAi.run({ narrative: narrative.trim() });
    if (!data) return toast(error ?? "Couldn't generate a title.", true);
    setTitle(data.title);
  };

  const quarterDate = dateForQuarterIndex(quarterIndex);
  const quarterLabel = `${fiscalQuarterLabel(quarterDate)} · ${fiscalSeasonLabel(quarterDate)}`;

  // Always an upsert, never a create/delete pair: a blank title is what "no
  // theme this quarter" looks like, the same way an outlook with nothing
  // stated is the same as no row. So there's no title-required guard here
  // the way MilestoneModal has one, and no delete button. For a team-scoped
  // row, blank also means "fall back to the cross-cutting theme" — see
  // quarterThemeForIndex().
  const save = async () => {
    if (saving) return;
    const theme: QuarterlyTheme = {
      id: existing?.id ?? quarterThemeId(quarterIndex, mission),
      quarterIndex,
      mission,
      title: title.trim(),
      narrative: narrative.trim(),
      updatedBy: userEmail ?? "",
      updatedAt: nowISO(),
    };
    setSaving(true);
    const ok = await onSave(theme);
    setSaving(false);
    // blocked()/a failed fetch already raised their own warning toast inside
    // onSave — don't follow it with a contradictory "saved" toast, and don't
    // close, so the unconfirmed edit stays visible (and the poll stays
    // paused) instead of silently vanishing on the next refetch.
    if (!ok) return;
    toast(theme.title ? "Quarter theme saved." : "Quarter theme cleared.");
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            {quarterLabel} theme
            {mission ? <span className="modal-header-sub"> · {mission}</span> : null}
          </h2>
          <div className="modal-header-actions">
            {!readOnly && (
              <button
                className="modal-icon-button"
                onClick={refreshFromServer}
                disabled={saving || refreshing}
                aria-label="Refresh from latest saved theme"
                title="Pull the latest saved title and narrative for this quarter"
              >
                <RefreshCw size={14} strokeWidth={2.2} className={refreshing ? "sync-spin" : undefined} />
              </button>
            )}
            <button
              className="modal-close"
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">
          {inheritedFrom?.title && (
            <p className="helper" style={{ marginBottom: 16 }}>
              {mission} has no theme of its own for this quarter yet — the
              board is currently showing the cross-cutting theme, &ldquo;
              {inheritedFrom.title}&rdquo;. Saving a title here sets a theme
              just for {mission}.
            </p>
          )}
          {/* Read-only share view: fields are disabled and the save button
              below is hidden, so viewers can read but not edit. */}
          <fieldset
            disabled={readOnly}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            <div className="field">
              <label>Title</label>
              <input
                type="text"
                placeholder="e.g. Foundations for self-serve onboarding"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Narrative</label>
              <textarea
                placeholder="Why this quarter, in a sentence or two (optional)."
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
              />
              <div className="ai-inline">
                <SuggestButton
                  loading={titleAi.loading}
                  onClick={generateTitle}
                  title="Generate an outcome-based title from the narrative above"
                >
                  Generate title
                </SuggestButton>
              </div>
            </div>
          </fieldset>
        </div>
        <div className="modal-actions">
          <span className="helper">
            {mission
              ? `Shown as this quarter’s headline for ${mission} only, while ${mission} is the only team in view. Clear the title to fall back to the cross-cutting theme.`
              : "Shown as this quarter’s headline whenever no single team is filtered (“All Teams”, or several teams at once). A team viewing its own theme instead sees that one here. Clear the title to remove it."}
          </span>
          {!readOnly && (
            <button className="cm-button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
