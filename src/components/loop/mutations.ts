import {
  DAY,
  OWNER_UNASSIGNED,
  STAGES,
  type HorizonKey,
  type Stage,
} from "@/lib/loop/constants";
import {
  daysBetween,
  fiscalQuarterLabel,
  fmtRange,
  isIntake,
  isScheduled,
  parseDate,
  snapToWeek,
  toISODate,
} from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";

// Classify a stage transition for the celebration overlay: reaching Releasing
// is a ship, any other forward (or same-index) move is an advance, and stepping
// back toward Discovery is a regress.
export function stageMoveKind(
  from: Stage,
  to: Stage,
): "ship" | "advance" | "regress" {
  if (to === "Releasing") return "ship";
  return STAGES.indexOf(to) >= STAGES.indexOf(from) ? "advance" : "regress";
}

export function visibleItems(
  items: Item[],
  filterMission: string[],
  showKilled: boolean,
  filterBet = "all",
  filterOwner = "all",
  // Share mode hides Intake everywhere, not just on the board. The Timeline is
  // the reason this lives here rather than in BoardView: every seeded intake row
  // carries dates, so hiding only the board column would leave 63 parked ideas
  // drawn as bars on the timeline an exec is looking at.
  //
  // An anonymous share link is already filtered server-side (getPublicState), so
  // this is belt-and-braces there. It is the *only* filter for the in-app
  // "Toggle share mode" button and for /preview, which render full data.
  shareMode = false,
): Item[] {
  return items.filter((i) => {
    if (!showKilled && i.killed) return false;
    if (shareMode && isIntake(i)) return false;
    // Empty = no scope (all teams); otherwise the item's team must be one of
    // the selected teams.
    if (filterMission.length > 0 && !filterMission.includes(i.mission))
      return false;
    // filterOwner: "all" = no scope, the OWNER_UNASSIGNED sentinel = only items
    // with no owner, otherwise an exact owner-name match.
    if (filterOwner !== "all") {
      const owner = i.owner || "";
      if (filterOwner === OWNER_UNASSIGNED ? owner !== "" : owner !== filterOwner)
        return false;
    }
    if (
      filterBet !== "all" &&
      !(i.betIds || []).includes(filterBet)
    )
      return false;
    return true;
  });
}

const now = () => new Date().toISOString();

// Returns a new item advanced to targetStage (caller checks the gate first).
export function movedToStage(item: Item, targetStage: Stage): Item {
  const updatedAt = now();
  const next: Item = {
    ...item,
    stage: targetStage,
    updatedAt,
    activity: [...(item.activity || []), `Moved to ${targetStage}.`],
  };
  if (targetStage === "Building" && !next.committedAt)
    next.committedAt = updatedAt;
  if (targetStage === "Releasing" && !next.shippedAt) next.shippedAt = updatedAt;
  return next;
}

export function withHorizon(item: Item, key: HorizonKey): Item {
  return {
    ...item,
    horizon: key === "unassigned" ? null : key,
    updatedAt: now(),
    activity: [
      ...(item.activity || []),
      key === "unassigned"
        ? "Horizon cleared."
        : `Horizon set to ${key.charAt(0).toUpperCase() + key.slice(1)}.`,
    ],
  };
}

// Dragging a "non-bet" (declined) call onto the calendar or back off it is a
// real decision, not a side effect of the drop — so both quarter-board drop
// targets below clear it rather than leaving an item that reads as both
// "declined" and scheduled.
function clearNonBetHorizon(horizon: Item["horizon"]): Item["horizon"] {
  return horizon === "non-bet" ? null : horizon;
}

// Drop target for the Horizon view's by-quarter layout: move `item` into the
// fiscal quarter starting `quarterStart`. An already-scheduled item keeps its
// duration (a 3-quarter epic dragged a quarter over is still a 3-quarter
// epic); an unscheduled one takes on the dropped quarter's own span.
export function withQuarter(
  item: Item,
  quarterStart: Date,
  quarterEnd: Date,
): Item {
  const durationDays = isScheduled(item)
    ? daysBetween(parseDate(item.targetStart!), parseDate(item.targetEnd!))
    : daysBetween(quarterStart, quarterEnd);
  // Calendar-date arithmetic, not `quarterStart.getTime() + durationDays * DAY`:
  // the latter adds a fixed number of real hours, which lands a day short
  // whenever the span crosses a DST transition.
  const newEnd = new Date(
    quarterStart.getFullYear(),
    quarterStart.getMonth(),
    quarterStart.getDate() + durationDays,
  );
  const next: Item = {
    ...item,
    targetStart: toISODate(quarterStart),
    targetEnd: toISODate(newEnd),
    horizon: clearNonBetHorizon(item.horizon),
    updatedAt: now(),
  };
  next.activity = [
    ...(item.activity || []),
    `Scheduled to ${fiscalQuarterLabel(quarterStart)} on the quarter board.`,
  ];
  return next;
}

// The other drop target on the by-quarter layout: the "Unscheduled" column,
// for pulling a dated item back out of the calendar without touching its
// horizon call — except a declined "non-bet" call, which is cleared for the
// same reason withQuarter clears it: the Non-Bet column is keyed on horizon,
// not dates, so leaving it in place would make the drop look like a no-op.
export function withoutDates(item: Item): Item {
  const next: Item = {
    ...item,
    targetStart: null,
    targetEnd: null,
    horizon: clearNonBetHorizon(item.horizon),
    updatedAt: now(),
  };
  next.activity = [
    ...(item.activity || []),
    "Dates cleared on the quarter board.",
  ];
  return next;
}

export function placedOnTimeline(item: Item): Item {
  const s = snapToWeek(new Date(Date.now() + 7 * DAY));
  const next: Item = {
    ...item,
    targetStart: toISODate(s),
    targetEnd: toISODate(new Date(s.getTime() + 28 * DAY)),
    updatedAt: now(),
  };
  next.activity = [
    ...(item.activity || []),
    "Placed on the timeline (" + fmtRange(next) + "), dates are a starting guess.",
  ];
  return next;
}
