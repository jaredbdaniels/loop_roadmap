"use client";

import type { Weights } from "@/lib/loop/types";
import { useLoop } from "./store";

// No Votes slider: voting was removed from Loop and `computeRank` no longer
// reads `weights.votes`. The stored weight is left alone rather than zeroed, so
// the tuning survives if voting ever comes back (see types.ts `Weights`).
const SLIDERS: { label: string; key: keyof Weights }[] = [
  { label: "Reach weight", key: "reach" },
  { label: "Confidence weight", key: "confidence" },
  { label: "Strategic fit weight", key: "strategicFit" },
];

export function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    weights,
    updateWeights,
    items,
    clearAllDependencies,
  } = useLoop();
  if (!settingsOpen) return null;

  const close = () => setSettingsOpen(false);

  const depCount = items.reduce(
    (n, i) => n + (i.dependsOn || []).length,
    0,
  );
  const onClearDeps = () => {
    if (depCount === 0) return;
    if (
      confirm(
        `Remove all ${depCount} dependency link(s) across every item? Dates and everything else stay put — only the item-to-item links are cleared. This cannot be undone.`,
      )
    )
      clearAllDependencies();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>Ranking weights</h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
        <p className="helper" style={{ marginBottom: 16 }}>
          Rank score = (reach × w) + (confidence × w) + (strategic fit × w).
          Every input is a judgement someone can argue with, not a popularity
          count. Adjust the weights so the number stays defensible.
        </p>
        {SLIDERS.map(({ label, key }) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <div className="slider-row">
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={weights[key]}
                onChange={(e) =>
                  updateWeights({ ...weights, [key]: +e.target.value })
                }
              />
              <span className="slider-val">{weights[key]}</span>
            </div>
          </div>
        ))}
        <div className="settings-divider" />
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Dependencies</label>
          <p className="helper" style={{ marginBottom: 10 }}>
            Dependencies are only for sequenced work — one item that can&apos;t
            start until another finishes. Link them by dragging between bars on
            the timeline, or from an item&apos;s detail panel. Start from a clean
            slate here.
          </p>
          <button
            className="cm-button cm-button--outlined settings-danger"
            onClick={onClearDeps}
            disabled={depCount === 0}
          >
            {depCount === 0
              ? "No dependencies to clear"
              : `Clear all dependencies (${depCount})`}
          </button>
        </div>
        </div>
        <div className="modal-actions">
          <span className="helper">
            Changes apply live and are saved for the whole team.
          </span>
          <button className="cm-button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
