"use client";

import { useState } from "react";
import {
  dateForQuarterIndex,
  fiscalQuarterLabel,
  fiscalSeasonLabel,
  quarterThemeId,
} from "@/lib/loop/logic";
import type { QuarterlyTheme } from "@/lib/loop/types";
import { nowISO, useLoop } from "./store";

// Set or clear the narrative theme for one fiscal quarter. Opened from a click
// on a quarter's header in the Horizon quarter board or the Timeline quarter
// ruler (see HorizonView.tsx / TimelineView.tsx) — never from a toolbar "new"
// button, because every quarter is always a valid, addressable edit target,
// whether or not a theme has been set for it yet.
export function QuarterThemeModal({ userEmail }: { userEmail: string | null }) {
  const {
    quarterlyThemeEditIndex,
    closeQuarterlyTheme,
    quarterlyThemes,
    saveQuarterlyTheme,
    toast,
    readOnly,
  } = useLoop();

  const quarterIndex = quarterlyThemeEditIndex;
  const existing =
    quarterIndex !== null
      ? quarterlyThemes.find((t) => t.quarterIndex === quarterIndex) ?? null
      : null;

  return quarterIndex !== null ? (
    <QuarterThemeForm
      key={quarterIndex}
      quarterIndex={quarterIndex}
      existing={existing}
      readOnly={readOnly}
      onClose={closeQuarterlyTheme}
      onSave={saveQuarterlyTheme}
      toast={toast}
      userEmail={userEmail}
    />
  ) : null;
}

function QuarterThemeForm({
  quarterIndex,
  existing,
  readOnly,
  onClose,
  onSave,
  toast,
  userEmail,
}: {
  quarterIndex: number;
  existing: QuarterlyTheme | null;
  readOnly: boolean;
  onClose: () => void;
  onSave: (t: QuarterlyTheme) => void;
  toast: (msg: string, warn?: boolean) => void;
  userEmail: string | null;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [narrative, setNarrative] = useState(existing?.narrative ?? "");

  const quarterDate = dateForQuarterIndex(quarterIndex);
  const quarterLabel = `${fiscalQuarterLabel(quarterDate)} · ${fiscalSeasonLabel(quarterDate)}`;

  // Always an upsert, never a create/delete pair: a blank title is what "no
  // theme this quarter" looks like, the same way an outlook with nothing
  // stated is the same as no row. So there's no title-required guard here
  // the way MilestoneModal has one, and no delete button.
  const save = () => {
    const theme: QuarterlyTheme = {
      id: existing?.id ?? quarterThemeId(quarterIndex),
      quarterIndex,
      title: title.trim(),
      narrative: narrative.trim(),
      updatedBy: userEmail ?? "",
      updatedAt: nowISO(),
    };
    onSave(theme);
    toast(theme.title ? "Quarter theme saved." : "Quarter theme cleared.");
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>{quarterLabel} theme</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
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
            </div>
          </fieldset>
        </div>
        <div className="modal-actions">
          <span className="helper">
            Shown as this quarter&rsquo;s headline on the Horizon quarter board
            and the Timeline ruler. Clear the title to remove it.
          </span>
          {!readOnly && (
            <button className="cm-button" onClick={save}>
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
