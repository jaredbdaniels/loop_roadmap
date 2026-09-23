"use client";

import { useMemo, useState } from "react";
import {
  LIFECYCLE_STAGES,
  MISSIONS,
  MISSION_INFO,
  OUTLOOK_LEVELS,
  OUTLOOK_LEVEL_INFO,
  STAGE_COLORS,
  type LifecycleStage,
} from "@/lib/loop/constants";
import {
  fmtRange,
  itemInMonth,
  monthLabel,
  outlookId,
  rollingMonths,
} from "@/lib/loop/logic";
import type { DeliveryOutlook, Item, OutlookLevel } from "@/lib/loop/types";
import { useLoop } from "./store";

// One line per lifecycle band, shown under its name on the board — the same
// problem-space/solution-space language the Headlights process itself uses
// (see docs/launchpad-pivot.md and the Notion "Headlights Meetings" page).
const STAGE_BLURB: Record<LifecycleStage, string> = {
  Discovery: "problem-space — is it worth solving?",
  Solutioning: "solution-space — what should we build?",
  Building: "build-to-earn — shipping production software",
  Releasing: "into customers' hands — beta counts",
};

type HeadlightsMode = "board" | "rollup";

// Resolves an outlook level to its label + CSS color, or the shared "not yet
// stated" fallback — the one lookup both the rollup chip and the board's
// outlook-row summary read from, so a change to what a level looks like can
// never update one and miss the other.
function outlookLevelDisplay(
  level: OutlookLevel | null | undefined,
): { label: string; color: string } {
  return level
    ? OUTLOOK_LEVEL_INFO[level]
    : { label: "Not set", color: "var(--cm-border-strong)" };
}

export function HeadlightsView({ userEmail }: { userEmail: string | null }) {
  const {
    items,
    outlooks,
    filterMission,
    openDetail,
    readOnly,
    draftMode,
    forkScenario,
  } = useLoop();
  const [mode, setMode] = useState<HeadlightsMode>("board");
  const [selectedTeam, setSelectedTeam] = useState(
    filterMission[0] ?? MISSIONS[0],
  );
  // Only depends on "today", not on any prop/state — recomputed once per
  // mount rather than on every render; a day boundary is caught by remounting.
  const months = useMemo(() => rollingMonths(3), []);
  // The month the outlook-edit modal is open for, or null when it's closed.
  const [editingMonth, setEditingMonth] = useState<string | null>(null);

  const goToTeamBoard = (mission: string) => {
    setSelectedTeam(mission);
    setMode("board");
  };

  // Snapshots the *entire* live roadmap (every team, not just this one) into a
  // locked archive scenario — the same fork mechanism every scenario already
  // uses, just named for this team's cycle and never editable afterward. See
  // ScenarioKind in types.ts and docs/launchpad-pivot.md Phase 3.
  const submitForHeadlights = () => {
    const today = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    forkScenario(
      `${selectedTeam} — Headlights ${monthLabel(months[0])} (submitted ${today})`,
      "headlights-archive",
    );
  };

  const teamItems = useMemo(
    () => items.filter((i) => !i.killed && i.mission === selectedTeam),
    [items, selectedTeam],
  );
  const undated = useMemo(
    () =>
      teamItems.filter(
        (i) =>
          (LIFECYCLE_STAGES as readonly string[]).includes(i.stage) &&
          !i.targetStart &&
          !i.targetEnd,
      ),
    [teamItems],
  );
  // One bucket per stage/month cell, filled in a single pass over teamItems
  // instead of re-filtering the team's items for every one of the board's
  // (stages × months) cells on every render.
  const cellsByStageMonth = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of teamItems) {
      if (!(LIFECYCLE_STAGES as readonly string[]).includes(i.stage)) continue;
      for (const m of months) {
        if (!itemInMonth(i, m)) continue;
        const key = `${i.stage}|${m}`;
        const bucket = map.get(key);
        if (bucket) bucket.push(i);
        else map.set(key, [i]);
      }
    }
    return map;
  }, [teamItems, months]);
  const outlooksById = useMemo(
    () => new Map(outlooks.map((o) => [o.id, o])),
    [outlooks],
  );
  const outlookFor = (month: string) =>
    outlooksById.get(outlookId(selectedTeam, month));

  return (
    <div className="headlights-view">
      <div className="hl-toolbar">
        <div>
          <h2 className="hl-title">
            {mode === "board" ? `${selectedTeam} — Headlights` : "Headlights — all teams"}
          </h2>
          {mode === "board" && MISSION_INFO[selectedTeam] && (
            <p className="hl-purpose">{MISSION_INFO[selectedTeam]}</p>
          )}
          <p className="hl-sub">
            {mode === "board"
              ? "Rolling 3-month view, current month plus the next two — rendered from item stage and target dates, not re-entered by hand."
              : "Every team's current-month outlook in one sitting — the screen leadership actually reviews."}
          </p>
        </div>
        <div className="hl-toolbar-actions">
          <div className="segmented" role="tablist" aria-label="Headlights mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "board"}
              className={mode === "board" ? "active" : ""}
              onClick={() => setMode("board")}
            >
              Team board
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "rollup"}
              className={mode === "rollup" ? "active" : ""}
              onClick={() => setMode("rollup")}
            >
              Leadership rollup
            </button>
          </div>
          {mode === "board" && (
            <select
              className="cm-select"
              aria-label="Team"
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {MISSIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {mode === "board" && !readOnly && (
            <button
              type="button"
              className="cm-button--outlined cm-button"
              disabled={draftMode}
              title={
                draftMode
                  ? "Switch to the live roadmap to submit a Headlights archive."
                  : "Archives a locked snapshot of the entire roadmap, named for this team's cycle."
              }
              onClick={submitForHeadlights}
            >
              Submit for Headlights
            </button>
          )}
        </div>
      </div>

      {mode === "rollup" ? (
        <LeadershipRollup
          items={items}
          outlooks={outlooks}
          month={months[0]}
          onSelectTeam={goToTeamBoard}
        />
      ) : (
        <>
          <div className="hl-board-scroll">
            <div className="hl-board">
              <div className="hl-corner">Lifecycle</div>
              {months.map((m) => {
                const outlook = outlookFor(m);
                return (
                  <div
                    className="hl-month-head"
                    key={m}
                    style={{
                      ["--outlook-color" as string]: outlook?.level
                        ? OUTLOOK_LEVEL_INFO[outlook.level].color
                        : "transparent",
                    }}
                  >
                    {monthLabel(m)}
                  </div>
                );
              })}

              {LIFECYCLE_STAGES.map((stage) => (
                <div className="hl-band-row" key={stage}>
                  <div
                    className="hl-band-label"
                    style={{ ["--band-color" as string]: STAGE_COLORS[stage] }}
                  >
                    <span className="hl-band-name">{stage}</span>
                    <span className="hl-band-blurb">{STAGE_BLURB[stage]}</span>
                  </div>
                  {months.map((m) => {
                    const cellItems =
                      cellsByStageMonth.get(`${stage}|${m}`) ?? [];
                    return (
                      <div className="hl-cell" key={m}>
                        {cellItems.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            className="hl-item-chip"
                            style={{
                              ["--chip-color" as string]: STAGE_COLORS[stage],
                            }}
                            title={fmtRange(item)}
                            onClick={() => openDetail(item.id)}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}

              {undated.length > 0 && (
                <div className="hl-band-row">
                  <div className="hl-band-label hl-unscheduled-label">
                    <span className="hl-band-name">Unscheduled</span>
                    <span className="hl-band-blurb">
                      no target dates — not placed above
                    </span>
                  </div>
                  <div className="hl-cell hl-unscheduled-cell">
                    {undated.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className="hl-item-chip hl-item-chip--unscheduled"
                        title="No target dates set"
                        onClick={() => openDetail(item.id)}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="hl-band-row hl-outlook-row">
                <div className="hl-band-label hl-outlook-label">
                  <span className="hl-band-name">Delivery outlook</span>
                  <span className="hl-band-blurb">
                    High / Medium / Low, this team, this month
                  </span>
                </div>
                {months.map((m) => (
                  <OutlookSummaryCell
                    key={m}
                    existing={outlookFor(m)}
                    readOnly={readOnly}
                    onOpen={() => setEditingMonth(m)}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {editingMonth && (
        <OutlookEditModal
          mission={selectedTeam}
          month={editingMonth}
          existing={outlookFor(editingMonth)}
          readOnly={readOnly}
          userEmail={userEmail}
          onClose={() => setEditingMonth(null)}
        />
      )}
    </div>
  );
}

function LeadershipRollup({
  items,
  outlooks,
  month,
  onSelectTeam,
}: {
  items: Item[];
  outlooks: DeliveryOutlook[];
  month: string;
  onSelectTeam: (mission: string) => void;
}) {
  const outlooksById = useMemo(
    () => new Map(outlooks.map((o) => [o.id, o])),
    [outlooks],
  );
  // One pass over every team's items instead of re-scanning the full,
  // all-teams items array once per mission in the render loop below.
  const activeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      if (i.killed) continue;
      if (!(LIFECYCLE_STAGES as readonly string[]).includes(i.stage)) continue;
      counts.set(i.mission, (counts.get(i.mission) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  return (
    <div className="hl-rollup-wrap">
      <table className="hl-rollup">
        <thead>
          <tr>
            <th>Team</th>
            <th>{monthLabel(month)} outlook</th>
            <th>Top risk</th>
          </tr>
        </thead>
        <tbody>
          {MISSIONS.map((mission) => {
            const outlook = outlooksById.get(outlookId(mission, month));
            const activeCount = activeCounts.get(mission) ?? 0;
            const { label, color } = outlookLevelDisplay(outlook?.level);
            return (
              <tr
                key={mission}
                className="hl-rollup-row"
                onClick={() => onSelectTeam(mission)}
              >
                <td>
                  <span className="hl-rollup-team">{mission}</span>
                  <span className="hl-rollup-count">
                    {activeCount} item{activeCount === 1 ? "" : "s"}
                  </span>
                </td>
                <td>
                  {outlook?.level ? (
                    <span
                      className="hl-rollup-chip"
                      style={{ ["--level-color" as string]: color }}
                    >
                      {label}
                    </span>
                  ) : (
                    <span className="hl-rollup-unset">{label}</span>
                  )}
                </td>
                <td className="hl-rollup-risk">
                  {outlook?.risks?.[0] ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The board-embedded, row-aligned read of a month's outlook — a big level
// chip plus the single top risk, sized to be read from across a room. This is
// what replaced the old below-the-board strip of full editing forms: the
// board itself is now the presentation surface, and editing moves into
// OutlookEditModal so a live "Why is this Medium?" conversation isn't reading
// off placeholder text in a textarea.
function OutlookSummaryCell({
  existing,
  readOnly,
  onOpen,
}: {
  existing: DeliveryOutlook | undefined;
  readOnly: boolean;
  onOpen: () => void;
}) {
  const level = existing?.level ?? null;
  const topRisk = existing?.risks?.[0];
  const { label, color } = outlookLevelDisplay(level);
  return (
    <button
      type="button"
      className="hl-cell hl-outlook-summary"
      style={{ ["--level-color" as string]: color }}
      onClick={onOpen}
    >
      {level ? (
        <span className="hl-outlook-chip">{label}</span>
      ) : (
        <span className="hl-outlook-chip hl-outlook-chip--unset">{label}</span>
      )}
      <span className="hl-outlook-risk">{topRisk || "No risk noted"}</span>
      <span className="hl-outlook-edit-hint">
        {readOnly ? "View detail" : "Edit ›"}
      </span>
    </button>
  );
}

function OutlookEditModal({
  mission,
  month,
  existing,
  readOnly,
  userEmail,
  onClose,
}: {
  mission: string;
  month: string;
  existing: DeliveryOutlook | undefined;
  readOnly: boolean;
  userEmail: string | null;
  onClose: () => void;
}) {
  const { saveOutlook, toast } = useLoop();
  const [level, setLevel] = useState<OutlookLevel | "">(
    existing?.level ?? "",
  );
  const [reasoning, setReasoning] = useState(existing?.reasoning ?? "");
  const [whatWouldRaiseIt, setWhatWouldRaiseIt] = useState(
    existing?.whatWouldRaiseIt ?? "",
  );
  const [risksText, setRisksText] = useState(
    (existing?.risks ?? []).join("\n"),
  );
  const [asksText, setAsksText] = useState((existing?.asks ?? []).join("\n"));

  const save = () => {
    const outlook: DeliveryOutlook = {
      id: outlookId(mission, month),
      mission,
      month,
      level: level || null,
      reasoning,
      whatWouldRaiseIt,
      risks: linesToList(risksText),
      asks: linesToList(asksText),
      updatedBy: userEmail ?? "",
      updatedAt: new Date().toISOString(),
    };
    saveOutlook(outlook);
    toast(`${monthLabel(month)} outlook saved.`);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            {mission} — {monthLabel(month)} outlook
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <fieldset
            disabled={readOnly}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            <div className="field">
              <label>Outlook</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as OutlookLevel | "")}
              >
                <option value="">Not set</option>
                {OUTLOOK_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {OUTLOOK_LEVEL_INFO[l].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Why</label>
              <textarea
                placeholder="Why is confidence at this level?"
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
              />
            </div>
            <div className="field">
              <label>What would raise it</label>
              <textarea
                placeholder="What's needed to raise confidence?"
                value={whatWouldRaiseIt}
                onChange={(e) => setWhatWouldRaiseIt(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Risks (one per line)</label>
              <textarea
                placeholder="Top risks or dependencies this month."
                value={risksText}
                onChange={(e) => setRisksText(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Asks of leadership (one per line)</label>
              <textarea
                placeholder="A decision, a connection, a resource."
                value={asksText}
                onChange={(e) => setAsksText(e.target.value)}
              />
            </div>
          </fieldset>
          {existing?.updatedBy && (
            <p className="hl-updated-by">Last updated by {existing.updatedBy}</p>
          )}
        </div>
        <div className="modal-actions">
          <span className="helper">
            Shown on the board as a color and a top-line risk — the rest is
            here for whoever is prepping the cycle, not for the room.
          </span>
          {!readOnly && (
            <button type="button" className="cm-button" onClick={save}>
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
