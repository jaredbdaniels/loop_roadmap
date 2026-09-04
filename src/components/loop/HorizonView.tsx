"use client";

import { useMemo, useState } from "react";
import { HORIZONS, STAGE_COLORS, type HorizonKey } from "@/lib/loop/constants";
import {
  activeThemeMission,
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
  themeIsInherited,
  unmetDeps,
} from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";
import { visibleItems, withHorizon, withQuarter, withoutDates } from "./mutations";
import { MissionTag } from "./MissionTag";
import { ItemLink } from "./ItemLink";
import { AiSummaryPopover } from "./AiSummaryPopover";
import { trimItemForSummary } from "@/lib/ai/snapshot";
import { QuarterThemeAffordance } from "./QuarterThemeAffordance";

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
   bucketed off each item's own dates rather than a manual decision. Same
   cards, same drag-and-drop board, different question — "when does the dial
   say this happens" instead of "what did we decide about it". A card
   spanning several quarters lands in every column it touches, not just the
   one its start date falls in — otherwise "what's happening in Q2" would
   silently omit work that's still running through Q2 but started in Q1. */

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
function quarterCells(minStart: Date, maxStart: Date): QuarterCell[] {
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
  const { weights, filterMission } = useLoop();
  const teamScopeLabel =
    filterMission.length > 0 ? filterMission.join(", ") : "All teams";
  const nonBetInfo = HORIZONS.find((h) => h.key === "non-bet")!;
  // One shared color for every quarter cell — they're all the same kind of
  // column, just different slices of the calendar, unlike the call layout
  // where each column's color carries meaning (committed vs. queued vs. on
  // the radar).
  const quarterColor = "#3DA5D9";

  // One pass to bucket every item (scheduled-by-quarter, unscheduled,
  // non-bet) and track the scheduled date range, rather than re-filtering
  // the full item list once per bucket plus again for the cell range.
  // Memoized so an unrelated re-render (a poll tick, a drag-hover toggle)
  // doesn't redo this work or re-sort every bucket from scratch.
  const { cells, byQuarter, unscheduled, nonBet } = useMemo(() => {
    const byRank = (a: Item, b: Item) =>
      computeRank(b, weights) - computeRank(a, weights);
    const byQuarter = new Map<number, Item[]>();
    const unscheduled: Item[] = [];
    const nonBet: Item[] = [];
    let minStart = fiscalQuarterStart(new Date());
    let maxStart = minStart;
    for (let i = 0; i < 3; i++) maxStart = nextFiscalQuarterStart(maxStart);

    for (const item of items) {
      if (item.horizon === "non-bet") {
        nonBet.push(item);
        continue;
      }
      if (!isScheduled(item)) {
        unscheduled.push(item);
        continue;
      }
      const start = fiscalQuarterStart(parseDate(item.targetStart!));
      const end = fiscalQuarterStart(parseDate(item.targetEnd!));
      if (start < minStart) minStart = start;
      if (end > maxStart) maxStart = end;
      // Walk every quarter the item touches, not just the one it starts in —
      // this is the whole point of the by-quarter layout: it's the same card
      // object pushed into each bucket, so dragging any occurrence still
      // drags the one real item.
      let cursor = start;
      while (cursor <= end) {
        const idx = fiscalQuarterIndex(cursor);
        const bucket = byQuarter.get(idx);
        if (bucket) bucket.push(item);
        else byQuarter.set(idx, [item]);
        cursor = nextFiscalQuarterStart(cursor);
      }
    }

    unscheduled.sort(byRank);
    nonBet.sort(byRank);
    for (const bucket of byQuarter.values()) bucket.sort(byRank);

    return {
      cells: quarterCells(minStart, maxStart),
      byQuarter,
      unscheduled,
      nonBet,
    };
  }, [items, weights]);

  return (
    <div className="board-wrap">
      <div className="board">
        <DropColumn
          label="Unscheduled"
          desc="No target dates yet — drag here to clear a date."
          color="#A0A0A0"
          colItems={unscheduled}
          isNoop={(it) => !isScheduled(it) && it.horizon !== "non-bet"}
          onDropItem={withoutDates}
        />
        {cells.map((c) => {
          const cellItems = byQuarter.get(c.index) ?? [];
          return (
            <DropColumn
              key={c.index}
              quarterIndex={c.index}
              label={c.label}
              desc={`${c.season} · drag a card here to schedule it`}
              color={quarterColor}
              colItems={cellItems}
              isNoop={(it) =>
                isScheduled(it) &&
                it.horizon !== "non-bet" &&
                fiscalQuarterIndex(parseDate(it.targetStart!)) <= c.index &&
                fiscalQuarterIndex(parseDate(it.targetEnd!)) >= c.index
              }
              onDropItem={(it) => withQuarter(it, c.start, c.end)}
              headerAction={
                cellItems.length > 0 ? (
                  <AiSummaryPopover
                    feature="summary"
                    triggerLabel=""
                    triggerTitle={`Summarize ${c.label} (${teamScopeLabel})`}
                    align="right"
                    body={{
                      items: cellItems.map(trimItemForSummary),
                      scope: "quarter",
                      scopeLabel: `${c.label} — ${teamScopeLabel}`,
                    }}
                  />
                ) : undefined
              }
            />
          );
        })}
        <DropColumn
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

// Shared drag-and-drop column body for both Horizon layouts (Now/Next/Later
// and by-quarter) — they differ only in the no-op predicate and the drop
// mutation, so both HorizonColumn and the quarter board's cells render this.
// `quarterIndex` is set only for an actual fiscal-quarter column, which is
// what gates the theme affordance below.
function DropColumn({
  quarterIndex,
  label,
  desc,
  color,
  colItems,
  isNoop,
  onDropItem,
  wide = false,
  headerAction,
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
  wide?: boolean;
  // Extra chrome in the column header, right-aligned — currently just the
  // quarter layout's "summarize this quarter" button (see QuarterBoard). Not
  // wired for the Now/Next/Later layout: those columns are a manual editorial
  // call, not a calendar slice, so "meta narrative for this column" is a
  // different, not-yet-asked-for feature.
  headerAction?: React.ReactNode;
}) {
  const {
    items,
    dragId,
    updateItem,
    quarterlyThemes,
    filterMission,
    openQuarterlyTheme,
    shareMode,
  } = useLoop();
  const [over, setOver] = useState(false);
  // Team-scoped when exactly one team is filtered, else the cross-cutting
  // theme — see quarterThemeForIndex() and activeThemeMission() in logic.ts.
  const activeMission = activeThemeMission(filterMission);
  const theme =
    quarterIndex !== undefined
      ? quarterThemeForIndex(quarterlyThemes, quarterIndex, activeMission)
      : undefined;

  return (
    <div
      className={"column" + (over ? " drop-ok" : "")}
      style={{
        ...(wide ? { width: "auto" } : {}),
        ["--column-color" as string]: color,
      }}
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
        {headerAction}
      </div>
      <div className="hz-col-desc">{desc}</div>
      {quarterIndex !== undefined && (
        <QuarterThemeAffordance
          theme={theme}
          shareMode={shareMode}
          onOpen={() => openQuarterlyTheme(quarterIndex)}
          className="hz-col-theme"
          emptyClassName="hz-col-theme--empty"
          filledTitle={
            theme?.title
              ? (theme.narrative || theme.title) +
                (themeIsInherited(theme, activeMission)
                  ? " (cross-cutting)"
                  : "")
              : undefined
          }
          emptyContent={
            activeMission ? `+ Add a theme for ${activeMission}` : "+ Add a theme"
          }
        />
      )}
      <div className="column-body">
        {colItems.map((item) => (
          <HorizonCard key={item.id} item={item} columnQuarterIndex={quarterIndex} />
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
  return (
    <DropColumn
      label={label}
      desc={desc}
      color={color}
      colItems={colItems}
      wide
      isNoop={(it) => (it.horizon || "unassigned") === hKey}
      onDropItem={(it) => withHorizon(it, hKey)}
    />
  );
}

function HorizonCard({
  item,
  columnQuarterIndex,
}: {
  item: Item;
  // Which quarter column this particular occurrence is rendered in — set
  // only by the by-quarter board, where a multi-quarter item is pushed into
  // every quarter it spans. Drives the continuation marker below so the same
  // card showing up more than once reads as "still running", not a bug.
  columnQuarterIndex?: number;
}) {
  const { items, dragId, openDetail, shareMode } = useLoop();
  const [ghost, setGhost] = useState(false);

  const mm = horizonMismatch(item);
  const waiting = unmetDeps(item, items);
  const deadDeps = killedDeps(item, items);
  const prog = subProgress(item);
  const draggable = !item.killed && !shareMode;
  const stageColor = STAGE_COLORS[item.stage];

  // Continuation marker: only meaningful inside a quarter column, and only
  // when the item's scheduled span actually crosses more than one quarter.
  let spanLabel: string | null = null;
  if (columnQuarterIndex !== undefined && isScheduled(item)) {
    const spanStart = fiscalQuarterIndex(parseDate(item.targetStart!));
    const spanEnd = fiscalQuarterIndex(parseDate(item.targetEnd!));
    if (spanEnd > spanStart) {
      if (columnQuarterIndex === spanStart) spanLabel = "continues ▸";
      else if (columnQuarterIndex === spanEnd) spanLabel = "◂ continued";
      else spanLabel = "◂ continues ▸";
    }
  }

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
      <div className="hz-dates">
        {fmtRange(item)}
        {spanLabel && (
          <span
            className="pill pill-span"
            title="This item's dates run past this quarter, so its card also appears in the quarter(s) it continues through."
          >
            {spanLabel}
          </span>
        )}
      </div>
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
