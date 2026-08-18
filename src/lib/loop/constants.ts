// Loop domain constants — ported verbatim from the original single-file build.
// Keep these in sync with the seed data and the schema defaults.

import { TEAMS, getDomain } from "./taxonomy";

// The intake lane. **Intake is not a Headlights band** — it is the inbox that
// feeds them, and everything sitting in it is explicitly *not yet* intended
// investment. That distinction is the whole reason it can exist without Loop
// inventing a fifth lifecycle word for the company to learn: Headlights
// forecasts the next three months, and an idea nobody has committed time to is
// not in that forecast. Ideas land here from the capture modal and the Aha!
// webhook, and moving one to Discovery is a real decision — "we are going to
// spend time on this" — rather than a formality.
//
// Named for the state, not the act that produced it: capturing is what you do,
// Intake is where the idea then sits. The lane was called "Capture" until the
// two started competing for the same word.
//
// Consequently nothing portfolio-facing counts it: see `isIntake` and
// `itemQuarters` in logic.ts.
export const INTAKE_STAGE = "Intake" as const;

// The four lifecycle bands from the Headlights process — the monthly rolling
// 3-month planning ceremony product and engineering leadership review. Loop uses
// the same four words so a card's lane here and a sticky's band on a Headlights
// board mean exactly the same thing, and no one has to translate between them.
//
//   Discovery    problem-space work: is this need real and worth investing in?
//                Need-finding, the opportunity side of an opportunity-solution
//                tree. Not solution design.
//   Solutioning  solution-space work: what should we deliver at scale to meet
//                the need? Path-finding — prototypes, spikes, flow validation.
//                This is where build-to-learn happens.
//   Building     build-to-earn work: production software the company intends to
//                deliver broadly and sustainably.
//   Releasing    software in customers' hands. Beta, pilot, staged rollout and
//                phased enablement all count — releasing is not only GA.
//
// Kept as its own constant, not just `STAGES.slice(1)`, so "what Headlights
// sees" is a thing the code states rather than a thing it implies.
export const LIFECYCLE_STAGES = [
  "Discovery",
  "Solutioning",
  "Building",
  "Releasing",
] as const;

// Every lane on the board, in order: the intake inbox, then the four lifecycle
// bands.
export const STAGES = [INTAKE_STAGE, ...LIFECYCLE_STAGES] as const;

export type Stage = (typeof STAGES)[number];
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

// The modernization "type" of a piece of work — the lens the two-year
// owner-grouped roadmap colors every item by. Orthogonal to `stage` (where the
// item sits in the loop): this is *what kind* of bet it is.
//   modernize  — rebuild/migrate an existing surface off the monolith
//   new-value  — brand-new customer value that didn't exist before
//   both       — modernization that also ships new value
// Null on the Item means "not yet classified" (older/imported rows).
export const ITEM_TYPES = ["modernize", "new-value", "both"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

// Label + colors per type, matching the owner-grouped roadmap HTML: navy for
// modernization, green for new value, purple for both. `fg` is the accent used
// for text and the chip's left border; `bg` is the chip fill.
//
// `fgDark`/`bgDark` are the same three hues re-lit for a dark surface: the
// light-mode `fg` navy/green/purple would be near-invisible on a dark
// background, and the pastel `bg` values would read as a stray white box, so
// dark mode gets a light tint for the text and a deep, low-key tint for the
// fill instead. Each pair keeps its hue identity — still recognizably
// navy/green/purple — so a chip means the same thing in either theme.
export const ITEM_TYPE_INFO: Record<
  ItemType,
  { label: string; fg: string; bg: string; fgDark: string; bgDark: string }
> = {
  modernize: {
    label: "Modernize",
    fg: "#1F2A5A",
    bg: "#E4EAF6",
    fgDark: "#AEC0F5",
    bgDark: "#1E2A4D",
  },
  "new-value": {
    label: "New value",
    fg: "#1E7A63",
    bg: "#DEF1EB",
    fgDark: "#7FE0C0",
    bgDark: "#163D33",
  },
  both: {
    label: "Both",
    fg: "#6A3FA0",
    bg: "#EDE6F7",
    fgDark: "#CBA8F0",
    bgDark: "#2E1E4D",
  },
};

// Grey for the inbox — it reads as "not yet real", which is exactly what Intake
// means — then the four bands progress blue → amber → green → purple.
export const STAGE_COLORS: Record<string, string> = {
  Intake: "#A0A0A0",
  Discovery: "#3DA5D9",
  Solutioning: "#FFA61E",
  Building: "#00AA47",
  Releasing: "#27065C",
};

// Mapping from earlier stage models, applied to any imported or saved data.
//
// The immediately preceding model was Loop's own five-stage loop (Capture →
// Frame → Validate → Deliver → Learn). Frame and Validate were both
// solution-space work — stating the problem and its KR, then prototyping
// against it — so they collapse into the single Solutioning band; the other
// three map one-to-one. Capture became Intake — same lane, same meaning, a name
// for the state rather than for the act that produced it. It maps across rather
// than into Discovery: promoting a parked idea behind someone's back would
// silently claim time nobody agreed to spend.
//
// Earlier still, prioritization was its own stage. It is now a continuous
// ranking that applies inside every lane (drag to order, or sort a lane by
// business value), so ranked-but-not-yet-built items fold into Solutioning.
export const STAGE_MIGRATION: Record<string, Stage> = {
  // The five-stage loop.
  Capture: "Intake",
  Frame: "Solutioning",
  Validate: "Solutioning",
  Deliver: "Building",
  Learn: "Releasing",
  // Older models.
  "Rank & Vote": "Solutioning",
  Prioritize: "Solutioning",
  Prototype: "Solutioning",
  Evaluate: "Solutioning",
  Commit: "Building",
  // Ship used to fold into Deliver, because the old model had nowhere else to
  // put it. Releasing is now that place.
  Ship: "Releasing",
};

// The delivery teams, derived from TEAMS in the JTBD map (taxonomy.ts) so
// the roster and its order stay in lockstep. Named for the domain and scope they
// own ("Core — Financial Services") rather than by codename.
//
// A team is NOT a JTBD: there are 33 JTBDs and 11 teams, and a team spans several
// JTBDs. So an item's team is stored on the item and is never derived from its
// module — only migrated from a retired team name (see migrateItems).
export const MISSIONS: string[] = TEAMS.map((t) => t.label);

// The people who can own a roadmap item. An owner is the single person
// accountable for a piece of work — distinct from the item's team (which
// delivers it) and from the domain's product owner in taxonomy.ts (who owns the
// module's whole domain). Stored on the Item as a plain name string; "" =
// unassigned. Kept as a flat roster here (single source of truth for the
// capture/detail selects and the owner filter) alongside MISSIONS.
// Sentinel value for the owner filter meaning "only items with no owner set".
// Kept distinct from a real name and from "all" so the filter can target the
// unassigned pile explicitly.
export const OWNER_UNASSIGNED = "__unassigned__";

// An item with no team. Distinct from a retired team name: migrateItems leaves
// this alone rather than re-deriving a team from the module, so "no team yet"
// is a value someone can actually set and keep. Items holding it surface in the
// Team view's trailing "Unclaimed" band.
export const TEAM_UNASSIGNED = "";

export const OWNERS: string[] = [
  "Al",
  "Ali",
  "Allison",
  "Anna",
  "Annette",
  "Ellen",
  "Erika",
  "Jared",
  "Maggie",
  "Megan",
  "Michael",
  "Mya",
  "Nico",
  "Scott",
];

// The purpose line shown under a team name in the Team view and in the hover
// tooltips wherever a team name appears: the domain it delivers into and the
// team's engineering lead. Derived from the taxonomy so it never drifts from the
// roster above.
//
// Deliberately no product owner: `Domain.owner` is the owner of a whole domain,
// not of any one team inside it, and repeating it on every team band read as if
// each team had its own. It shows where a domain is the thing on screen — the
// domain bands in the Team and timeline views, and the resolved-domain line under
// ModuleSelect.
export const MISSION_INFO: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => {
    const d = getDomain(t.domainId);
    const parts = [d?.label ?? t.label];
    if (t.lead) parts.push(`eng: ${t.lead}`);
    return [t.label, parts.join(" · ")];
  }),
);

// Palette for cross-team bets. Distinct from STAGE_COLORS (which color item bars
// by stage) so a bet reads as its own thread woven through the team bands. The
// BetModal offers these as swatches.
export const BET_COLORS = [
  "#7A5AF8", // violet
  "#E8618C", // rose
  "#0E9F9F", // teal
  "#E8833A", // amber
  "#4C6EF5", // indigo
  "#12B76A", // green
] as const;

export type HorizonKey = "now" | "next" | "later" | "unassigned";

export const HORIZONS: {
  key: HorizonKey;
  label: string;
  color: string;
  desc: string;
}[] = [
  {
    key: "now",
    label: "Now",
    color: "#00AA47",
    desc: "Being worked or starting imminently. Committed intent.",
  },
  {
    key: "next",
    label: "Next",
    color: "#FFA61E",
    desc: "Queued after Now. Direction is set, dates are soft.",
  },
  {
    key: "later",
    label: "Later",
    color: "#3DA5D9",
    desc: "On the radar. Sequenced by intent, not by date.",
  },
  {
    key: "unassigned",
    label: "Unassigned",
    color: "#A0A0A0",
    desc: "No horizon call made yet.",
  },
];

// px per day, per zoom level
export const ZOOMS: Record<"month" | "quarter" | "year", number> = {
  month: 8,
  quarter: 3.4,
  year: 1.35,
};

export const DAY = 86400000;

export type ViewKey = "board" | "mission" | "timeline" | "horizon";
export type ZoomKey = "month" | "quarter" | "year";
// How the timeline and Team views segment their rows: into team bands (the
// default), into one band per bet, or into one band per domain (the durable
// JTBD-map grouping — see taxonomy.ts).
export type GroupByKey = "team" | "domain" | "bet";

/* ---------------- bets ----------------
   The vocabulary of a strategic bet. See docs/strategic-bets.md for the model;
   these are the enumerations the BetModal offers and the portfolio math reads.
   Each carries its labels here so the UI never hard-codes a display string. */

// The pyramid: 1–3 foundational bets carry real capacity, experiments sit on top
// of them. Only foundational bets take part in the allocation math — with ~20
// bets every planned share rounds to 5% and the bar stops being readable.
export const BET_TIERS = ["foundational", "experiment"] as const;

export const BET_TIER_LABELS: Record<(typeof BET_TIERS)[number], string> = {
  foundational: "Foundational",
  experiment: "Experiment",
};

// How many foundational bets the portfolio view warns above.
export const MAX_FOUNDATIONAL_BETS = 3;

export const BET_THEMES = ["protect", "grow", "new-logos"] as const;

export const BET_THEME_LABELS: Record<(typeof BET_THEMES)[number], string> = {
  protect: "Protect",
  grow: "Grow",
  "new-logos": "New logos",
};

export const BET_GOAL_AREAS = ["product-strategy", "delivery", "gtm"] as const;

export const BET_GOAL_AREA_LABELS: Record<
  (typeof BET_GOAL_AREAS)[number],
  string
> = {
  "product-strategy": "Product Strategy",
  delivery: "Delivery",
  gtm: "GTM",
};

export const BET_STATUSES = [
  "proposed",
  "committed",
  "active",
  "scaling",
  "paused",
  "concluded",
  "killed",
] as const;

export const BET_STATUS_LABELS: Record<(typeof BET_STATUSES)[number], string> = {
  proposed: "Proposed",
  committed: "Committed",
  active: "Active",
  scaling: "Scaling",
  paused: "Paused",
  concluded: "Concluded",
  killed: "Killed",
};

// Statuses that mean the bet has stopped. The decision-quality tally counts the
// killed ones; neither takes part in the allocation math.
export const BET_TERMINAL_STATUSES: readonly string[] = ["concluded", "killed"];

export const BET_VALUE_TYPES = [
  "new-revenue",
  "retained-revenue",
  "cost-to-serve",
  "strategic-option",
] as const;

export const BET_VALUE_TYPE_LABELS: Record<
  (typeof BET_VALUE_TYPES)[number],
  string
> = {
  "new-revenue": "New revenue",
  "retained-revenue": "Retained revenue",
  "cost-to-serve": "Cost to serve",
  "strategic-option": "Strategic option",
};

// How a value magnitude was arrived at. Ordered weakest-last so a UI can sort
// by rigour. A `guess` is allowed — it just has to say so, and it disqualifies
// the bet from the value-density comparison.
export const BET_VALUE_BASES = [
  "modeled",
  "benchmarked",
  "analogous",
  "guess",
] as const;

export const BET_VALUE_BASIS_LABELS: Record<
  (typeof BET_VALUE_BASES)[number],
  string
> = {
  modeled: "Modeled",
  benchmarked: "Benchmarked",
  analogous: "Analogous",
  guess: "Guess",
};

export const BET_VERDICTS = [
  "won",
  "lost",
  "inconclusive",
  "killed-early",
] as const;

export const BET_VERDICT_LABELS: Record<(typeof BET_VERDICTS)[number], string> =
  {
    won: "Won",
    lost: "Lost",
    inconclusive: "Inconclusive",
    "killed-early": "Killed early",
  };

// The horizons a planned share can be expressed for — every horizon except
// "unassigned", where an intended share of capacity has no meaning.
export const PLANNED_HORIZONS = ["now", "next", "later"] as const;
