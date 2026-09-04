"use client";

import { useMemo } from "react";
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

// One column per fiscal quarter, one card per team in every column — so a
// column's card count is always MISSIONS.length, whether or not a team has
// written its own theme yet. Deliberately never falls back to the
// cross-cutting theme the way a Horizon column does: a shared theme isn't
// this team's theme, so a card either shows what that team actually wrote,
// or an honest reason it has nothing to show. Clicking a card sets the team
// filter to that team and opens the same editor Horizon/Timeline use — the
// editor itself always scopes to whatever team is currently active (see
// QuarterThemeModal.tsx), so there's no per-card "mission" prop to thread
// through it, just this one jump.
const QUARTER_COLOR = "#3DA5D9";

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
                          {theme.narrative && (
                            <div className="theme-card-narrative">{theme.narrative}</div>
                          )}
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
