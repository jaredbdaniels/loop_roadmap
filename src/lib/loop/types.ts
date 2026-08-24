import type { HorizonKey, ItemType, Stage } from "./constants";

export interface Submitter {
  type: "human" | "agent";
  name: string;
}

export interface SubItem {
  id: string;
  title: string;
  targetStart: string | null;
  targetEnd: string | null;
  done: boolean;
  // A link to the ADO work item that delivers this piece of the breakdown.
  // Sub-items are the concrete work that rolls up into the parent's progress:
  // linking each to its ADO work item lets `Sync ADO` pull real delivery state
  // and auto-complete the sub-item when its work item closes. `adoStatus` is the
  // synced "State — Iteration" string (never entered by hand), mirroring
  // `Item.adoStatus`. Both default to "" when a sub-item has no linked work.
  adoUrl: string;
  adoStatus: string;
}

// A structured, measurable Key Result. Replaces the old free-text KR string:
// baseline → target with a running current reading, so progress and status are
// computed rather than described. `statement` keeps the original narrative
// sentence (and is what older/imported data migrates into).
export interface KeyResult {
  statement: string;
  metric: string;
  unit: string;
  baseline: number | null;
  target: number | null;
  current: number | null;
}

// A prototype is one divergent direction explored for an idea. Divergent
// prototyping means spinning up several of these for a single framed problem
// — each a distinct bet on how to solve it — evaluating them against the
// idea's outcome KR, then converging on one ("chosen") and rejecting the rest.
export type PrototypeStatus = "exploring" | "chosen" | "rejected";

export interface Prototype {
  id: string;
  title: string; // the direction, e.g. "Inline AI summary" vs "Separate digest page"
  url: string; // link to the artifact (Figma, Vercel preview, Loom, ...)
  approach: string; // what's divergent about this direction / the hypothesis it tests
  createdBy: Submitter; // human or agent — agents can spin up directions too
  status: PrototypeStatus;
  outcomeReading: string; // how this direction read against the KR
  createdAt: string;
}

export interface Item {
  id: string;
  title: string;
  description: string;
  // The team currently delivering this work. Volatile — teams reorg — so it's a
  // reassignable label, not the durable anchor (see `moduleId`).
  mission: string;
  // The single person accountable for this item, picked from OWNERS
  // (constants.ts). Distinct from the team (`mission`) and from a module's
  // domain owner (taxonomy.ts): this is a direct, per-item assignment. "" =
  // unassigned. Drives the "Filter by owner" control.
  owner: string;
  // The stable module this item belongs to (an id from taxonomy.ts). This is the
  // durable anchor: the timeline's Domain grouping resolves an item's domain
  // from its module (module → JTBD → domain), so a team/domain reorg re-maps
  // JTBDs without the work ever having to be re-tagged. Null on legacy items and
  // when unset, in which case the domain falls back to the team mapping (then
  // "unclaimed"). Stored as `capabilityId` before the JTBD rename; migrateItems
  // moves it over.
  moduleId: string | null;
  // The modernization lens this work falls under — Modernize / New value / Both
  // (see ITEM_TYPES). Independent of `stage`; drives the type-colored chips in
  // the owner-grouped roadmap view. Null = not yet classified.
  type: ItemType | null;
  stage: Stage;
  // Manual priority position within a lane (lower = higher up). Null means
  // "unranked" and falls to the bottom of the lane by most-recently-updated.
  // Written by dragging a card within a lane or by "Sort by business value".
  order: number | null;
  horizon: HorizonKey | null;
  targetStart: string | null;
  targetEnd: string | null;
  dependsOn: string[];
  // Bets this item is part of. A bet is a cross-team strategic parent (see
  // `Bet`); an item can belong to several. Mirrors `dependsOn` — a plain list of
  // ids, linked from either the item detail modal or the bet modal — so a bet's
  // teams and dates are derived from its items, not entered by hand. Stored as
  // `initiativeIds` before the bets rename; migrateItems moves it over.
  betIds: string[];
  // The single bet whose capacity this item's work counts against. Every other
  // bet in `betIds` is *enabled by* this item rather than paying for it.
  //
  // Membership is many-to-many, so without a single funder an item on three bets
  // would triple the portfolio's apparent investment. Splitting fractionally
  // would be more precise and would not be maintained; one funder keeps the
  // arithmetic honest and stays true by default (see migrateItems, which
  // auto-sets it when there is exactly one bet and clears it when it points at a
  // bet the item is no longer linked to).
  //
  // Null means "no bet funds this" — the item's work rolls into
  // run-the-business, which is the honest default rather than a broken one.
  // Invariant: when non-null, it always appears in `betIds`.
  fundedBetId: string | null;
  subItems: SubItem[];
  submitter: Submitter;
  problemStatement: string;
  kr: KeyResult;
  // Retained, but no longer part of the product: voting was removed from Loop
  // and nothing in the UI reads or writes this, nor does `computeRank`. It stays
  // because Aha! owns the endorsement count behind it and keeps syncing it in by
  // delta (see `ahaEndorsements`) — discarding the field would make Aha!'s
  // number unrecoverable, and removal was chosen to be losslessly reversible.
  votes: number;
  reach: number;
  confidence: number;
  strategicFit: number;
  notionUrl: string;
  notionTitle: string;
  adoUrl: string;
  adoStatus: string;
  // A link back to the Aha! idea this item was captured from, and its Aha!
  // reference number (e.g. "PROD-I-123"). Set only on items ingested from the
  // Aha! Ideas portal via POST /api/webhooks/aha. `ahaUrl` is the dedup key —
  // repeated webhook fires for the same idea update the existing item rather
  // than creating a duplicate. Both default to "" for items with no Aha! origin.
  // Loop references Aha!, it never mirrors it (same principle as adoUrl/notionUrl).
  ahaUrl: string;
  ahaReference: string;
  // The last Aha! endorsement count synced onto this item. Bookkeeping only:
  // it lets a re-fire apply the *delta* in endorsements to `votes` so whatever is
  // already stored survives rather than being overwritten by Aha!'s raw count.
  // 0 for items with no Aha! origin.
  ahaEndorsements: number;
  prototypeUrl: string; // legacy single-link field; migrated into `prototypes`
  prototypes: Prototype[];
  outcomeReading: string;
  // Structured learning capture, filled in once an item reaches the Learn
  // stage. `outcomeReading` records what happened against the KR; these three
  // capture the reflective/forward-looking learning the raw number doesn't.
  whatWeLearned: string; // the generalizable insight beyond the KR reading
  whatWeDoDifferently: string; // process/decision learnings for next time
  nextBet: string; // the follow-on idea/action this outcome suggests
  killed: boolean;
  killedAt: string | null;
  killedReason: string;
  // The decision record behind horizon === "non-bet". A horizon value alone
  // stores the what and throws away the why, which makes a decline impossible
  // to evaluate later — you cannot tell a good call that aged badly from a bad
  // call, so the argument just gets relitigated from scratch. `nonBetReason` is
  // the one-line rationale; `nonBetRevisitAt` is when it gets re-decided, which
  // is what separates a non-bet from a kill: a no with no expiry is a kill with
  // better manners. Both are cleared when the horizon moves off "non-bet", so a
  // stale rationale can never reappear on a later decline — the wording is
  // preserved in `activity` instead.
  nonBetReason: string;
  nonBetRevisitAt: string | null;
  committedAt: string | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activity: string[];
}

// A team's stated delivery confidence for one month of a Headlights cycle —
// High/Medium/Low, why, and what would raise it — plus that month's top risks
// and asks of leadership. Deliberately not named `confidence`: `Item.confidence`
// is a 1-5 RICE-style estimate about one piece of work, and this is a
// High/Medium/Low judgment about a whole team's whole month. Reusing the word
// would make every future reference to "confidence" ambiguous about which one
// is meant. See docs/launchpad-pivot.md.
export type OutlookLevel = "high" | "medium" | "low";

export interface DeliveryOutlook {
  // Deterministic `${mission}:${month}` — one row per team per month, so
  // saving is always an upsert and there's no separate id to generate or track.
  id: string;
  mission: string; // matches Item.mission / MISSIONS
  month: string; // "YYYY-MM"
  level: OutlookLevel | null; // null = not yet stated
  reasoning: string;
  whatWouldRaiseIt: string;
  risks: string[]; // one line each
  asks: string[]; // specific leadership asks: a decision, a connection, a resource
  updatedBy: string;
  updatedAt: string;
}

export interface Weights {
  // Kept for the same reason as `Item.votes`, and deliberately not zeroed: the
  // stored weight survives so turning voting back on restores the tuning some-
  // one already chose. `computeRank` ignores it and no slider edits it.
  votes: number;
  reach: number;
  confidence: number;
  strategicFit: number;
}

// What a bet claims it is worth. Structured rather than a sentence so bets can
// be compared: you cannot weigh a revenue bet against an option bet without
// knowing which is which, and a magnitude nobody can defend must not sit beside
// a modeled one unmarked. See docs/strategic-bets.md.
export type BetValueType =
  | "new-revenue"
  | "retained-revenue"
  | "cost-to-serve"
  | "strategic-option";

// How `magnitude` was arrived at. Mirrors the epic seed's `date_basis`
// convention (planned/directional/actual). Required whenever a magnitude is
// set: a `guess` is allowed, it just has to say so.
export type BetValueBasis = "modeled" | "benchmarked" | "analogous" | "guess";

export interface BetValue {
  statement: string; // what this is worth and to whom, in a sentence
  type: BetValueType;
  magnitude: number | null; // dollars — ARR, retained revenue, or cost saved
  basis: BetValueBasis;
  timeToValue: number | null; // quarters until the value lands
}

// What backs the thesis — research, competitive loss data, a prototype reading.
// `strength` is 1–5 on the same scale as the item-level confidence field.
export interface BetEvidence {
  strength: number;
  notes: string;
  links: string[];
}

// How a bet ended. One record for every terminal state, kill included, rather
// than a `killed` boolean racing a `status` enum: an enum value carries no
// timestamp, and the decision-quality tally ("at least one losing bet every 6–8
// months") needs one. `decidedAt` is null while the bet is still running.
export type BetVerdict = "won" | "lost" | "inconclusive" | "killed-early";

export interface BetDecision {
  verdict: BetVerdict | null;
  rationale: string;
  decidedAt: string | null;
}

// The pyramid from the Rhythm of Business: 1–3 foundational bets carrying real
// capacity, with smaller experiments on top. Only foundational bets take part in
// the allocation math — with ~20 bets every planned share rounds to 5% and the
// allocation bar stops being readable.
export type BetTier = "foundational" | "experiment";

// The cross-functional themes the annual goals are tagged with.
export type BetTheme = "protect" | "grow" | "new-logos";

// The three annual goal areas and their owners.
export type BetGoalArea = "product-strategy" | "delivery" | "gtm";

export type BetStatus =
  | "proposed"
  | "committed"
  | "active"
  | "scaling"
  | "paused"
  | "concluded"
  | "killed";

// The horizons a bet can allocate planned capacity across. Excludes the two
// horizons that represent an *absence* of planned investment: "unassigned" (no
// call made yet) and "non-bet" (the call was no). Keep this in sync with
// PLANNED_HORIZONS in constants.ts — the exclusion list is spelled out rather
// than derived so adding a horizon key forces a deliberate choice about
// whether it carries capacity.
export type PlannedHorizon = Exclude<HorizonKey, "unassigned" | "non-bet">;

// A strategic bet: a claim about where we will win, with declared capacity
// behind it and a date when we re-decide. Replaces the old `Bet`, which
// was a cross-team parent with a title and a colour and no way to be wrong.
//
// Three things make it a bet rather than a plan: a thesis that can be falsified,
// a `plannedShare` of capacity, and `killCriteria` plus `nextReview`.
//
// It keeps `Bet`'s governing rule — **declared fields are intent,
// everything factual is derived**. A bet carries no dates, teams or progress of
// its own; those come from the items linked via `Item.betIds`, and what it costs
// comes from the items it funds via `Item.fundedBetId`. `jtbdIds` is the one
// declared piece of structure, and it exists precisely so it can be reconciled
// against where the work actually landed.
export interface Bet {
  id: string;
  title: string;
  description: string;
  // "We believe X produces Y because Z" — the answer to the Rhythm of Business
  // question, "why are we making a bet in this area at all?"
  thesis: string;
  whyNow: string; // the timing or competitive window
  tier: BetTier;
  theme: BetTheme;
  goalArea: BetGoalArea;
  sponsor: string; // the exec accountable
  owner: string; // the PM who submitted it, from OWNERS
  status: BetStatus;
  horizon: HorizonKey | null;
  confidence: number; // 1–5, same scale as the item field
  // How cheaply we can stop, 1–5. Not confidence: you can be highly confident in
  // an irreversible bet and only moderately confident in one you can stop next
  // month, and those deserve very different evidence bars.
  reversibility: number;
  value: BetValue;
  evidence: BetEvidence;
  // The bet's own KPIs, entered directly and never aggregated from the linked
  // epics' KRs — an epic KR measures whether one piece of work moved its own
  // metric, and summing a dozen of them does not produce a portfolio-legible
  // number.
  outcomes: KeyResult[];
  // The declared surface area: ids from JTBDS (taxonomy.ts). Top-down intent,
  // deliberately not derived — comparing it against the JTBDs the linked epics
  // actually roll up to is what surfaces a claimed-but-unstaffed area and
  // undeclared scope drift.
  jtbdIds: string[];
  // Intended share of product capacity per horizon, 0–100. PM-editable by
  // design: what keeps it honest is the portfolio view showing every bet's share
  // against the run-the-business remainder, not an approval gate.
  plannedShare: Record<PlannedHorizon, number>;
  killCriteria: string; // what would make us stop
  nextReview: string | null; // ISO date
  decision: BetDecision;
  color: string; // hex; picked from BET_COLORS
  // What happened to this bet, oldest first. Mirrors Item.activity exactly — a
  // plain string log appended by whatever mutation caused the entry, never an
  // event schema. Deliberately unstructured: the moment it gains fields someone
  // will want to query it, and that is a different and much larger feature.
  //
  // This is what makes a bet a plot rather than a state. "Judge the decision,
  // not the outcome" is unanswerable without a record of what was believed
  // when, so the retrospective comparison docs/strategic-bets.md calls the one
  // that compounds depends on this field existing.
  activity: string[];
  createdAt: string;
  updatedAt: string;
}

// A fixed point in time called out on the timeline — e.g. "Beta launch", "Board
// demo", "Registration opens". Unlike Items and Bets (which are spans), a
// milestone is a single date, drawn as a labeled flag pinned across the top of
// the timeline with a vertical line down the chart.
export interface Milestone {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD" — a single point in time
  color: string; // hex; picked from BET_COLORS
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoopState {
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  // Lives in LoopState (not beside it, the way workspace config does) on
  // purpose: this is a declared current belief, exactly like `weights` — you
  // want it forked when someone drafts a what-if, and diffed the same way.
  // See docs/launchpad-pivot.md.
  outlooks: DeliveryOutlook[];
}

// A personal "what-if" copy of the whole roadmap. `state` is a full LoopState
// the owner edits freely without touching the live roadmap; the live roadmap is
// the implicit scenario referred to by the sentinel id `"main"` (which never has
// a row). See src/lib/schema.ts `scenarios`.
export interface Scenario {
  id: string;
  name: string;
  createdBy: string;
  state: LoopState;
  forkedAt: string;
  createdAt: string;
  updatedAt: string;
}

// Scenario without its (large) state blob — for populating the switcher.
export type ScenarioMeta = Omit<Scenario, "state">;

// The sentinel scenario id for the live/shared roadmap. Never stored as a row.
export const MAIN_SCENARIO = "main";

// One changed field on an entity: what it was on live vs. in the draft.
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface EntityChange {
  id: string;
  title: string;
  changes: FieldChange[];
}

// A structured diff between the live roadmap and a scenario draft. Additions are
// items present in the draft but not live; removals are the reverse; changes are
// per-field before→after on items that exist in both. Same shape for bets and
// milestones. `weights` lists changed ranking weights.
export interface StateDiff {
  itemsAdded: Item[];
  itemsRemoved: Item[];
  itemsChanged: EntityChange[];
  betsAdded: Bet[];
  betsRemoved: Bet[];
  betsChanged: EntityChange[];
  milestonesAdded: Milestone[];
  milestonesRemoved: Milestone[];
  milestonesChanged: EntityChange[];
  weights: FieldChange[];
}
