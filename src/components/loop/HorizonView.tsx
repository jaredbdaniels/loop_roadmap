"use client";

import { useState } from "react";
import { HORIZONS, STAGE_COLORS, type HorizonKey } from "@/lib/loop/constants";
import {
  computeRank,
  fmtRange,
  horizonMismatch,
  itemLink,
  killedDeps,
  subProgress,
  unmetDeps,
} from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";
import { visibleItems, withHorizon } from "./mutations";
import { MissionTag } from "./MissionTag";
import { ItemLink } from "./ItemLink";

export function HorizonView() {
  const {
    items,
    weights,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
  } = useLoop();
  const vis = visibleItems(
    items,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
  );
  return (
    <div className="horizon-view">
      <div className="horizon-board">
        {HORIZONS.map((h) => {
          const colItems = vis
            .filter((i) => (i.horizon || "unassigned") === h.key)
            .sort((a, b) => computeRank(b, weights) - computeRank(a, weights));
          return (
            <HorizonColumn
              key={h.key}
              hKey={h.key}
              label={h.label}
              color={h.color}
              desc={h.desc}
              colItems={colItems}
            />
          );
        })}
      </div>
    </div>
  );
}

function HorizonColumn({
  hKey,
  label,
  color,
  desc,
  colItems,
}: {
  hKey: HorizonKey;
  label: string;
  color: string;
  desc: string;
  colItems: Item[];
}) {
  const { items, dragId, updateItem } = useLoop();
  const [over, setOver] = useState(false);

  return (
    <div
      className={"column" + (over ? " drop-ok" : "")}
      style={{ width: "auto", ["--column-color" as string]: color }}
      onDragOver={(e) => {
        if (!dragId.current) return;
        const it = items.find((i) => i.id === dragId.current);
        if (it && !it.killed) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const it = items.find((i) => i.id === dragId.current);
        dragId.current = null;
        if (!it || it.killed || (it.horizon || "unassigned") === hKey) return;
        updateItem(withHorizon(it, hKey));
      }}
    >
      <div className="column-header">
        <span className="col-title">{label}</span>
        <span className="col-count">{colItems.length}</span>
      </div>
      <div className="hz-col-desc">{desc}</div>
      <div className="column-body">
        {colItems.map((item) => (
          <HorizonCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function HorizonCard({ item }: { item: Item }) {
  const { items, dragId, openDetail, shareMode } = useLoop();
  const [ghost, setGhost] = useState(false);

  const mm = horizonMismatch(item);
  const waiting = unmetDeps(item, items);
  const deadDeps = killedDeps(item, items);
  const prog = subProgress(item);
  const draggable = !item.killed && !shareMode;
  const stageColor = STAGE_COLORS[item.stage];

  return (
    <div
      className={"card" + (item.killed ? " killed" : "") + (ghost ? " drag-ghost" : "")}
      style={{ ["--column-color" as string]: stageColor }}
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
      }}
      onClick={() => openDetail(item.id)}
    >
      <div>
        <MissionTag mission={item.mission} className="pill pill-mission" />
        <span
          className="pill"
          style={{ background: stageColor + "1f", color: stageColor }}
        >
          {item.stage}
        </span>
        {item.submitter?.type === "agent" && (
          <span className="pill pill-agent">Agent</span>
        )}
        {item.killed && <span className="pill pill-killed">Killed</span>}
        {waiting.length > 0 && (
          <span
            className="pill pill-waiting"
            title={waiting.map((w) => w.title).join(", ")}
          >
            Waiting on {waiting.length}
          </span>
        )}
        {deadDeps.length > 0 && (
          <span
            className="pill pill-killed"
            title={deadDeps.map((w) => w.title).join(", ")}
          >
            Depends on killed item
          </span>
        )}
        {mm && (
          <span
            className="pill pill-mismatch"
            title="Manual horizon disagrees with target dates"
          >
            Dates say {mm.charAt(0).toUpperCase() + mm.slice(1)}
          </span>
        )}
        {prog && (
          <span className="pill pill-progress">
            {prog.done}/{prog.total} done
          </span>
        )}
      </div>
      <h3>{item.title}</h3>
      <div className="hz-dates">{fmtRange(item)}</div>
      {/* Ungated for the same reason as the board card: share mode strips
          `edit-only`, and the link has to survive there. The empty state's
          invitation does not — so in share mode an unlinked item skips the
          footer rather than drawing its border around nothing. */}
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
