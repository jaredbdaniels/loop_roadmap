// The seasonality model — the annual rhythm the roadmap is planned against.
//
//   Camp Seasons        the customer's year (recruiting, enrollment, in-season)
//   Campminder Seasons  our own year (sales, discovery, support, enablement)
//
// Camps run on a hard annual cycle, and so do we — inversely. Our sales year
// peaks while camps are planning and goes dead while they're actually running
// camp; our support load does the opposite. A roadmap that only shows *when*
// work lands hides all of that, so the timeline draws these as two lanes above
// the work: what a piece of work is scheduled *against*, not just when it ships.
//
// Every curve here is CURATED — a written-down version of what the team knows
// out loud, not a measurement. That's what `source` records, and the timeline
// shows it on hover so a guess is never read as data. Campminder has usage data
// (Pendo, the warehouse, Salesforce) that could replace these numbers, but none
// of it is connected yet; see Loop/INTEGRATIONS.md, which deliberately defers
// those connectors. When one lands, swap a curve and flip its `source` to
// "measured" — nothing else about the shape of this file needs to change.
//
// These numbers are meant to be argued with in a planning meeting. Editing them
// is the point; that's why they live in a reviewable module and not in a chart.

import { fiscalMonthOffset } from "./logic";

export type SeasonLane = "camp" | "campminder";

// Whether a curve is a written-down belief or a reading from real usage data.
// Never default this to "measured" — an unverified curve on a planning surface
// that claims to be measured is worse than no curve at all.
export type SeasonSource = "curated" | "measured";

// Intensity 0..1 for each of the twelve months, in FISCAL order: index 0 is
// September, index 11 is August. Fiscal rather than calendar order so a curve
// reads left-to-right the way the timeline does, and so indexing is exactly
// `fiscalMonthOffset(date)` — the same expression the fiscal calendar uses, so
// the two can't disagree about where September is.
//
// Normalized per season: 1 is that season at its own peak, not an intensity
// comparable across seasons. "Support is busier than sales" isn't a meaningful
// claim — they're different units — so every curve must touch 1 somewhere, and
// seasons.test.ts enforces it. Otherwise a curve that happened to top out at
// 0.6 would draw at two-thirds height and read as a quiet season.
export type SeasonCurve = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export interface Season {
  id: string;
  lane: SeasonLane;
  label: string;
  // One line, shown on hover. Say what rises and falls and why, not what the
  // curve looks like — the curve is already on screen.
  description: string;
  emphasis: SeasonEmphasis;
  curve: SeasonCurve;
  source: SeasonSource;
}

// ONE HUE PER LANE, not one per season.
//
// This used to give every camp season its own orange — seven hues inside 30° of
// each other, differing mostly in lightness. Stacked as seven 46px rows they
// were indistinguishable, so the color did no work while still asking the eye
// to try. Identity now comes from the row's label and its position in the lane;
// color carries one bit only: is this the season the lane exists to surface?
//
// Warm for the camp's year, cool for ours, so the two lanes still read as
// different families at a glance. Deliberately NOT STAGE_COLORS or BET_COLORS:
// sharing those palettes would imply a season relates to a stage or a bet, and
// none of them do.
const LANE_INK: Record<SeasonLane, { base: string; accent: string }> = {
  camp: { base: "#C2410C", accent: "#BE123C" },
  campminder: { base: "#1D4ED8", accent: "#047857" },
};

// `accent` is a budget, not a label. Spend it on the season a reader would be
// wrong to miss — camp in-season and enrollment on the camp side, support on
// ours — and nowhere else: a lane where four rows are accented is a lane back to
// having no single hue. seasons.test.ts caps it at two per lane.
export type SeasonEmphasis = "base" | "accent";

/** The ink a season draws in — its lane's hue, accented or not. */
export function seasonColor(s: Season): string {
  const ink = LANE_INK[s.lane];
  return s.emphasis === "accent" ? ink.accent : ink.base;
}

/** A lane's own hue, for the lane header's dot. */
export function laneColor(lane: SeasonLane): string {
  return LANE_INK[lane].base;
}

export const SEASON_LANES: {
  key: SeasonLane;
  label: string;
  desc: string;
}[] = [
  {
    key: "camp",
    label: "Camp Seasons",
    desc: "The camp's year. What our customers are busy with when.",
  },
  {
    key: "campminder",
    label: "Campminder Seasons",
    desc: "Our own year. When we sell, discover, support and enable.",
  },
];

//                        Sep   Oct   Nov   Dec   Jan   Feb   Mar   Apr   May   Jun   Jul   Aug
export const SEASONS: Season[] = [
  /* ---------------- Camp Seasons ---------------- */
  {
    id: "staff-recruiting",
    lane: "camp",
    label: "Staff recruiting",
    description:
      "Sourcing next summer's staff. Ramps through the fall and peaks over the winter holidays when college students are home and looking.",
    emphasis: "base",
    curve: [0.15, 0.4, 0.75, 0.9, 1.0, 0.85, 0.6, 0.35, 0.2, 0.05, 0.05, 0.1],
    source: "curated",
  },
  {
    id: "staff-hiring",
    lane: "camp",
    label: "Staff hiring",
    description:
      "Offers, contracts and background checks. Peaks Jan–Apr; international hires (J-1 visas, 30–80% of headcount at larger camps) stretch the tail.",
    emphasis: "base",
    curve: [0.05, 0.1, 0.25, 0.5, 0.85, 0.95, 1.0, 0.9, 0.6, 0.3, 0.1, 0.05],
    source: "curated",
  },
  {
    id: "staff-onboarding",
    lane: "camp",
    label: "Staff onboarding",
    description:
      "Paperwork, certifications and training. Compresses hard into the weeks right before camp opens, which is where coordinator hours go.",
    emphasis: "base",
    curve: [0.05, 0.05, 0.1, 0.15, 0.25, 0.4, 0.6, 0.85, 1.0, 0.9, 0.35, 0.15],
    source: "curated",
  },
  {
    id: "enrollment",
    lane: "camp",
    label: "Enrollment / registration",
    description:
      "Families registering for next summer. Opens late fall, peaks Jan–Mar, and is the single highest-stakes window on the camp's calendar.",
    emphasis: "accent",
    curve: [0.1, 0.25, 0.55, 0.75, 1.0, 0.95, 0.8, 0.6, 0.4, 0.25, 0.15, 0.1],
    source: "curated",
  },
  {
    id: "camp-in-season",
    lane: "camp",
    label: "Camp in-season",
    description:
      "Camp is actually running. Attendance, health center, camper location, photos, parent comms — all live, all at once, with no tolerance for downtime.",
    emphasis: "accent",
    curve: [0.1, 0.05, 0.0, 0.0, 0.0, 0.0, 0.05, 0.1, 0.3, 1.0, 1.0, 0.85],
    source: "curated",
  },
  {
    id: "off-season-facilities",
    lane: "camp",
    label: "Off-season facilities",
    description:
      "Work orders, maintenance, and renting the site out once campers leave. The camp's quiet quarter is its build quarter.",
    emphasis: "base",
    curve: [0.9, 1.0, 0.85, 0.55, 0.4, 0.4, 0.5, 0.6, 0.45, 0.1, 0.05, 0.2],
    source: "curated",
  },
  {
    id: "conference",
    lane: "camp",
    label: "Conference season",
    description:
      "Industry conferences, fall-primary, with a February bump for the ACA nationals. Where camps compare notes on what software they're using.",
    emphasis: "base",
    curve: [0.5, 0.9, 1.0, 0.5, 0.2, 0.75, 0.4, 0.15, 0.1, 0.05, 0.05, 0.1],
    source: "curated",
  },

  /* ---------------- Campminder Seasons ---------------- */
  {
    id: "sales",
    lane: "campminder",
    label: "Sales",
    description:
      "Peak season is Fall and Winter, low in Spring, dead in Summer — camps won't switch systems while camp is running.",
    emphasis: "base",
    curve: [0.85, 1.0, 0.95, 0.9, 1.0, 0.85, 0.5, 0.35, 0.25, 0.1, 0.05, 0.15],
    source: "curated",
  },
  {
    id: "discovery",
    lane: "campminder",
    label: "Discovery",
    description:
      "Customer discovery and research, mirroring sales — the same months camps will pick up the phone are the months they'll talk to us.",
    emphasis: "base",
    curve: [0.8, 1.0, 0.9, 0.85, 0.95, 0.8, 0.5, 0.35, 0.25, 0.1, 0.1, 0.2],
    source: "curated",
  },
  {
    id: "support",
    lane: "campminder",
    label: "Support",
    description:
      "Peaks in summer, when every camp is live at once and a defect is an incident. The inverse of sales — our dead quarter is our busiest one.",
    emphasis: "accent",
    curve: [0.3, 0.25, 0.25, 0.35, 0.5, 0.55, 0.6, 0.7, 0.85, 1.0, 1.0, 0.8],
    source: "curated",
  },
  {
    id: "enablement",
    lane: "campminder",
    label: "Enablement",
    description:
      "Training and rollout. Peaks in Winter and dies out through Spring — once camps are close to summer they stop absorbing anything new.",
    emphasis: "base",
    curve: [0.5, 0.7, 0.85, 1.0, 0.95, 0.8, 0.5, 0.25, 0.1, 0.05, 0.05, 0.25],
    source: "curated",
  },
];

/**
 * The fiscal month index a curve peaks in — the FIRST index to reach its
 * maximum. First rather than last matters for the flat-topped curves: camp
 * in-season sits at 1.0 through both June and July, and it's the month the
 * season *arrives* that places it in the year, not where its plateau ends.
 */
export function seasonPeakMonth(curve: SeasonCurve): number {
  let peak = 0;
  for (let i = 1; i < 12; i++) if (curve[i] > curve[peak]) peak = i;
  return peak;
}

/**
 * The seasons in a lane, ordered by the month each one peaks.
 *
 * SEASONS above is written grouped by topic — all three staff seasons together —
 * which is how you'd author the list but not how it should be drawn. Stacked as
 * rows in authoring order the lane is a pile of unrelated humps; ordered by peak
 * it becomes one diagonal wave moving left to right through the fiscal year, and
 * the camp's year reads without a legend: facilities → conferences → recruiting →
 * enrollment → hiring → onboarding → camp is running.
 *
 * Seasons peaking in the same month keep the order this file lists them in
 * (Array.prototype.sort is stable), so the tie between recruiting and enrollment
 * is settled by editing SEASONS, not by tweaking a comparator.
 */
export function seasonsInLane(lane: SeasonLane): Season[] {
  return SEASONS.filter((s) => s.lane === lane).sort(
    (a, b) => seasonPeakMonth(a.curve) - seasonPeakMonth(b.curve),
  );
}

// A season's intensity on a given date, interpolated between the two monthly
// samples it falls between so a reading tracks the drawn curve rather than
// snapping to whichever month it happens to land in.
export function seasonIntensityAt(season: Season, d: Date): number {
  const i = fiscalMonthOffset(d);
  const daysInMonth = new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0,
  ).getDate();
  // Samples sit at month midpoints (see SeasonLanes), so the first and second
  // halves of a month interpolate toward different neighbours.
  const t = (d.getDate() - 0.5) / daysInMonth - 0.5;
  const j = t < 0 ? (i + 11) % 12 : (i + 1) % 12;
  return season.curve[i] + (season.curve[j] - season.curve[i]) * Math.abs(t);
}
