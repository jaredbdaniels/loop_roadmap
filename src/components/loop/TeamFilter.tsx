"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MISSIONS, MISSION_INFO } from "@/lib/loop/constants";
import { useOutsideDismiss } from "./useOutsideDismiss";

// Team scope control for every view: see every team at once (nothing
// selected), drill into one, or pick several to compare side by side (e.g.
// both Platform teams at once). A native <select> can't express "several at
// once" without the awkward multi-attribute UI, so this is a checkbox
// dropdown instead.
export function TeamFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (missions: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useOutsideDismiss(rootRef, open, () => setOpen(false));

  const toggle = (mission: string) => {
    onChange(
      value.includes(mission)
        ? value.filter((m) => m !== mission)
        : [...value, mission],
    );
  };

  const label =
    value.length === 0
      ? "All teams"
      : value.length === 1
        ? value[0]
        : `${value.length} teams`;

  return (
    <div className="team-filter" ref={rootRef}>
      <button
        type="button"
        className={"cm-select team-filter-btn" + (value.length > 0 ? " active" : "")}
        aria-label="Filter by team"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="team-filter-label">{label}</span>
        <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <div className="team-filter-panel" role="menu">
          <label className="team-filter-option team-filter-all">
            <input
              type="checkbox"
              checked={value.length === 0}
              onChange={() => onChange([])}
            />
            All teams
          </label>
          <div className="team-filter-divider" />
          {MISSIONS.map((m) => (
            <label
              key={m}
              className="team-filter-option"
              title={MISSION_INFO[m]}
            >
              <input
                type="checkbox"
                checked={value.includes(m)}
                onChange={() => toggle(m)}
              />
              {m}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
