"use client";

import { useState } from "react";
import { ArrowDownWideNarrow, Plus } from "lucide-react";
import {
  ITEM_TYPE_INFO,
  LIFECYCLE_STAGES,
  STAGES,
  STAGE_COLORS,
  type Stage,
} from "@/lib/loop/constants";
import {
  byOrder,
  canEnterStage,
  chosenPrototype,
  computeRank,
  daysBetween,
  divergedNotConverged,
  fmtRange,
  isFramed,
  isScheduled,
  itemLink,
  krProgress,
  krStatus,
  laneOrder,
  livePrototypes,
  stageBlockReason,
  subProgress,
  unmetDeps,
} from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";
import { movedToStage, stageMoveKind, visibleItems } from "./mutations";
import { MissionTag } from "./MissionTag";
import { ItemLink } from "./ItemLink";

export function BoardView() {
  const { items, filterMission, showKilled, filterBet, filterOwner, shareMode } =
    useLoop();
  const vis = visibleItems(
    items,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
    shareMode,
  );
  // Share mode drops the Intake lane rather than drawing it empty: a column
  // headed "Intake 0" tells a stakeholder there is a pile they aren't being
  // shown, which is worse than not raising the question. This is the whole
  // reason LIFECYCLE_STAGES exists as its own constant.
  const lanes = shareMode ? LIFECYCLE_STAGES : STAGES;
  return (
    <div className="board-wrap">
      <div className="board">
        {lanes.map((stage) => (
          <Column key={stage} stage={stage} allVisible={vis} />
        ))}
      </div>
    </div>
  );
}

function Column({ stage, allVisible }: { stage: Stage; allVisible: Item[] }) {
  const {
    items,
    weights,
    dragId,
    updateItem,
    toast,
    celebrate,
    shareMode,
    openCapture,
  } = useLoop();
  const [drop, setDrop] = useState<"ok" | "no" | null>(null);

  // Cards sit in manual priority order (drag to reorder, or sort by value).
  const colItems = allVisible.filter((i) => i.stage === stage).sort(byOrder);

  // Framing and evidence are both Solutioning work, so both gates sit on the
  // way into Building — see stageBlockReason.
  const gateNote =
    stage === "Building"
      ? "Needs problem + KR and prototype evidence to enter"
      : stage === "Releasing"
        ? "Needs outcome reading to close"
        : "";

  const dragged = () => items.find((i) => i.id === dragId.current);

  // Place `it` in this lane immediately before `beforeId` (or at the end when
  // null), then reassign sequential order values across the whole lane so the
  // hand-ranked sequence persists. Handles the stage change + gate when the
  // card is dragged in from another lane. Operates on the full lane (not just
  // the visible subset) so a mission filter can't scramble hidden cards.
  const applyMove = (it: Item, beforeId: string | null) => {
    if (it.stage !== stage) {
      const reason = stageBlockReason(it, stage);
      if (reason) {
        toast(reason, true);
        return;
      }
    }
    const laneIds = items
      .filter((i) => i.stage === stage && i.id !== it.id)
      .sort(byOrder)
      .map((i) => i.id);
    let at = beforeId ? laneIds.indexOf(beforeId) : laneIds.length;
    if (at < 0) at = laneIds.length;
    laneIds.splice(at, 0, it.id);

    const orders = laneOrder(laneIds);
    laneIds.forEach((id) => {
      const cur = items.find((x) => x.id === id);
      if (!cur) return;
      let next = cur;
      if (id === it.id && cur.stage !== stage) {
        const kind = stageMoveKind(cur.stage, stage);
        next = movedToStage(cur, stage);
        // Every lane change gets a reaction: a ship rains confetti, a forward
        // step gets a cheer, a step back gets a gentle sigh.
        const label =
          kind === "ship"
            ? `Shipped: ${cur.title}`
            : kind === "advance"
              ? `→ ${stage}`
              : `Back to ${stage}`;
        celebrate({ kind, label });
      }
      if (next.order !== orders[id]) next = { ...next, order: orders[id] };
      if (next !== cur) updateItem(next);
    });
  };

  // Snap the lane to descending business-value order, then let the user
  // hand-tweak from there (the manual order is what persists).
  const sortByValue = () => {
    const laneIds = items
      .filter((i) => i.stage === stage)
      .sort((a, b) => computeRank(b, weights) - computeRank(a, weights))
      .map((i) => i.id);
    const orders = laneOrder(laneIds);
    laneIds.forEach((id) => {
      const cur = items.find((x) => x.id === id);
      if (cur && cur.order !== orders[id])
        updateItem({ ...cur, order: orders[id] });
    });
    toast(`Sorted ${stage} by business value.`);
  };

  return (
    <div
      className={
        "column" +
        (drop === "ok" ? " drop-ok" : "") +
        (drop === "no" ? " drop-no" : "")
      }
      style={{ ["--column-color" as string]: STAGE_COLORS[stage] }}
      onDragOver={(e) => {
        if (!dragId.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const it = dragged();
        setDrop(it && !it.killed && canEnterStage(it, stage) ? "ok" : "no");
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDrop(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(null);
        const it = dragged();
        dragId.current = null;
        if (!it || it.killed) return;
        applyMove(it, null);
      }}
    >
      <div className="column-header">
        <span className="col-title">{stage}</span>
        {!shareMode && colItems.length > 1 && (
          <button
            className="col-sort edit-only"
            type="button"
            title="Sort this lane by business value (highest first)"
            aria-label={`Sort ${stage} by business value`}
            onClick={sortByValue}
          >
            <ArrowDownWideNarrow size={13} strokeWidth={2.2} />
          </button>
        )}
        <span className="col-count">{colItems.length}</span>
      </div>
      {gateNote && <div className="gate-note">{gateNote}</div>}
      <div className="column-body">
        {colItems.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            onDropBefore={() => {
              const it = dragged();
              dragId.current = null;
              if (it && !it.killed) applyMove(it, item.id);
            }}
          />
        ))}
        {stage === "Intake" && !shareMode && (
          <button
            className="col-add edit-only"
            type="button"
            title="Capture a new idea"
            aria-label="Capture a new idea"
            onClick={() => openCapture()}
          >
            <Plus size={15} strokeWidth={2.4} />
            Capture idea
          </button>
        )}
      </div>
    </div>
  );
}

function BoardCard({
  item,
  onDropBefore,
}: {
  item: Item;
  onDropBefore: () => void;
}) {
  const { items, weights, dragId, openDetail, shareMode } = useLoop();
  const [ghost, setGhost] = useState(false);
  const [dropBefore, setDropBefore] = useState(false);

  const framed = isFramed(item);
  const krPct = krProgress(item.kr);
  const stageIdx = STAGES.indexOf(item.stage);
  const rank = computeRank(item, weights);
  // Ranking applies in every lane past Intake, since any lane can be
  // hand-ordered or sorted by value.
  const showRank = stageIdx >= STAGES.indexOf("Discovery");
  const daysOld = daysBetween(item.createdAt, new Date().toISOString());
  const waiting = unmetDeps(item, items);
  const prog = subProgress(item);
  const live = livePrototypes(item);
  const chosen = chosenPrototype(item);
  const diverged = divergedNotConverged(item);
  const draggable = !item.killed && !shareMode;

  return (
    <div
      className={
        "card" +
        (item.killed ? " killed" : "") +
        (ghost ? " drag-ghost" : "") +
        (dropBefore ? " drop-before" : "")
      }
      style={{ ["--column-color" as string]: STAGE_COLORS[item.stage] }}
      draggable={draggable}
      onDragStart={(e) => {
        dragId.current = item.id;
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => setGhost(true));
      }}
      onDragEnd={() => {
        dragId.current = null;
        setGhost(false);
        setDropBefore(false);
      }}
      onDragOver={(e) => {
        if (!dragId.current || dragId.current === item.id) return;
        // Allow dropping onto this card to insert the dragged card above it.
        e.preventDefault();
        setDropBefore(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropBefore(false);
      }}
      onDrop={(e) => {
        if (!dragId.current || dragId.current === item.id) return;
        e.preventDefault();
        e.stopPropagation();
        setDropBefore(false);
        onDropBefore();
      }}
      onClick={() => openDetail(item.id)}
    >
      <div>
        <MissionTag mission={item.mission} className="pill pill-mission" />
        {item.owner && (
          <span className="pill pill-owner" title={`Owner: ${item.owner}`}>
            {item.owner}
          </span>
        )}
        {item.type && (
          <span
            className="pill pill-type"
            style={{
              ["--type-fg" as string]: ITEM_TYPE_INFO[item.type].fg,
              ["--type-bg" as string]: ITEM_TYPE_INFO[item.type].bg,
              ["--type-fg-dark" as string]: ITEM_TYPE_INFO[item.type].fgDark,
              ["--type-bg-dark" as string]: ITEM_TYPE_INFO[item.type].bgDark,
            }}
          >
            {ITEM_TYPE_INFO[item.type].label}
          </span>
        )}
        {item.submitter?.type === "agent" && (
          <span className="pill pill-agent">Agent</span>
        )}
        {item.killed && <span className="pill pill-killed">Killed</span>}
        {!item.killed && item.stage === "Solutioning" && !framed && (
          <span className="pill pill-blocked">Needs problem + KR</span>
        )}
        {!item.killed &&
          item.stage === "Releasing" &&
          !(item.outcomeReading && item.outcomeReading.trim()) && (
            <span className="pill pill-needsoutcome">Needs outcome reading</span>
          )}
        {!item.killed && waiting.length > 0 && (
          <span
            className="pill pill-waiting"
            title={waiting.map((w) => w.title).join(", ")}
          >
            Waiting on {waiting.length}
          </span>
        )}
        {prog && (
          <span className="pill pill-progress">
            {prog.done}/{prog.total} done
          </span>
        )}
        {!item.killed && chosen && live.length > 1 && (
          <span
            className="pill pill-converged"
            title={"Converged on: " + (chosen.title || "a direction")}
          >
            Converged
          </span>
        )}
        {!item.killed && diverged && (
          <span
            className="pill pill-diverged"
            title={live.map((p) => p.title || "untitled").join(" · ")}
          >
            {live.length} directions
          </span>
        )}
      </div>
      <h3>{item.title}</h3>
      <div className="desc">{item.description || ""}</div>
      {item.kr.metric.trim() && (
        <div className="card-kr">
          <div className="card-kr-label">
            <span>{item.kr.metric}</span>
            {krPct !== null && (
              <span
                className="card-kr-val"
                style={{
                  color:
                    krStatus(item.kr) === "achieved"
                      ? "var(--cm-green)"
                      : "var(--cm-purple)",
                }}
              >
                {item.kr.current}
                {item.kr.unit ? " " + item.kr.unit : ""} / {item.kr.target}
                {item.kr.unit ? " " + item.kr.unit : ""}
              </span>
            )}
          </div>
          {krPct !== null && (
            <div className="card-kr-track">
              <div
                className="card-kr-fill"
                style={{
                  width: krPct + "%",
                  background:
                    krStatus(item.kr) === "achieved"
                      ? "var(--cm-green)"
                      : "var(--cm-purple)",
                }}
              />
            </div>
          )}
        </div>
      )}
      <div className="card-meta">
        <span>{isScheduled(item) ? fmtRange(item) : "Day " + daysOld}</span>
        {showRank && <span className="rank-score">Rank {rank}</span>}
      </div>
      {/* Not `edit-only`: that class is dropped in share mode, and the whole
          point of the link is to work on /share and /preview, which is where the
          roadmap actually gets reviewed. Only the empty state's invitation to add
          a link is gated, which is why share mode also has to check there's a
          link to show: an unlinked item would otherwise draw the footer's border
          around nothing. */}
      {!item.killed && (!shareMode || itemLink(item)) && (
        <div className="card-footer">
          <ItemLink
            item={item}
            variant="action"
            onRequestLink={shareMode ? undefined : () => openDetail(item.id)}
          />
        </div>
      )}
    </div>
  );
}
