"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  DAY,
  ITEM_TYPES,
  ITEM_TYPE_INFO,
  MISSIONS,
  STAGES,
  STAGE_COLORS,
  ZOOMS,
} from "@/lib/loop/constants";
import {
  blockerSatisfied,
  createsDepCycle,
  daysBetween,
  depConflicts,
  fiscalQuarterLabel,
  fiscalSeasonLabel,
  fmtRange,
  getItem,
  betEnvelope,
  betProgress,
  betTeams,
  isFiscalQuarterStartMonth,
  isScheduled,
  nextFiscalQuarterStart,
  parseDate,
  resolveDomain,
  snapToWeek,
  stackMilestoneFlags,
  subOutOfRange,
  subProgress,
  subScheduled,
  timelineRange,
  toISODate,
} from "@/lib/loop/logic";
import type { Bet, Item, Milestone, SubItem } from "@/lib/loop/types";
import { DOMAINS } from "@/lib/loop/taxonomy";
import type { SeasonLane } from "@/lib/loop/seasons";
import { useLoop } from "./store";
import { placedOnTimeline, visibleItems } from "./mutations";
import { MissionTag } from "./MissionTag";
import { ItemLink } from "./ItemLink";
import { SeasonLanes } from "./SeasonLanes";

interface DepPath {
  d: string;
  conflict: boolean;
  x2: number;
  y2: number;
}

// One stacked row of milestone flags, matching the step in globals.css. The two
// have to agree: this is what reserves the vertical space the CSS then uses.
const FLAG_ROW_H = 21;

// Estimated rendered width of a flag pill: 0.62rem bold runs about 5.6px per
// character, plus the diamond, the gap and the horizontal padding. Capped at the
// same max-width the CSS truncates at, or long titles would reserve room they
// never take. See stackMilestoneFlags on why this is estimated, not measured.
const flagWidth = (title: string) => Math.min(220, title.length * 5.6 + 34);

export function TimelineView() {
  const {
    items,
    bets,
    milestones,
    zoom,
    filterMission,
    filterBet,
    filterOwner,
    groupBy,
    showKilled,
    shareMode,
    openDetail,
    openBet,
    openMilestone,
    openCapture,
    updateItem,
    updateMilestone,
    toast,
    setEditing,
  } = useLoop();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = (id: string) => expanded[id] !== false;

  // The seasonality overlay lanes (see SeasonLanes.tsx). Local transient view
  // state like `expanded` above — closed by default because opening both pushes
  // every band down by ~520px, and the roadmap itself is what people came for.
  const [seasonLaneOpen, setSeasonLaneOpen] = useState<
    Record<SeasonLane, boolean>
  >({ camp: false, campminder: false });
  const toggleSeasonLane = (lane: SeasonLane) =>
    setSeasonLaneOpen((s) => ({ ...s, [lane]: !s[lane] }));

  // Transient view emphasis: highlight one bet's items across every band
  // and dim everything else. Not app-wide state — local to the timeline.
  const [focusBet, setFocusBet] = useState<string | null>(null);
  const toggleFocus = (id: string) =>
    setFocusBet((cur) => (cur === id ? null : id));

  // The cross-team bets summary lane (see BetBar below). Open by default,
  // unlike the season lanes, since it's the roadmap's own rollup rather than
  // outside context — but collapsible for the same reason: it still costs a
  // row per bet before the team bands even start.
  const [betsOpen, setBetsOpen] = useState(true);
  const toggleBets = () => setBetsOpen((o) => !o);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [depPaths, setDepPaths] = useState<DepPath[]>([]);

  const vis = visibleItems(
    items,
    filterMission,
    showKilled,
    filterBet,
    filterOwner,
  );
  const ppd = ZOOMS[zoom];
  const { start, end } = timelineRange(vis, milestones);
  const totalDays = daysBetween(start, end);

  // Milestones whose date lands inside the visible axis — drawn as flags pinned
  // across the top with a dashed line down the chart.
  const visibleMilestones = milestones.filter((m) => {
    if (!m.date) return false;
    const d = parseDate(m.date);
    return d >= start && d <= end;
  });

  // Flags stack into rows where they'd collide (see stackMilestoneFlags), and
  // the gutter below reserves the height they need. Without it the stack would
  // sit on top of the first band instead of above it.
  const flagRows = stackMilestoneFlags(
    visibleMilestones.map((m) => ({
      id: m.id,
      left: daysBetween(start, parseDate(m.date)) * ppd,
      width: flagWidth(m.title),
    })),
  );
  const flagRowCount = flagRows.size
    ? Math.max(...flagRows.values()) + 1
    : 0;

  // Whether an item bar counts as belonging to the focused bet (used to
  // dim everything outside it when one bet is clicked for emphasis).
  const inFocus = (item: Item) =>
    focusBet === null || (item.betIds || []).includes(focusBet);

  // ----- header cells -----
  const monthCells: { width: number; label: string }[] = [];
  // Each quarter cell carries both names: the season is what people say out
  // loud, the FY label is what ADO and finance speak. See logic.ts.
  const quarterCells: { width: number; season: string; label: string }[] = [];
  const gridLines: { left: number; q: boolean }[] = [];
  {
    let cursor = new Date(start);
    while (cursor < end) {
      const mDays = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0,
      ).getDate();
      const mName = cursor.toLocaleDateString("en-US", {
        month: zoom === "year" ? "narrow" : "short",
      });
      monthCells.push({
        width: mDays * ppd,
        label: zoom === "month" ? mName + " " + cursor.getFullYear() : mName,
      });
      // Campminder's fiscal quarters start Sep/Dec/Mar/Jun, so the boundaries
      // are one month off the calendar quarter — ask the fiscal calendar rather
      // than testing `month % 3` (see logic.ts).
      const qStart = isFiscalQuarterStartMonth(cursor);
      if (qStart || quarterCells.length === 0) {
        let qEnd = nextFiscalQuarterStart(cursor);
        if (qEnd > end) qEnd = end;
        quarterCells.push({
          width: daysBetween(cursor, qEnd) * ppd,
          season: fiscalSeasonLabel(cursor),
          label: fiscalQuarterLabel(cursor),
        });
      }
      gridLines.push({
        left: daysBetween(start, cursor) * ppd,
        q: qStart,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  const scheduled = vis.filter(isScheduled);
  const byStart = (a: Item, b: Item) =>
    +parseDate(a.targetStart!) - +parseDate(b.targetStart!);

  // A horizontal band of bars. `mission` is set for team bands (enables the
  // create-by-gesture and the MissionTag label); it's null for bet
  // bands, which label with the bet's title and color instead.
  interface Band {
    key: string;
    label: string;
    mission: string | null;
    color?: string;
    group: Item[];
  }

  // Team bands follow MISSIONS order (the taxonomy's team order, grouped by
  // core domain). The Bets rollup still sits above them.
  const orderedMissions = MISSIONS;

  let bands: Band[];
  if (groupBy === "domain") {
    // One band per domain, an item's domain resolved from its module (the
    // durable anchor) with a team fallback. resolveDomain never returns null —
    // anything unmapped lands in the "unclaimed" domain — so no work is dropped.
    bands = DOMAINS.map((d) => ({
      key: d.id,
      label: d.owner ? `${d.label} · ${d.owner}` : d.label,
      mission: null,
      group: scheduled.filter((i) => resolveDomain(i) === d.id).sort(byStart),
    })).filter((b) => b.group.length > 0);
  } else if (groupBy === "bet") {
    bands = [
      ...bets.map((init) => ({
        key: init.id,
        label: init.title,
        mission: null,
        color: init.color,
        group: scheduled
          .filter((i) => (i.betIds || []).includes(init.id))
          .sort(byStart),
      })),
      {
        key: "__none__",
        label: "No bet",
        mission: null,
        group: scheduled
          .filter((i) => (i.betIds || []).length === 0)
          .sort(byStart),
      },
    ].filter((b) => b.group.length > 0);
  } else {
    bands = orderedMissions
      .map((mission) => ({
        key: mission,
        label: mission,
        mission,
        group: scheduled.filter((i) => i.mission === mission).sort(byStart),
      }))
      .filter((b) => b.group.length > 0);
    // Catch-all safety net: scheduled work whose team isn't in the known roster
    // (e.g. a team renamed or removed in a reorg) would otherwise match no band
    // and silently disappear. Surface it in a trailing "Unclaimed" band instead.
    const known = new Set<string>(orderedMissions);
    const orphans = scheduled.filter((i) => !known.has(i.mission)).sort(byStart);
    if (orphans.length)
      bands.push({
        key: "__unclaimed__",
        label: "Unclaimed",
        mission: null,
        group: orphans,
      });
  }

  // Top summary lane (team grouping only): one read-only envelope bar per
  // bet, rolled up from its linked items under the current filters. In
  // bet grouping the bands themselves are the bets, so it's off.
  const betBands =
    groupBy === "team"
      ? bets
          .map((init) => ({
            init,
            env: betEnvelope(init, vis),
            prog: betProgress(init, vis),
            teams: betTeams(init, vis),
          }))
          .filter((b) => b.env !== null)
      : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLeft =
    today >= start && today <= end ? daysBetween(start, today) * ppd : null;

  const unscheduled = vis.filter((i) => !isScheduled(i) && !i.killed);

  // ----- pinning the ruler and the seasonality lanes -----
  // The page scrolls, not the pane: the stats and the filters are meant to go
  // away, and only the time context — the season/quarter ruler, the months,
  // and the seasonality lanes under them — stays. `position: sticky` can't do
  // this, because sticky resolves against the nearest scrollport and that's
  // `.tl-scroll`, which only ever scrolls sideways. So the stack goes
  // `position: fixed` once its place in the page passes the top of the window,
  // with the slot it left behind holding its height so nothing jumps.
  //
  // Everything below is written to the DOM rather than to state on purpose:
  // this runs on every scroll frame, and re-rendering a roadmap's worth of
  // bars at that rate is the one thing that would make scrolling stutter.
  useLayoutEffect(() => {
    const pane = scrollRef.current;
    const slot = slotRef.current;
    const stack = stackRef.current;
    if (!pane || !slot || !stack) return;

    let pinned = false;
    const update = () => {
      const paneBox = pane.getBoundingClientRect();
      const height = stack.offsetHeight;
      // The slot keeps its place in the flow whether or not the stack is in
      // it, so its top is what says where the stack belongs.
      const slotTop = slot.getBoundingClientRect().top;
      const shouldPin = slotTop < 0 && paneBox.bottom > 0;

      if (shouldPin) {
        // Ride the card's bottom edge out of the window rather than hanging
        // over the legend once the roadmap itself is gone.
        const top = Math.min(0, Math.round(paneBox.bottom - height));
        // The pane's left border, then its content box — the stack lines up
        // with the roadmap, not with the card's edge.
        stack.style.top = `${top}px`;
        stack.style.left = `${Math.round(paneBox.left + pane.clientLeft)}px`;
        stack.style.width = `${pane.clientWidth}px`;
        // Drives both halves of the horizontal sync in CSS: the track slides
        // left by the pane's scroll, and the pills that would have been
        // `position: sticky` slide back the other way. Sticky itself is inert
        // in here — a fixed subtree has no scrollport to resolve against.
        stack.style.setProperty("--pin-x", `${pane.scrollLeft}px`);
        if (!pinned) {
          slot.style.height = `${height}px`;
          stack.classList.add("pinned");
          pinned = true;
        }
      } else if (pinned) {
        stack.classList.remove("pinned");
        stack.style.top = "";
        stack.style.left = "";
        stack.style.width = "";
        stack.style.removeProperty("--pin-x");
        slot.style.height = "";
        pinned = false;
      }
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // Horizontal scroll of the roadmap under a pinned ruler.
    pane.addEventListener("scroll", update, { passive: true });
    // Opening a season lane changes the stack's height, which is the slot's
    // height too. Deferred a frame: writing to the DOM inside a
    // ResizeObserver callback is what produces "ResizeObserver loop completed
    // with undelivered notifications" in the dev overlay.
    let frame = 0;
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pinned) slot.style.height = `${stack.offsetHeight}px`;
        update();
      });
    });
    ro.observe(stack);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      pane.removeEventListener("scroll", update);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // ----- dependency lines (measure y from DOM after layout) -----
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      setDepPaths([]);
      return;
    }
    const bodyRect = body.getBoundingClientRect();
    const midY = (el: HTMLDivElement) =>
      el.getBoundingClientRect().top - bodyRect.top + 13;
    const paths: DepPath[] = [];
    scheduled.forEach((item) => {
      (item.dependsOn || []).forEach((depId) => {
        const dep = getItem(items, depId);
        const itemEl = barRefs.current[item.id];
        const depEl = barRefs.current[depId];
        if (!dep || !isScheduled(dep) || !itemEl || !depEl) return;
        const x1 = daysBetween(start, parseDate(dep.targetEnd!)) * ppd;
        const y1 = midY(depEl);
        const x2 = daysBetween(start, parseDate(item.targetStart!)) * ppd;
        const y2 = midY(itemEl);
        const conflict = !blockerSatisfied(dep) && x2 < x1;
        const bend = Math.max(16, Math.min(40, Math.abs(x2 - x1) / 2));
        paths.push({
          d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
          conflict,
          x2,
          y2,
        });
      });
    });
    setDepPaths(paths);
    // `seasonLaneOpen` belongs here even though no dependency line touches a
    // season: opening a lane shifts every bar below it, and these paths are
    // measured from the DOM, so omitting it leaves the curves pointing at the
    // rows the bars used to be in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, bets, zoom, expanded, seasonLaneOpen, filterMission, filterBet, filterOwner, groupBy, showKilled]);

  // ----- commit handlers -----
  const commitItem = (item: Item, s: Date, e: Date) => {
    const next: Item = {
      ...item,
      targetStart: toISODate(s),
      targetEnd: toISODate(e),
      updatedAt: new Date().toISOString(),
    };
    next.activity = [
      ...(item.activity || []),
      "Rescheduled on the timeline to " + fmtRange(next) + ".",
    ];
    updateItem(next);
    const conflicts = depConflicts(next, items);
    if (conflicts.length)
      toast(
        `Heads up: "${next.title}" now starts before ${conflicts
          .map((c) => '"' + c.title + '"')
          .join(" and ")} is due to finish.`,
        true,
      );
  };

  const commitSub = (parent: Item, sub: SubItem, s: Date, e: Date) => {
    const nextSub: SubItem = {
      ...sub,
      targetStart: toISODate(s),
      targetEnd: toISODate(e),
    };
    const next: Item = {
      ...parent,
      subItems: (parent.subItems || []).map((x) =>
        x.id === sub.id ? nextSub : x,
      ),
      updatedAt: new Date().toISOString(),
    };
    next.activity = [
      ...(parent.activity || []),
      'Sub-item "' + sub.title + '" rescheduled to ' + fmtRange(nextSub) + ".",
    ];
    updateItem(next);
    if (subOutOfRange(next, nextSub))
      toast(
        `Heads up: "${sub.title}" is now outside "${parent.title}"'s date range.`,
        true,
      );
  };

  const commitMilestone = (m: Milestone, d: Date) => {
    updateMilestone({
      ...m,
      date: toISODate(d),
      updatedAt: new Date().toISOString(),
    });
  };

  // ----- create-by-gesture on empty band space -----
  // Click or drag on the empty part of a team band to add an item there: click
  // drops a two-week block, drag draws the exact range. Both open the Capture
  // modal pre-seeded with the band's team and the swept dates, so the new item
  // is created already scheduled instead of landing in the tray. A translucent
  // ghost bar previews where it will land.
  const [createGhost, setCreateGhost] = useState<{
    mission: string;
    left: number;
    width: number;
  } | null>(null);
  const createSt = useRef<{
    active: boolean;
    mission: string;
    anchor: Date;
    lastCur: number;
    moved: boolean;
  }>({
    active: false,
    mission: "",
    anchor: new Date(),
    lastCur: 0,
    moved: false,
  });

  // Calendar-day arithmetic (not getTime() + n*DAY, which drifts a day across a
  // DST boundary — toISODate then reads the wrong local date). Mirrors how
  // snapToWeek and the bar-drag handlers step dates.
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  // The band's box spans the whole axis, so its left edge is day 0. Convert a
  // pointer's clientX to a week-snapped date on the timeline.
  const dateAtX = (clientX: number, bandEl: HTMLElement) => {
    const rect = bandEl.getBoundingClientRect();
    return snapToWeek(addDays(start, Math.round((clientX - rect.left) / ppd)));
  };

  // The dates a create gesture commits: a click (cur === anchor) becomes a
  // default two-week block; a drag spans anchor…cur in whichever direction.
  const rangeFrom = (anchor: Date, cur: Date): [Date, Date] =>
    +cur === +anchor
      ? [anchor, addDays(anchor, 14)]
      : cur < anchor
        ? [cur, anchor]
        : [anchor, cur];

  const ghostFor = (mission: string, s: Date, e: Date) => ({
    mission,
    left: daysBetween(start, s) * ppd,
    width: Math.max(daysBetween(s, e) * ppd, 26),
  });

  const onBandPointerDown = (e: React.PointerEvent, mission: string) => {
    if (shareMode) return;
    const t = e.target as HTMLElement;
    // Let bars, their handles/carets, and the sticky team label keep their own
    // behavior — only empty space starts a create gesture.
    if (t.closest(".tl-bar") || t.closest(".tl-mission-label")) return;
    const bandEl = e.currentTarget as HTMLElement;
    const anchor = dateAtX(e.clientX, bandEl);
    createSt.current = {
      active: true,
      mission,
      anchor,
      lastCur: +anchor,
      moved: false,
    };
    setEditing(true);
    bandEl.setPointerCapture(e.pointerId);
    const [s, en] = rangeFrom(anchor, anchor);
    setCreateGhost(ghostFor(mission, s, en));
    e.preventDefault();
  };

  const onBandPointerMove = (e: React.PointerEvent) => {
    const st = createSt.current;
    if (!st.active) return;
    const cur = dateAtX(e.clientX, e.currentTarget as HTMLElement);
    // Dates snap to weeks, so most moves land on the same day — skip the
    // re-render (of the whole timeline) unless the snapped position changed.
    if (+cur === st.lastCur) return;
    st.lastCur = +cur;
    if (+cur !== +st.anchor) st.moved = true;
    const [s, en] = rangeFrom(st.anchor, cur);
    setCreateGhost(ghostFor(st.mission, s, en));
  };

  const finishCreate = (e: React.PointerEvent, commit: boolean) => {
    const st = createSt.current;
    if (!st.active) return;
    const bandEl = e.currentTarget as HTMLElement;
    if (bandEl.hasPointerCapture(e.pointerId))
      bandEl.releasePointerCapture(e.pointerId);
    st.active = false;
    setCreateGhost(null);
    setEditing(false);
    if (!commit) return;
    const cur = st.moved ? dateAtX(e.clientX, bandEl) : st.anchor;
    const [s, en] = rangeFrom(st.anchor, cur);
    openCapture({
      mission: st.mission,
      targetStart: toISODate(s),
      targetEnd: toISODate(en),
    });
  };

  // ----- drag-to-link dependencies -----
  // Each bar carries a connector nub at its finishing (right) end. Drag from it
  // and drop on another bar to say that bar is *sequenced behind* this one — it
  // can't start until this one finishes. That's the same direction the
  // dependency line draws (from a blocker's end to the dependent's start), so
  // the source becomes the dependency and the drop target gains it.
  const linkSt = useRef<{ active: boolean; sourceId: string }>({
    active: false,
    sourceId: "",
  });
  const [linkLine, setLinkLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);

  // A bar's vertical middle, in the same coordinate space as the dep SVG.
  const barMidY = (el: HTMLElement) => {
    const body = bodyRef.current;
    if (!body) return 0;
    return (
      el.getBoundingClientRect().top - body.getBoundingClientRect().top + 13
    );
  };

  const onLinkStart = (sourceId: string, e: React.PointerEvent) => {
    if (shareMode) return;
    const src = getItem(items, sourceId);
    const srcEl = barRefs.current[sourceId];
    if (!src || !srcEl || !isScheduled(src)) return;
    linkSt.current = { active: true, sourceId };
    setEditing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const x1 = daysBetween(start, parseDate(src.targetEnd!)) * ppd;
    const y1 = barMidY(srcEl);
    setLinkLine({ x1, y1, x2: x1, y2: y1 });
  };

  const onLinkMove = (e: React.PointerEvent) => {
    if (!linkSt.current.active) return;
    const body = bodyRef.current;
    if (!body) return;
    const r = body.getBoundingClientRect();
    setLinkLine((l) =>
      l ? { ...l, x2: e.clientX - r.left, y2: e.clientY - r.top } : l,
    );
  };

  // Which scheduled bar sits under the pointer at drop time (source excluded).
  const barAtPoint = (clientX: number, clientY: number): string | null => {
    // The pane clips vertically now, so a bar's rect can sit outside the
    // visible card — dropping a dependency over the legend or the controls
    // would otherwise link to a bar that scrolled out of view. Nothing outside
    // the pane is a legal target.
    const pane = scrollRef.current?.getBoundingClientRect();
    if (
      pane &&
      (clientX < pane.left ||
        clientX > pane.right ||
        clientY < pane.top ||
        clientY > pane.bottom)
    )
      return null;
    for (const [id, el] of Object.entries(barRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      )
        return id;
    }
    return null;
  };

  const onLinkEnd = (e: React.PointerEvent, commit: boolean) => {
    const st = linkSt.current;
    if (!st.active) return;
    const nub = e.currentTarget as HTMLElement;
    if (nub.hasPointerCapture(e.pointerId)) nub.releasePointerCapture(e.pointerId);
    st.active = false;
    setLinkLine(null);
    setEditing(false);
    // A cancelled gesture (pointercancel) just aborts — never links.
    if (!commit) return;

    const sourceId = st.sourceId;
    const targetId = barAtPoint(e.clientX, e.clientY);
    if (!targetId || targetId === sourceId) return;
    const target = getItem(items, targetId);
    const source = getItem(items, sourceId);
    if (!target || !source) return;
    if ((target.dependsOn || []).includes(sourceId)) {
      toast(`"${target.title}" already depends on "${source.title}".`);
      return;
    }
    if (createsDepCycle(items, targetId, sourceId)) {
      toast(
        `Can't link: "${source.title}" already depends on "${target.title}" (directly or through a chain). That would be a circular dependency.`,
        true,
      );
      return;
    }
    const next: Item = {
      ...target,
      dependsOn: [...(target.dependsOn || []), sourceId],
      updatedAt: new Date().toISOString(),
      activity: [
        ...(target.activity || []),
        `Now depends on "${source.title}".`,
      ],
    };
    updateItem(next);
    toast(`"${target.title}" now depends on "${source.title}".`);
    if (depConflicts(next, items).some((c) => c.id === sourceId))
      toast(
        `Heads up: "${next.title}" starts before "${source.title}" is due to finish.`,
        true,
      );
  };

  const linkBend = linkLine
    ? Math.max(16, Math.min(40, Math.abs(linkLine.x2 - linkLine.x1) / 2))
    : 0;

  return (
    <div className="timeline-view">
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: totalDays * ppd }}>
          {/* The time context, and the one part of the view that pins: the
              ruler and the seasonality lanes read against every row below, so
              they stay while the page scrolls the stats and the filters away.
              The slot holds the stack's height once the stack goes fixed; the
              track keeps the roadmap's full width so the fixed, window-wide
              stack doesn't reflow its contents to the visible width. */}
          <div className="tl-pin-slot" ref={slotRef}>
            <div className="tl-pinstack" ref={stackRef}>
              <div
                className="tl-pin-track"
                style={{ width: totalDays * ppd }}
              >
                <div className="tl-header">
                  <div className="tl-qrow">
                    {quarterCells.map((c, i) => (
                      <div
                        key={i}
                        className="tl-qcell"
                        style={{ width: c.width }}
                        // The first and last cells can be clipped to a sliver
                        // by the axis range, so both names stay reachable on
                        // hover.
                        title={`${c.season} · ${c.label}`}
                      >
                        <span className="tl-qcell-season">{c.season}</span>
                        <span className="tl-qcell-fy">{c.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="tl-mrow">
                    {monthCells.map((c, i) => (
                      <div
                        key={i}
                        className="tl-mcell"
                        style={{ width: c.width }}
                      >
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seasonality context sits above the work: what this roadmap
                    is scheduled against, on the camp's calendar and on ours.
                    Part of the pinned stack, so a curve's peak stays over the
                    rows however far down the roadmap you are. */}
                <SeasonLanes
                  rangeStart={start}
                  rangeEnd={end}
                  ppd={ppd}
                  totalWidth={totalDays * ppd}
                  open={seasonLaneOpen}
                  onToggle={toggleSeasonLane}
                />

                {/* The body's own today line stops where the body does, and
                    the lanes are no longer in it. Same date, drawn through the
                    stack, so the marker isn't cut in two. */}
                {todayLeft !== null && (
                  <div
                    className="tl-today tl-today-pin"
                    style={{ left: todayLeft }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          </div>

          <div
            className={"tl-body" + (linkLine ? " tl-linking" : "")}
            ref={bodyRef}
          >
            <div className="tl-grid">
              {gridLines.map((g, i) => (
                <div
                  key={i}
                  className={"tl-gridline" + (g.q ? " q" : "")}
                  style={{ left: g.left }}
                />
              ))}
            </div>

            {/* Milestone flags are absolutely positioned across the top of the
                body, so they need reserved height or they cover the first band.
                Sized to however many rows the stack actually needed. */}
            {flagRowCount > 0 && (
              <div
                className="tl-flag-gutter"
                style={{ height: flagRowCount * FLAG_ROW_H + 5 }}
                aria-hidden
              />
            )}

            {betBands.length > 0 && (
              <div className={"tl-bet-band" + (betsOpen ? " open" : "")}>
                <button
                  type="button"
                  className="tl-mission-label tl-bet-label"
                  aria-expanded={betsOpen}
                  title="Cross-team bets"
                  onClick={toggleBets}
                >
                  <span className="tl-bet-toggle" aria-hidden>
                    {betsOpen ? "▾" : "▸"}
                  </span>
                  Bets
                  {!betsOpen && (
                    <span className="tl-bet-count">{betBands.length}</span>
                  )}
                </button>
                {betsOpen &&
                  betBands.map(({ init, env, prog, teams }) => (
                    <div className="tl-row" key={init.id}>
                      <BetBar
                        init={init}
                        range={env!}
                        prog={prog}
                        teams={teams}
                        ppd={ppd}
                        rangeStart={start}
                        dimmed={
                          focusBet !== null && focusBet !== init.id
                        }
                        focused={focusBet === init.id}
                        onToggle={() => toggleFocus(init.id)}
                        onEdit={() => openBet(init.id)}
                        shareMode={shareMode}
                      />
                    </div>
                  ))}
              </div>
            )}

            {bands.map(({ key, label, mission, color, group }) => (
              <div
                className={
                  "tl-mission-band" +
                  (mission && !shareMode ? " tl-band-addable" : "")
                }
                key={key}
                onPointerDown={
                  mission ? (e) => onBandPointerDown(e, mission) : undefined
                }
                onPointerMove={mission ? onBandPointerMove : undefined}
                onPointerUp={mission ? (e) => finishCreate(e, true) : undefined}
                onPointerCancel={
                  mission ? (e) => finishCreate(e, false) : undefined
                }
              >
                {mission ? (
                  <MissionTag mission={mission} className="tl-mission-label" />
                ) : (
                  <span className="tl-mission-label tl-bet-group-label">
                    {color && (
                      <span
                        className="init-dot"
                        style={{ background: color }}
                        aria-hidden
                      />
                    )}
                    {label}
                  </span>
                )}
                {group.map((item) => {
                  const datedSubs = (item.subItems || []).filter(subScheduled);
                  const showSubs = datedSubs.length > 0 && isExpanded(item.id);
                  return (
                    <div key={item.id}>
                      <div className="tl-row">
                        <Bar
                          item={item}
                          ppd={ppd}
                          rangeStart={start}
                          shareMode={shareMode}
                          setEditing={setEditing}
                          dimmed={!inFocus(item)}
                          hasSubs={datedSubs.length > 0}
                          expanded={isExpanded(item.id)}
                          onToggle={() =>
                            setExpanded((e) => ({
                              ...e,
                              [item.id]: !isExpanded(item.id),
                            }))
                          }
                          registerRef={(el) => (barRefs.current[item.id] = el)}
                          onOpen={() => openDetail(item.id)}
                          onCommit={(s, e) => commitItem(item, s, e)}
                          allItems={items}
                          onLinkStart={onLinkStart}
                          onLinkMove={onLinkMove}
                          onLinkEnd={onLinkEnd}
                        />
                      </div>
                      {showSubs &&
                        datedSubs.map((sub) => (
                          <div className="tl-row child" key={sub.id}>
                            <SubBar
                              sub={sub}
                              parent={item}
                              ppd={ppd}
                              rangeStart={start}
                              shareMode={shareMode}
                              setEditing={setEditing}
                              onOpen={() => openDetail(item.id)}
                              onCommit={(s, e) => commitSub(item, sub, s, e)}
                            />
                          </div>
                        ))}
                    </div>
                  );
                })}
                {createGhost && createGhost.mission === mission && (
                  <div className="tl-row">
                    <div
                      className="tl-bar tl-create-ghost"
                      style={{
                        left: createGhost.left,
                        width: createGhost.width,
                      }}
                    >
                      ＋ New item
                    </div>
                  </div>
                )}
              </div>
            ))}

            {todayLeft !== null && (
              <div className="tl-today" style={{ left: todayLeft }} />
            )}

            {visibleMilestones.map((m) => (
              <MilestoneMarker
                key={m.id}
                milestone={m}
                row={flagRows.get(m.id) ?? 0}
                ppd={ppd}
                rangeStart={start}
                shareMode={shareMode}
                setEditing={setEditing}
                onOpen={() => openMilestone(m.id)}
                onCommit={(d) => commitMilestone(m, d)}
              />
            ))}

            {depPaths.length > 0 && (
              <svg
                className="tl-deps"
                width={totalDays * ppd}
                height="100%"
                style={{ height: "100%" }}
              >
                {depPaths.map((p, i) => (
                  <g key={i}>
                    <path className={p.conflict ? "conflict" : ""} d={p.d} />
                    <circle
                      className={"dep-dot" + (p.conflict ? " conflict" : "")}
                      cx={p.x2}
                      cy={p.y2}
                      r={3.5}
                    />
                  </g>
                ))}
              </svg>
            )}

            {linkLine && (
              <svg
                className="tl-deps tl-link-preview"
                width={totalDays * ppd}
                height="100%"
                style={{ height: "100%" }}
              >
                <path
                  d={`M ${linkLine.x1} ${linkLine.y1} C ${linkLine.x1 + linkBend} ${linkLine.y1}, ${linkLine.x2 - linkBend} ${linkLine.y2}, ${linkLine.x2} ${linkLine.y2}`}
                />
                <circle
                  className="dep-dot"
                  cx={linkLine.x2}
                  cy={linkLine.y2}
                  r={4}
                />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="tl-legend">
        <div className="tl-legend-group">
          <span className="tl-legend-title">Item stage</span>
          {STAGES.map((s) => (
            <span key={s} className="tl-legend-item">
              <span
                className="swatch"
                style={{ background: STAGE_COLORS[s] }}
              />
              {s}
            </span>
          ))}
        </div>
        <div className="tl-legend-group">
          <span className="tl-legend-title">Work type</span>
          {ITEM_TYPES.map((t) => (
            <span key={t} className="tl-legend-item">
              <span
                className="swatch"
                style={{ background: ITEM_TYPE_INFO[t].fg }}
              />
              {ITEM_TYPE_INFO[t].label}
            </span>
          ))}
        </div>
        <div className="tl-legend-group">
          <span className="tl-legend-title">Bets</span>
          <span className="tl-legend-item">
            <span className="swatch tl-legend-init-env" />
            Rollup across its items
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-flag" aria-hidden>
              ◆
            </span>
            Milestone
          </span>
          <span className="tl-legend-note">
            each bet has its own color, not a stage color
          </span>
        </div>
        <div className="tl-legend-group">
          <span className="tl-legend-title">Dependencies</span>
          <span className="tl-legend-item">
            <span className="tl-legend-line" aria-hidden />
            Dependency
          </span>
          <span className="tl-legend-item">
            <span className="tl-legend-line conflict" aria-hidden />
            Starts before dependency finishes
          </span>
        </div>
        <span className="tl-legend-help">
          {!shareMode &&
            "Click or drag an empty spot in a team band to add an item there. Drag the ● at a bar's end onto another bar to link a dependency. "}
          Drag a bar to move it; drag its edges to resize. Snaps to weeks.
        </span>
      </div>

      {unscheduled.length > 0 && (
        <div className="tl-tray">
          <h4>Not on the timeline yet ({unscheduled.length})</h4>
          <div className="tl-tray-items">
            {unscheduled.map((item) => (
              <div
                key={item.id}
                className="tl-tray-card"
                style={{ ["--bar-color" as string]: STAGE_COLORS[item.stage] }}
                onClick={() => openDetail(item.id)}
              >
                <span>{item.title}</span>
                <button
                  className="place-btn edit-only"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateItem(placedOnTimeline(item));
                  }}
                >
                  Place on timeline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- draggable parent bar ---------------- */
function Bar({
  item,
  ppd,
  rangeStart,
  shareMode,
  setEditing,
  dimmed,
  hasSubs,
  expanded,
  onToggle,
  registerRef,
  onOpen,
  onCommit,
  allItems,
  onLinkStart,
  onLinkMove,
  onLinkEnd,
}: {
  item: Item;
  ppd: number;
  rangeStart: Date;
  shareMode: boolean;
  setEditing: (b: boolean) => void;
  dimmed: boolean;
  hasSubs: boolean;
  expanded: boolean;
  onToggle: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
  onOpen: () => void;
  onCommit: (s: Date, e: Date) => void;
  allItems: Item[];
  onLinkStart: (sourceId: string, e: React.PointerEvent) => void;
  onLinkMove: (e: React.PointerEvent) => void;
  onLinkEnd: (e: React.PointerEvent, commit: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useBarDrag(ref, item.targetStart!, item.targetEnd!, ppd, rangeStart, {
    shareMode,
    setEditing,
    onOpen,
    onCommit,
  });

  const left = daysBetween(rangeStart, parseDate(item.targetStart!)) * ppd;
  const width = Math.max(
    daysBetween(parseDate(item.targetStart!), parseDate(item.targetEnd!)) * ppd,
    26,
  );
  const conflicts = depConflicts(item, allItems);
  const prog = subProgress(item);

  return (
    <>
    <div
      ref={(el) => {
        ref.current = el;
        registerRef(el);
      }}
      className={
        "tl-bar" +
        (item.killed ? " killed-bar" : "") +
        (dimmed ? " dimmed" : "")
      }
      style={{ left, width, ["--bar-color" as string]: STAGE_COLORS[item.stage] }}
      title={
        item.title +
        "\n" +
        fmtRange(item) +
        " · " +
        item.stage +
        (item.type ? " · " + ITEM_TYPE_INFO[item.type].label : "") +
        (prog ? " · sub-items " + prog.done + "/" + prog.total + " done" : "") +
        (conflicts.length
          ? "\n⚠ Scheduled before dependency finishes: " +
            conflicts.map((c) => c.title).join(", ")
          : "")
      }
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={drag.onClick}
    >
      <span className="tl-handle l" />
      {hasSubs && (
        <span
          className="tl-caret"
          title={(expanded ? "Collapse" : "Expand") + " sub-items"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? "▾" : "▸"}
        </span>
      )}
      {item.type && (
        <span
          className="tl-type-dot"
          style={{ background: ITEM_TYPE_INFO[item.type].fg }}
          aria-hidden
        />
      )}
      {conflicts.length ? "⚠ " : ""}
      {item.title}
      {prog ? " · " + prog.done + "/" + prog.total : ""}
      {/* Shown in share mode too. It's tempting to gate this on `shareMode`,
          but that flag means "read-only" and is set by the internal /preview
          view as well as the anonymous /share one — hiding it there would break
          the link on the surface people actually review the roadmap on. And it
          would protect nothing: the artifact URLs are part of the item payload
          already serialized to every client, so they ship either way. Notion and
          ADO gate the pages themselves. */}
      <ItemLink item={item} variant="glyph" />
      <span className="tl-handle r" />
    </div>
    {!shareMode && (
      <div
        className="tl-link-handle"
        style={{
          left: left + width - 6,
          ["--bar-color" as string]: STAGE_COLORS[item.stage],
        }}
        title={`Drag onto another bar to make it depend on "${item.title}"`}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onLinkStart(item.id, e);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onLinkMove(e);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          onLinkEnd(e, true);
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          onLinkEnd(e, false);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="tl-link-dot" />
      </div>
    )}
    </>
  );
}

/* ---------------- draggable sub-item bar ---------------- */
function SubBar({
  sub,
  parent,
  ppd,
  rangeStart,
  shareMode,
  setEditing,
  onOpen,
  onCommit,
}: {
  sub: SubItem;
  parent: Item;
  ppd: number;
  rangeStart: Date;
  shareMode: boolean;
  setEditing: (b: boolean) => void;
  onOpen: () => void;
  onCommit: (s: Date, e: Date) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useBarDrag(ref, sub.targetStart!, sub.targetEnd!, ppd, rangeStart, {
    shareMode,
    setEditing,
    onOpen,
    onCommit,
  });
  const oob = subOutOfRange(parent, sub);
  const left = daysBetween(rangeStart, parseDate(sub.targetStart!)) * ppd;
  const width = Math.max(
    daysBetween(parseDate(sub.targetStart!), parseDate(sub.targetEnd!)) * ppd,
    22,
  );

  return (
    <div
      ref={ref}
      className={"tl-bar sub" + (sub.done ? " done" : "") + (oob ? " oob" : "")}
      style={{
        left,
        width,
        ["--bar-color" as string]: STAGE_COLORS[parent.stage],
      }}
      title={
        parent.title +
        " ▸ " +
        sub.title +
        "\n" +
        fmtRange(sub) +
        (sub.done ? " · done" : "") +
        (oob ? "\n⚠ Outside the parent bar's date range" : "")
      }
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={drag.onClick}
    >
      <span className="tl-handle l" />
      <span className="sub-label">
        {oob ? "⚠ " : ""}
        {sub.title}
      </span>
      <span className="tl-handle r" />
    </div>
  );
}

/* -------- read-only rolled-up bet envelope bar -------- */
function BetBar({
  init,
  range,
  prog,
  teams,
  ppd,
  rangeStart,
  dimmed,
  focused,
  onToggle,
  onEdit,
  shareMode,
}: {
  init: Bet;
  range: { start: Date; end: Date };
  prog: { done: number; total: number } | null;
  teams: string[];
  ppd: number;
  rangeStart: Date;
  dimmed: boolean;
  focused: boolean;
  onToggle: () => void;
  onEdit: () => void;
  shareMode: boolean;
}) {
  const left = daysBetween(rangeStart, range.start) * ppd;
  const width = Math.max(daysBetween(range.start, range.end) * ppd, 26);
  return (
    <div
      className={
        "tl-bar tl-bet-bar" +
        (dimmed ? " dimmed" : "") +
        (focused ? " hl" : "")
      }
      style={{ left, width, ["--bar-color" as string]: init.color }}
      title={
        init.title +
        (init.description ? "\n" + init.description : "") +
        "\n" +
        fmtRange({ targetStart: toISODate(range.start), targetEnd: toISODate(range.end) }) +
        (prog ? " · items " + prog.done + "/" + prog.total + " shipped" : "") +
        (teams.length ? "\nTeams: " + teams.join(", ") : "") +
        "\nClick to highlight its items across teams" +
        (shareMode ? "" : " · ✎ to edit")
      }
      onClick={onToggle}
    >
      {focused ? "◉ " : ""}
      {init.title}
      {prog ? " · " + prog.done + "/" + prog.total : ""}
      {!shareMode && (
        <span
          className="tl-init-edit edit-only"
          title={"Edit " + init.title}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          ✎
        </span>
      )}
    </div>
  );
}

/* -------- draggable single-date milestone marker -------- */
function MilestoneMarker({
  milestone,
  row,
  ppd,
  rangeStart,
  shareMode,
  setEditing,
  onOpen,
  onCommit,
}: {
  milestone: Milestone;
  // Which stacked flag row this one sits in — 0 is the top row. Drives both the
  // flag's offset and where its dashed line starts, so the line hangs off the
  // bottom of its own flag rather than from a fixed height.
  row: number;
  ppd: number;
  rangeStart: Date;
  shareMode: boolean;
  setEditing: (b: boolean) => void;
  onOpen: () => void;
  onCommit: (d: Date) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useMarkerDrag(ref, milestone.date, ppd, rangeStart, {
    shareMode,
    setEditing,
    onOpen,
    onCommit,
  });
  const left = daysBetween(rangeStart, parseDate(milestone.date)) * ppd;
  const dateLabel = parseDate(milestone.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      ref={ref}
      className="tl-milestone-marker"
      style={{
        left,
        ["--bar-color" as string]: milestone.color,
        ["--ms-row" as string]: row,
      }}
    >
      <span className="tl-milestone-line" />
      <span
        className="tl-milestone-flag"
        title={
          milestone.title +
          "\n" +
          dateLabel +
          (milestone.description ? "\n" + milestone.description : "") +
          (shareMode ? "" : "\nDrag to reschedule · click to edit")
        }
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onClick={drag.onClick}
      >
        <span className="tl-milestone-dot" aria-hidden>
          ◆
        </span>
        {milestone.title}
      </span>
    </div>
  );
}

/* -- move-only pointer-drag for a single-date marker (mirrors useBarDrag's
      "move" branch, but tracks one date). Capture stays on the flag while the
      wrapper's left is updated live. -- */
function useMarkerDrag(
  ref: React.MutableRefObject<HTMLDivElement | null>,
  dateISO: string,
  ppd: number,
  rangeStart: Date,
  opts: {
    shareMode: boolean;
    setEditing: (b: boolean) => void;
    onOpen: () => void;
    onCommit: (d: Date) => void;
  },
) {
  const st = useRef<{
    active: boolean;
    startX: number;
    orig: Date;
    moved: boolean;
    justDragged: boolean;
    pending: Date | null;
  }>({
    active: false,
    startX: 0,
    orig: new Date(),
    moved: false,
    justDragged: false,
    pending: null,
  });

  return {
    onPointerDown(e: React.PointerEvent) {
      if (opts.shareMode) return;
      st.current.active = true;
      st.current.startX = e.clientX;
      st.current.orig = parseDate(dateISO);
      st.current.moved = false;
      st.current.pending = null;
      opts.setEditing(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      ref.current?.classList.add("dragging");
      e.preventDefault();
    },
    onPointerMove(e: React.PointerEvent) {
      const s0 = st.current;
      if (!s0.active) return;
      const dx = e.clientX - s0.startX;
      if (Math.abs(dx) > 4) s0.moved = true;
      if (!s0.moved) return;
      const dd = Math.round(dx / ppd);
      let d = new Date(s0.orig);
      d.setDate(d.getDate() + dd);
      d = snapToWeek(d);
      s0.pending = d;
      if (ref.current)
        ref.current.style.left = daysBetween(rangeStart, d) * ppd + "px";
    },
    onPointerUp() {
      const s0 = st.current;
      if (!s0.active) return;
      ref.current?.classList.remove("dragging");
      if (s0.moved && s0.pending) {
        s0.justDragged = true;
        opts.onCommit(s0.pending);
      }
      s0.active = false;
      opts.setEditing(false);
    },
    onPointerCancel() {
      st.current.active = false;
      ref.current?.classList.remove("dragging");
      opts.setEditing(false);
    },
    onClick() {
      if (st.current.justDragged) {
        st.current.justDragged = false;
        return;
      }
      opts.onOpen();
    },
  };
}

/* ---------------- shared pointer-drag hook ---------------- */
function useBarDrag(
  ref: React.MutableRefObject<HTMLDivElement | null>,
  startISO: string,
  endISO: string,
  ppd: number,
  rangeStart: Date,
  opts: {
    shareMode: boolean;
    setEditing: (b: boolean) => void;
    onOpen: () => void;
    onCommit: (s: Date, e: Date) => void;
  },
) {
  const st = useRef<{
    mode: "move" | "l" | "r" | null;
    startX: number;
    origS: Date;
    origE: Date;
    moved: boolean;
    justDragged: boolean;
    pendingS: Date | null;
    pendingE: Date | null;
  }>({
    mode: null,
    startX: 0,
    origS: new Date(),
    origE: new Date(),
    moved: false,
    justDragged: false,
    pendingS: null,
    pendingE: null,
  });

  return {
    onPointerDown(e: React.PointerEvent) {
      if (opts.shareMode) return;
      const t = e.target as HTMLElement;
      if (t.classList?.contains("tl-caret")) return;
      st.current.mode = t.classList?.contains("tl-handle")
        ? t.classList.contains("l")
          ? "l"
          : "r"
        : "move";
      st.current.startX = e.clientX;
      st.current.origS = parseDate(startISO);
      st.current.origE = parseDate(endISO);
      st.current.moved = false;
      st.current.pendingS = null;
      st.current.pendingE = null;
      opts.setEditing(true);
      ref.current?.setPointerCapture(e.pointerId);
      ref.current?.classList.add("dragging");
      e.preventDefault();
    },
    onPointerMove(e: React.PointerEvent) {
      const s0 = st.current;
      if (!s0.mode) return;
      const dx = e.clientX - s0.startX;
      if (Math.abs(dx) > 4) s0.moved = true;
      if (!s0.moved) return;
      const dd = Math.round(dx / ppd);
      let s = new Date(s0.origS),
        en = new Date(s0.origE);
      if (s0.mode === "move") {
        s.setDate(s.getDate() + dd);
        en.setDate(en.getDate() + dd);
      }
      if (s0.mode === "l") s.setDate(s.getDate() + dd);
      if (s0.mode === "r") en.setDate(en.getDate() + dd);
      s = snapToWeek(s);
      en = snapToWeek(en);
      if (en <= s) en = new Date(s.getTime() + 7 * DAY);
      s0.pendingS = s;
      s0.pendingE = en;
      if (ref.current) {
        ref.current.style.left = daysBetween(rangeStart, s) * ppd + "px";
        ref.current.style.width =
          Math.max(daysBetween(s, en) * ppd, 26) + "px";
      }
    },
    onPointerUp() {
      const s0 = st.current;
      if (!s0.mode) return;
      ref.current?.classList.remove("dragging");
      if (s0.moved && s0.pendingS && s0.pendingE) {
        s0.justDragged = true;
        opts.onCommit(s0.pendingS, s0.pendingE);
      }
      s0.mode = null;
      opts.setEditing(false);
    },
    onPointerCancel() {
      st.current.mode = null;
      ref.current?.classList.remove("dragging");
      opts.setEditing(false);
    },
    onClick(e: React.MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.classList?.contains("tl-caret")) return;
      if (st.current.justDragged) {
        st.current.justDragged = false;
        return;
      }
      opts.onOpen();
    },
  };
}
