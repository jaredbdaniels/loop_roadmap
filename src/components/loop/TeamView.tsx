"use client";

import type { Item } from "@/lib/loop/types";
import {
  MISSIONS,
  MISSION_INFO,
  STAGES,
  STAGE_COLORS,
} from "@/lib/loop/constants";
import { computeRank, computeStats, resolveDomain } from "@/lib/loop/logic";
import { DOMAINS } from "@/lib/loop/taxonomy";
import { useLoop } from "./store";
import { visibleItems } from "./mutations";
import { MissionTag } from "./MissionTag";
import { NotionLink } from "./NotionLink";

// A collapsible section in the Team view. `color` tints an bet group's
// header dot; `mission` (when set) renders the MissionTag for a team group.
// Domain/unclaimed groups set neither and render a plain label.
interface Group {
  key: string;
  label: string;
  color?: string;
  mission?: string;
  purpose?: string;
  rows: Item[];
}

export function TeamView() {
  const {
    items,
    weights,
    filterMission,
    filterBet,
    filterOwner,
    groupBy,
    showKilled,
    bets,
    openDetail,
  } = useLoop();
  const vis = visibleItems(
    items,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
  );
  const byStageOrder = (a: Item, b: Item) =>
    STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);

  let groups: Group[];
  if (groupBy === "domain") {
    groups = DOMAINS.map((d) => ({
      key: d.id,
      label: d.label,
      purpose: d.owner ? `Owned by ${d.owner}` : undefined,
      rows: vis.filter((i) => resolveDomain(i) === d.id).sort(byStageOrder),
    })).filter((g) => g.rows.length > 0);
  } else if (groupBy === "bet") {
    groups = [
      ...bets.map((init) => ({
        key: init.id,
        label: init.title,
        color: init.color,
        rows: vis
          .filter((i) => (i.betIds || []).includes(init.id))
          .sort(byStageOrder),
      })),
      {
        key: "__none__",
        label: "No bet",
        rows: vis
          .filter((i) => (i.betIds || []).length === 0)
          .sort(byStageOrder),
      },
    ].filter((g) => g.rows.length > 0);
  } else {
    groups = MISSIONS.map((mission) => ({
      key: mission,
      label: mission,
      mission,
      purpose: MISSION_INFO[mission],
      rows: vis.filter((i) => i.mission === mission).sort(byStageOrder),
    })).filter((g) => g.rows.length > 0);
    // Catch-all safety net: visible work whose team isn't in the known roster
    // (e.g. renamed/removed in a reorg) surfaces in a trailing "Unclaimed" group
    // instead of dropping out of the view entirely.
    const known = new Set<string>(MISSIONS);
    const orphans = vis
      .filter((i) => !known.has(i.mission))
      .sort(byStageOrder);
    if (orphans.length)
      groups.push({ key: "__unclaimed__", label: "Unclaimed", rows: orphans });
  }

  if (!groups.length) {
    return (
      <div className="team-view">
        <p className="team-empty">No items match the current filter.</p>
      </div>
    );
  }

  return (
    <div className="team-view">
      {groups.map(({ key, label, color, mission, purpose, rows }) => {
        const stats = computeStats(rows);
        // Distribution across the pipeline, active items only (matches stats).
        const byStage = STAGES.map((stage) => ({
          stage,
          count: rows.filter((i) => !i.killed && i.stage === stage).length,
        })).filter((s) => s.count > 0);

        return (
          <div className="team-group" key={key}>
            <div className="team-group-header">
              {color !== undefined ? (
                <span className="team-group-name">
                  <span
                    className="init-dot"
                    style={{ background: color }}
                    aria-hidden
                  />
                  {label}
                </span>
              ) : mission !== undefined ? (
                <MissionTag mission={mission} />
              ) : (
                <span className="team-group-name">{label}</span>
              )}
              <span>
                {rows.length} item{rows.length === 1 ? "" : "s"}
              </span>
            </div>

            {purpose && <p className="team-purpose">{purpose}</p>}

            <div className="team-health">
              <div
                className="stage-dist-bar"
                role="img"
                aria-label={
                  "Stage distribution: " +
                  (byStage.map((s) => `${s.stage} ${s.count}`).join(", ") ||
                    "no active items")
                }
              >
                {byStage.map((s) => (
                  <span
                    key={s.stage}
                    className="stage-dist-seg"
                    style={{
                      flexGrow: s.count,
                      ["--seg-color" as string]: STAGE_COLORS[s.stage],
                    }}
                    title={`${s.stage}: ${s.count}`}
                  />
                ))}
              </div>
              <div className="team-stats">
                <span className="team-stat">
                  {stats.framedRate}% framed
                </span>
                <span className="team-stat">
                  {stats.learnRate}% shipped w/ outcome
                </span>
                {showKilled && stats.killedCount > 0 && (
                  <span className="team-stat">
                    {stats.killedCount} killed
                  </span>
                )}
              </div>
            </div>

            <div className="team-col-head">
              <div>Item</div>
              <div>Stage</div>
              <div>Rank</div>
              <div>Status</div>
            </div>

            {rows.map((item) => {
              const rank = computeRank(item, weights);
              const showRank =
                STAGES.indexOf(item.stage) >= STAGES.indexOf("Frame");
              const sub = (item.problemStatement || "Not framed yet").slice(
                0,
                90,
              );
              const status = item.adoStatus
                ? "ADO: " + item.adoStatus
                : item.outcomeReading
                  ? "Outcome recorded"
                  : "—";
              return (
                <div
                  key={item.id}
                  className="team-row"
                  style={{ ["--column-color" as string]: STAGE_COLORS[item.stage] }}
                  onClick={() => openDetail(item.id)}
                >
                  <div>
                    <div className="row-title">
                      {item.title}
                      {item.killed && (
                        <span className="pill pill-killed"> Killed</span>
                      )}
                      <NotionLink
                        url={item.notionUrl}
                        title={item.notionTitle}
                        variant="glyph"
                      />
                    </div>
                    <div className="row-sub">
                      {sub}
                      {(item.problemStatement || "").length > 90 ? "…" : ""}
                    </div>
                  </div>
                  <div className="stage-chip">{item.stage}</div>
                  <div className="row-sub">{showRank ? "Rank " + rank : "—"}</div>
                  <div className="row-sub">{status}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
