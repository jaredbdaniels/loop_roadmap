"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { MISSIONS } from "@/lib/loop/constants";
import type { QuarterlyTheme } from "@/lib/loop/types";
import {
  dateForQuarterIndex,
  fiscalQuarterStart,
  isScheduled,
  itemsInFiscalQuarter,
  nextFiscalQuarterStart,
  parseDate,
  quarterCells,
} from "@/lib/loop/logic";
import { useLoop } from "./store";

// One column per fiscal quarter: an "All Teams" card up top for the
// cross-cutting theme, then one card per team below — so a column's
// per-team card count is always MISSIONS.length, whether or not a team has
// written its own theme yet. The per-team cards deliberately never fall
// back to the cross-cutting theme the way a Horizon column does: a shared
// theme isn't this team's theme, so a team's card either shows what that
// team actually wrote, or an honest reason it has nothing to show — the
// cross-cutting narrative gets its own card instead, up top, so the
// quarter's overall story is still visible without borrowing a team's slot.
// Clicking a card sets the team filter (to that team, or cleared for the
// meta card) and opens the same editor Horizon/Timeline use — the editor
// itself always scopes to whatever team is currently active (see
// QuarterThemeModal.tsx), so there's no per-card "mission" prop to thread
// through it, just this one jump.
const QUARTER_COLOR = "#3DA5D9";

// Clamps a theme's narrative to 3 lines and only offers a "Show more" toggle
// when the text actually overflows that clamp — a short narrative never
// grows a toggle it doesn't need. Measured once per narrative rather than on
// every resize: the clamp itself never changes shape from a card's own
// re-renders, only from a column genuinely narrowing, which is rare enough
// not to be worth the added complexity.
function ThemeNarrative({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight - el.clientHeight > 2);
  }, [text]);

  return (
    <>
      <div
        ref={ref}
        className={"theme-card-narrative" + (expanded ? "" : " theme-card-narrative--clamped")}
      >
        {text}
      </div>
      {overflowing && (
        <button
          type="button"
          className="theme-card-narrative-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

export function ThemesView() {
  const { items, quarterlyThemes, setFilterMission, openQuarterlyTheme, shareMode } =
    useLoop();

  // Same "always at least 3 quarters out" default as Horizon's quarter
  // board, stretched to also cover any quarter a theme has already been
  // written for — a theme set further out than anything is scheduled would
  // otherwise have no column to appear in.
  const cells = useMemo(() => {
    let minStart = fiscalQuarterStart(new Date());
    let maxStart = minStart;
    for (let i = 0; i < 3; i++) maxStart = nextFiscalQuarterStart(maxStart);

    for (const item of items) {
      if (item.horizon === "non-bet" || item.killed || !isScheduled(item)) continue;
      const start = fiscalQuarterStart(parseDate(item.targetStart!));
      const end = fiscalQuarterStart(parseDate(item.targetEnd!));
      if (start < minStart) minStart = start;
      if (end > maxStart) maxStart = end;
    }
    for (const theme of quarterlyThemes) {
      const d = dateForQuarterIndex(theme.quarterIndex);
      if (d < minStart) minStart = d;
      if (d > maxStart) maxStart = d;
    }

    return quarterCells(minStart, maxStart);
  }, [items, quarterlyThemes]);

  const openTeamTheme = (team: string, quarterIndex: number) => {
    setFilterMission([team]);
    openQuarterlyTheme(quarterIndex);
  };

  // The cross-cutting (mission null) row, opened the same way Horizon/
  // Timeline open it: clear the team filter so the editor scopes to "no
  // team", i.e. the cross-cutting theme (see activeThemeMission in logic.ts).
  const openMetaTheme = (quarterIndex: number) => {
    setFilterMission([]);
    openQuarterlyTheme(quarterIndex);
  };

  return (
    <div className="board-wrap">
      <div className="board">
        {cells.map((cell) => {
          const scheduledTeams = new Set(
            itemsInFiscalQuarter(items, cell.index).map((i) => i.mission),
          );
          const teamThemes = new Map<string, QuarterlyTheme>(
            quarterlyThemes
              .filter((t) => t.quarterIndex === cell.index && t.mission && t.title.trim())
              .map((t) => [t.mission as string, t]),
          );
          const metaTheme = quarterlyThemes.find(
            (t) => t.quarterIndex === cell.index && t.mission === null && t.title.trim(),
          );

          return (
            <div
              key={cell.index}
              className="column"
              style={{ ["--column-color" as string]: QUARTER_COLOR }}
            >
              <div className="column-header">
                <span className="col-title">{cell.label}</span>
                <span className="col-count" title="Teams with a theme set / total teams">
                  {teamThemes.size}/{MISSIONS.length}
                </span>
              </div>
              <div className="hz-col-desc">{cell.season}</div>
              {(metaTheme || !shareMode) && (
                <div
                  className={
                    "card theme-card theme-card--meta" + (shareMode ? " theme-card--readonly" : "")
                  }
                  style={{ ["--column-color" as string]: QUARTER_COLOR }}
                  onClick={shareMode ? undefined : () => openMetaTheme(cell.index)}
                >
                  <div className="theme-card-team">All Teams</div>
                  {metaTheme ? (
                    <>
                      <div className="theme-card-title">{metaTheme.title}</div>
                      {metaTheme.narrative && <ThemeNarrative text={metaTheme.narrative} />}
                    </>
                  ) : (
                    <div className="theme-card-empty">
                      No cross-team theme set for this quarter yet.
                    </div>
                  )}
                </div>
              )}
              <div className="column-body">
                {MISSIONS.map((team) => {
                  const theme = teamThemes.get(team);
                  const hasWork = scheduledTeams.has(team);
                  return (
                    <div
                      key={team}
                      className={"card theme-card" + (shareMode ? " theme-card--readonly" : "")}
                      style={{ ["--column-color" as string]: QUARTER_COLOR }}
                      onClick={shareMode ? undefined : () => openTeamTheme(team, cell.index)}
                    >
                      <div className="theme-card-team">{team}</div>
                      {theme ? (
                        <>
                          <div className="theme-card-title">{theme.title}</div>
                          {theme.narrative && <ThemeNarrative text={theme.narrative} />}
                        </>
                      ) : (
                        <div className="theme-card-empty">
                          {hasWork
                            ? "Needs more information to set a theme."
                            : "No work in this quarter to set a theme around."}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
