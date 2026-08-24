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
import type { DeliveryOutlook, OutlookLevel } from "@/lib/loop/types";
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
  const [selectedTeam, setSelectedTeam] = useState(
    filterMission[0] ?? MISSIONS[0],
  );
  const months = rollingMonths(3);

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
          <h2 className="hl-title">{selectedTeam} — Headlights</h2>
          {MISSION_INFO[selectedTeam] && (
            <p className="hl-purpose">{MISSION_INFO[selectedTeam]}</p>
          )}
          <p className="hl-sub">
            Rolling 3-month view, current month plus the next two — rendered
            from item stage and target dates, not re-entered by hand.
          </p>
        </div>
        <div className="hl-toolbar-actions">
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
          {!readOnly && (
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
            existing={outlooks.find((o) => o.id === outlookId(selectedTeam, m))}
            readOnly={readOnly}
            userEmail={userEmail}
          />
        ))}
      </div>
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
