"use client";

import { useState } from "react";
import { HORIZONS, STAGE_COLORS, type HorizonKey } from "@/lib/loop/constants";
import {
  computeRank,
  fiscalQuarterIndex,
  fiscalQuarterLabel,
  fiscalQuarterStart,
  fiscalSeasonLabel,
  fmtRange,
  horizonMismatch,
  isScheduled,
  itemLink,
  killedDeps,
  nextFiscalQuarterStart,
  parseDate,
  quarterThemeForIndex,
  subProgress,
  unmetDeps,
} from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";
import { visibleItems, withHorizon, withQuarter, withoutDates } from "./mutations";
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
    shareMode,
    horizonLayout,
  } = useLoop();
  const vis = visibleItems(
    items,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
    shareMode,
  );

  if (horizonLayout === "quarter") return <QuarterBoard items={vis} />;

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

/* ---------------- by-quarter layout ----------------
   The alternative to the Now/Next/Later call: one column per fiscal quarter,
   bucketed off each item's own targetStart rather than a manual decision.
   Same cards, same drag-and-drop board, different question — "when does the
   dial say this happens" instead of "what did we decide about it". A card
   spanning several quarters still lands in only one column (the one its start
   date falls in), the same simplification a Kanban lane already makes about
   stage. */

interface QuarterCell {
  index: number;
  label: string;
  season: string;
  start: Date;
  end: Date;
}

// Fiscal quarters as a column can never be blank at a glance: always spans
// at least today's quarter through three more, stretched further out to cover
// whatever is actually scheduled. "non-bet" items are excluded from both the
// bucketing and the range math — a declined call has no business stretching
// the calendar, which is why it gets its own trailing column below instead.
function quarterCells(items: Item[]): QuarterCell[] {
  const scheduled = items.filter(
    (i) => isScheduled(i) && i.horizon !== "non-bet",
  );
  let minStart = fiscalQuarterStart(new Date());
  let maxStart = minStart;
  for (let i = 0; i < 3; i++) maxStart = nextFiscalQuarterStart(maxStart);
  scheduled.forEach((i) => {
    const s = fiscalQuarterStart(parseDate(i.targetStart!));
    if (s < minStart) minStart = s;
    if (s > maxStart) maxStart = s;
  });
  const cells: QuarterCell[] = [];
  let cursor = minStart;
  while (cursor <= maxStart) {
    const end = nextFiscalQuarterStart(cursor);
    cells.push({
      index: fiscalQuarterIndex(cursor),
      label: fiscalQuarterLabel(cursor),
      season: fiscalSeasonLabel(cursor),
      start: cursor,
      end,
    });
    cursor = end;
  }
  return cells;
}

function QuarterBoard({ items }: { items: Item[] }) {
  const { weights } = useLoop();
  const byRank = (a: Item, b: Item) =>
    computeRank(b, weights) - computeRank(a, weights);

  const cells = quarterCells(items);
  const unscheduled = items
    .filter((i) => !isScheduled(i) && i.horizon !== "non-bet")
    .sort(byRank);
  const nonBet = items.filter((i) => i.horizon === "non-bet").sort(byRank);
  const nonBetInfo = HORIZONS.find((h) => h.key === "non-bet")!;
  // One shared color for every quarter cell — they're all the same kind of
  // column, just different slices of the calendar, unlike the call layout
  // where each column's color carries meaning (committed vs. queued vs. on
  // the radar).
  const quarterColor = "#3DA5D9";

  return (
    <div className="board-wrap">
      <div className="board">
        <QuarterColumn
          label="Unscheduled"
          desc="No target dates yet — drag here to clear a date."
          color="#A0A0A0"
          colItems={unscheduled}
          isNoop={(it) => !isScheduled(it) && it.horizon !== "non-bet"}
          onDropItem={withoutDates}
        />
        {cells.map((c) => (
          <QuarterColumn
            key={c.index}
            quarterIndex={c.index}
            label={c.label}
            desc={`${c.season} · drag a card here to schedule it`}
            color={quarterColor}
            colItems={items
              .filter(
                (i) =>
                  isScheduled(i) &&
                  i.horizon !== "non-bet" &&
                  fiscalQuarterIndex(parseDate(i.targetStart!)) === c.index,
              )
              .sort(byRank)}
            isNoop={(it) =>
              isScheduled(it) &&
              it.horizon !== "non-bet" &&
              fiscalQuarterIndex(parseDate(it.targetStart!)) === c.index
            }
            onDropItem={(it) => withQuarter(it, c.start, c.end)}
          />
        ))}
        <QuarterColumn
          label={nonBetInfo.label}
          desc={nonBetInfo.desc}
          color={nonBetInfo.color}
          colItems={nonBet}
          isNoop={(it) => it.horizon === "non-bet"}
          onDropItem={(it) => withHorizon(it, "non-bet")}
        />
      </div>
    </div>
  );
}

function QuarterColumn({
  quarterIndex,
  label,
  desc,
  color,
  colItems,
  isNoop,
  onDropItem,
}: {
  // Set only for an actual fiscal-quarter column — the "Unscheduled" and
  // non-bet trailing columns aren't quarters, so they get no theme affordance.
  quarterIndex?: number;
  label: string;
  desc: string;
  color: string;
  colItems: Item[];
  // Whether dropping `item` here is a no-op (it's already in this column) —
  // skips the mutation so the drop doesn't bump updatedAt or log an activity
  // line for a card that didn't actually move.
  isNoop: (item: Item) => boolean;
  onDropItem: (item: Item) => Item;
}) {
  const { items, dragId, updateItem, quarterlyThemes, openQuarterlyTheme, shareMode } =
    useLoop();
  const [over, setOver] = useState(false);
  const theme =
    quarterIndex !== undefined
      ? quarterThemeForIndex(quarterlyThemes, quarterIndex)
      : undefined;

  return (
    <div
      className={"column" + (over ? " drop-ok" : "")}
      style={{ ["--column-color" as string]: color }}
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
        if (!it || it.killed || isNoop(it)) return;
        updateItem(onDropItem(it));
      }}
    >
      <div className="column-header">
        <span className="col-title">{label}</span>
        <span className="col-count">{colItems.length}</span>
      </div>
      <div className="hz-col-desc">{desc}</div>
      {quarterIndex !== undefined &&
        (theme?.title ? (
          shareMode ? (
            <div className="hz-col-theme" title={theme.narrative || theme.title}>
              {theme.title}
            </div>
          ) : (
            <button
              type="button"
              className="hz-col-theme"
              title={theme.narrative || theme.title}
              onClick={() => openQuarterlyTheme(quarterIndex)}
            >
              {theme.title}
            </button>
          )
        ) : (
          !shareMode && (
            <button
              type="button"
              className="hz-col-theme hz-col-theme--empty"
              onClick={() => openQuarterlyTheme(quarterIndex)}
            >
              + Add a theme
            </button>
          )
        ))}
      <div className="column-body">
        {colItems.map((item) => (
          <HorizonCard key={item.id} item={item} />
        ))}
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
          className="pill pill-stage"
          style={{ ["--stage-color" as string]: stageColor }}
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
