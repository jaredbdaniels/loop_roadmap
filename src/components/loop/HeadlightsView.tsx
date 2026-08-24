"use client";

import { useState } from "react";
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
  const months = rollingMonths(3);

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

  const teamItems = items.filter(
    (i) => !i.killed && i.mission === selectedTeam,
  );
  const undated = teamItems.filter(
    (i) =>
      (LIFECYCLE_STAGES as readonly string[]).includes(i.stage) &&
      !i.targetStart &&
      !i.targetEnd,
  );

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
              {months.map((m) => (
                <div className="hl-month-head" key={m}>
                  {monthLabel(m)}
                </div>
              ))}

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
                    const cellItems = teamItems.filter(
                      (i) => i.stage === stage && itemInMonth(i, m),
                    );
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
            </div>
          </div>

          {undated.length > 0 && (
            <p className="hl-note">
              {undated.length} item{undated.length === 1 ? "" : "s"} on{" "}
              {selectedTeam} {undated.length === 1 ? "has" : "have"} no target
              dates set, so {undated.length === 1 ? "it isn't" : "they aren't"}{" "}
              placed on the board above: {undated.map((i) => i.title).join(", ")}.
            </p>
          )}

          <div className="hl-outlook-heading">
            <h3>Delivery outlook</h3>
          </div>
          <div className="hl-outlook-strip">
            {months.map((m) => (
              <OutlookCard
                key={`${selectedTeam}-${m}`}
                mission={selectedTeam}
                month={m}
                existing={outlooks.find(
                  (o) => o.id === outlookId(selectedTeam, m),
                )}
                readOnly={readOnly}
                userEmail={userEmail}
              />
            ))}
          </div>
        </>
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
            const outlook = outlooks.find(
              (o) => o.id === outlookId(mission, month),
            );
            const activeCount = items.filter(
              (i) =>
                !i.killed &&
                i.mission === mission &&
                (LIFECYCLE_STAGES as readonly string[]).includes(i.stage),
            ).length;
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
                      style={{
                        ["--level-color" as string]:
                          OUTLOOK_LEVEL_INFO[outlook.level].color,
                      }}
                    >
                      {OUTLOOK_LEVEL_INFO[outlook.level].label}
                    </span>
                  ) : (
                    <span className="hl-rollup-unset">Not set</span>
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

function OutlookCard({
  mission,
  month,
  existing,
  readOnly,
  userEmail,
}: {
  mission: string;
  month: string;
  existing: DeliveryOutlook | undefined;
  readOnly: boolean;
  userEmail: string | null;
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
  };

  return (
    <div
      className="hl-outlook-card"
      style={{
        ["--level-color" as string]: level
          ? OUTLOOK_LEVEL_INFO[level].color
          : "var(--cm-border-strong)",
      }}
    >
      <div className="hl-outlook-top">
        <span className="hl-outlook-month">{monthLabel(month)}</span>
        <select
          className="cm-select hl-level-select"
          aria-label={`${monthLabel(month)} delivery outlook`}
          value={level}
          disabled={readOnly}
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

      <label className="hl-field-label">Why</label>
      <textarea
        className="hl-textarea"
        placeholder="Why is confidence at this level?"
        value={reasoning}
        disabled={readOnly}
        onChange={(e) => setReasoning(e.target.value)}
      />

      <label className="hl-field-label">What would raise it</label>
      <textarea
        className="hl-textarea"
        placeholder="What's needed to raise confidence?"
        value={whatWouldRaiseIt}
        disabled={readOnly}
        onChange={(e) => setWhatWouldRaiseIt(e.target.value)}
      />

      <label className="hl-field-label">Risks (one per line)</label>
      <textarea
        className="hl-textarea"
        placeholder="Top risks or dependencies this month."
        value={risksText}
        disabled={readOnly}
        onChange={(e) => setRisksText(e.target.value)}
      />

      <label className="hl-field-label">Asks of leadership (one per line)</label>
      <textarea
        className="hl-textarea"
        placeholder="A decision, a connection, a resource."
        value={asksText}
        disabled={readOnly}
        onChange={(e) => setAsksText(e.target.value)}
      />

      {!readOnly && (
        <button type="button" className="cm-button" onClick={save}>
          Save
        </button>
      )}

      {existing?.updatedBy && (
        <p className="hl-updated-by">
          Last updated by {existing.updatedBy}
        </p>
      )}
    </div>
  );
}
