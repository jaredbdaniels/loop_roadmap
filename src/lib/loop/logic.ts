// Loop domain logic — ported from the original single-file build.
// Functions that read global state in the original now take `items` / `weights`
// explicitly so they are pure and reusable on both server and client.

import {
  BET_COLORS,
  BET_GOAL_AREAS,
  BET_STATUSES,
  BET_STATUS_LABELS,
  BET_TERMINAL_STATUSES,
  BET_THEMES,
  BET_TIERS,
  BET_TIER_LABELS,
  BET_VALUE_BASES,
  BET_VALUE_TYPES,
  BET_VERDICTS,
  BET_VERDICT_LABELS,
  DAY,
  HORIZONS,
  INTAKE_STAGE,
  ITEM_TYPES,
  MISSIONS,
  PLANNED_HORIZONS,
  STAGES,
  STAGE_MIGRATION,
  TEAM_UNASSIGNED,
  type HorizonKey,
  type ItemType,
  type Stage,
} from "./constants";
import {
  TEAM_DOMAIN,
  UNCLAIMED_DOMAIN_ID,
  moduleDomainId,
  moduleJtbd,
  moduleTeam,
} from "./taxonomy";
import type {
  Bet,
  BetDecision,
  BetEvidence,
  BetValue,
  BetVerdict,
  EntityChange,
  FieldChange,
  Item,
  KeyResult,
  LoopState,
  Milestone,
  PlannedHorizon,
  Prototype,
  StateDiff,
  SubItem,
  Weights,
} from "./types";

/* ---------------- normalization / migration ---------------- */
// Fills defaults on older/imported data and migrates earlier stage models to
// the current four Headlights lifecycle bands.
// Every team name this app has used that is no longer a team, mapped to the one
// that inherited the work: first the original codenames (Apollo, Phoenix, …),
// then the product-area sub-domains that replaced them and which the
// Architecture-Aligned map in turn replaced with modules.
//
// A stored team is migrated on load so no row is stranded team-less. Resolution
// order in migrateItems is: keep a name that is still a real team → the team that
// owns the module's JTBD → this table → "" (unassigned). Idempotent, since no
// current team label is a key here.
const RETIRED_TEAM: Record<string, string> = {
  // Original codenames.
  Alpha: "Community — Family Engagement & Comms Service",
  Apollo: "Community — Staffing",
  Delta: "Core — Admin Workflows",
  "Delta 2": "Core — Admin Workflows",
  Phoenix: "Community — Staffing",
  "Phoenix 2": "Core — Financial Services",
  "Data Dev": "Platform — Data & Integrations",
  Gazebo: "",
  "Cross-cutting": "Community — Staffing",
  // Sub-domains from the previous map.
  Communication: "Community — Family Engagement & Comms Service",
  Family: "Community — Family Engagement & Comms Service",
  Staff: "Community — Staffing",
  Productivity: "Core — Admin Workflows",
  "Camp Operations": "Core — Admin Workflows",
  Financials: "Core — Financial Services",
  "All Things UltraCamp": "UltraCamp",
  "Forms & Documents": "Platform — Data & Integrations",
  Integration: "Platform — Data & Integrations",
  Access: "Platform — Identity & Core Services",
  "Data & Analytics": "Platform — Data & Integrations",
  Customization: "Platform — Identity & Core Services",
  "AI Platform & Enablement": "Platform — AI Platform",
  Automation: "Platform — Identity & Core Services",
  "Rentals & Events": "",
  "Staff Payroll": "Community — Staffing",
  // Renamed teams, whose stored label is retired the same way a retired team's
  // is. Payments became Financial Services when the team's scope grew past
  // taking payments; both it and Admin Workflows then took a "Core — " prefix
  // when the Core domain was drawn around them, so a row saved under either of
  // the two older labels lands on the current one in a single hop.
  "Platform — Payments": "Core — Financial Services",
  "Platform — Financial Services": "Core — Financial Services",
  "Admin Workflows": "Core — Admin Workflows",
  // The two Community teams renamed for the scope each leads with: Staff &
  // Family Comms became Staffing, and Engagement & Advancement became Family
  // Engagement & Comms Service, which then took the Family Comms JTBD over from
  // it. These are the no-module fallbacks — a row anchored to a module still
  // resolves through its JTBD first, so a Family Comms item saved under the old
  // Staff & Family Comms name lands on the Comms Service team, not on Staffing.
  "Community — Staff & Family Comms": "Community — Staffing",
  "Community — Engagement & Advancement":
    "Community — Family Engagement & Comms Service",
  // Platform — AI took the name of the JTBD it owns end to end.
  "Platform — AI": "Platform — AI Platform",
  // Customer Love re-parented from the Admin Workflows domain to Core, and its
  // prefix followed. It owns no JTBD, so the retirement table is the only route
  // a stored row has back to it.
  "Admin Workflows — Customer Love": "Core — Customer Love",
  // DevOps became Developer Platform, dropping the domain prefix: the team is
  // named for the platform it builds, not the domain it delivers into. It owns
  // no JTBD, so — as with Customer Love — this entry is the only route a stored
  // row has back to it, and a row that also carries a module resolves through
  // that module's JTBD first.
  "Platform — DevOps": "Developer Platform",
  // Ambiguous both as a codename and as the old Integration sub-domain; the
  // module's JTBD wins over this entry whenever the item has one.
  Platform: "Platform — Identity & Core Services",
};

const CURRENT_TEAMS = new Set(MISSIONS);

// Stage names — current and historical — that mean the work reached customers,
// and so imply a shipped date on any row that lacks one.
const SHIPPED_STAGES = new Set(["Releasing", "Learn", "Ship"]);

export function migrateItems(items: Item[]): Item[] {
  return items.map((raw) => {
    const i: Item = { ...(raw as Item) };
    // The durable anchor was stored as `capabilityId` before the JTBD rename
    // (Domain → Module → Capability became Domain → JTBD → Module). The ids
    // themselves didn't change, so carrying the old value straight over keeps
    // every existing row anchored; the stale key is then dropped so a database
    // can't hold two copies that drift apart.
    const legacy = i as Item & { capabilityId?: string | null };
    if (i.moduleId === undefined && legacy.capabilityId !== undefined)
      i.moduleId = legacy.capabilityId;
    delete legacy.capabilityId;
    if (i.moduleId === undefined) i.moduleId = null;
    // Backfill the team on older/imported rows, like `owner` below.
    if (typeof i.mission !== "string") i.mission = TEAM_UNASSIGNED;
    // Retired team → current team. A name that is still a real team is left
    // alone, and so is an explicitly unassigned one — otherwise a deliberate
    // "no team" would be silently re-filled on every load. Anything else is a
    // retired name: the team owning the module's JTBD wins, since the module is
    // the durable anchor and says who inherited the work, then the retirement
    // table, then unassigned.
    if (i.mission !== TEAM_UNASSIGNED && !CURRENT_TEAMS.has(i.mission)) {
      i.mission =
        moduleTeam(i.moduleId) || RETIRED_TEAM[i.mission] || TEAM_UNASSIGNED;
    }
    // Backfill the person owner on older/imported rows (empty = unassigned).
    // A free-text string by design so a name not (yet) in OWNERS still round-trips.
    if (typeof i.owner !== "string") i.owner = "";
    // Coerce the modernization type: keep a valid value, otherwise treat the
    // item as unclassified (covers older rows with no `type` and bad imports).
    i.type = ITEM_TYPES.includes(i.type as ItemType) ? i.type : null;
    if (i.order === undefined) i.order = null;
    if (i.horizon === undefined) i.horizon = null;
    if (i.targetStart === undefined) i.targetStart = null;
    if (i.targetEnd === undefined) i.targetEnd = null;
    if (!Array.isArray(i.dependsOn)) i.dependsOn = [];
    // Bets were called initiatives before the strategic-bets rename. The ids
    // did not change, so the old list carries straight over and the stale key is
    // dropped — a database must not hold two copies that drift apart. Same shape
    // as the capabilityId → moduleId move above.
    const legacyBets = i as Item & { initiativeIds?: string[] };
    if (!Array.isArray(i.betIds) && Array.isArray(legacyBets.initiativeIds))
      i.betIds = legacyBets.initiativeIds;
    delete legacyBets.initiativeIds;
    if (!Array.isArray(i.betIds)) i.betIds = [];
    // The funder: one bet pays for this item, the rest are enabled by it.
    // Two rules keep it true without anyone maintaining it by hand.
    if (i.fundedBetId === undefined) i.fundedBetId = null;
    // 1. Enforce the invariant. A funder the item is no longer linked to would
    //    silently keep charging that bet, so it is cleared rather than trusted.
    if (i.fundedBetId !== null && !i.betIds.includes(i.fundedBetId))
      i.fundedBetId = null;
    // 2. Auto-set the unambiguous case. With exactly one bet there is nothing to
    //    decide, so the overwhelmingly common case never needs a human. With
    //    several, it stays null until someone picks — the work rolls into
    //    run-the-business meanwhile, which is honest rather than broken.
    if (i.fundedBetId === null && i.betIds.length === 1)
      i.fundedBetId = i.betIds[0];
    // Backfill the non-bet decision record, and enforce its invariant: the
    // reason and revisit date only mean anything while the item is actually a
    // non-bet. Clearing them on any other horizon stops a months-old rationale
    // silently re-attaching itself if the item is declined again later.
    if (typeof i.nonBetReason !== "string") i.nonBetReason = "";
    if (typeof i.nonBetRevisitAt !== "string") i.nonBetRevisitAt = null;
    if (i.horizon !== "non-bet") {
      i.nonBetReason = "";
      i.nonBetRevisitAt = null;
    }
    if (!Array.isArray(i.subItems)) i.subItems = [];
    // Backfill the ADO link fields on older sub-items so they can carry a
    // work-item reference and a synced status like their parent item does.
    i.subItems = i.subItems.map((s) => ({
      ...s,
      adoUrl: typeof s.adoUrl === "string" ? s.adoUrl : "",
      adoStatus: typeof s.adoStatus === "string" ? s.adoStatus : "",
    }));
    // Backfill the prototypes array; migrate a legacy single prototypeUrl into it.
    if (!Array.isArray(i.prototypes)) i.prototypes = [];
    if (i.prototypes.length === 0 && i.prototypeUrl && i.prototypeUrl.trim()) {
      i.prototypes = [
        {
          // Deterministic id so re-running migration doesn't churn the key.
          id: i.id + "-p0",
          title: "Prototype",
          url: i.prototypeUrl.trim(),
          approach: "",
          createdBy: {
            type: i.submitter?.type === "agent" ? "agent" : "human",
            name: i.submitter?.name || "",
          },
          status: "exploring",
          outcomeReading: "",
          createdAt: i.updatedAt || i.createdAt || new Date().toISOString(),
        },
      ];
    }
    // Backfill the Aha! reference fields so older/imported rows carry the
    // capture-origin link and reference number (empty when not from Aha!).
    if (typeof i.ahaUrl !== "string") i.ahaUrl = "";
    if (typeof i.ahaReference !== "string") i.ahaReference = "";
    if (typeof i.ahaEndorsements !== "number") i.ahaEndorsements = 0;
    if (i.shippedAt === undefined) i.shippedAt = null;
    // Backfill the structured learning-capture fields on older/imported rows.
    if (i.whatWeLearned === undefined) i.whatWeLearned = "";
    if (i.whatWeDoDifferently === undefined) i.whatWeDoDifferently = "";
    if (i.nextBet === undefined) i.nextBet = "";
    // Backfill the structured KR. Old data stored the KR as a free-text
    // `successMetric` string; carry it over as the narrative `statement` so
    // nothing is lost, then let the user fill in the measurable fields.
    i.kr = normalizeKr(
      (raw as { kr?: Partial<KeyResult> }).kr,
      (raw as { successMetric?: string }).successMetric,
    );
    delete (i as { successMetric?: string }).successMetric;
    // Any stage that means "customers have it" implies a shipped date, whether
    // it is the current band or one of the names that migrate into it.
    const stage = i.stage as string;
    if (SHIPPED_STAGES.has(stage) && !i.shippedAt)
      i.shippedAt = i.updatedAt || i.createdAt || new Date().toISOString();
    if (STAGE_MIGRATION[stage]) i.stage = STAGE_MIGRATION[stage];
    return i;
  });
}

/* ---------------- key results ---------------- */
// Coerces any partial/legacy KR shape into a complete KeyResult.
export function normalizeKr(
  kr: Partial<KeyResult> | undefined,
  legacyStatement?: string,
): KeyResult {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    statement: kr?.statement ?? legacyStatement ?? "",
    metric: kr?.metric ?? "",
    unit: kr?.unit ?? "",
    baseline: num(kr?.baseline),
    target: num(kr?.target),
    current: num(kr?.current),
  };
}

// True once the KR has enough structure to track progress against.
export function isMeasurable(kr: KeyResult): boolean {
  return !!(kr.metric.trim() && kr.baseline !== null && kr.target !== null);
}

// 0–100 completion of the KR, or null if it can't be computed yet. Works in
// either direction (target above or below baseline).
export function krProgress(kr: KeyResult): number | null {
  if (kr.baseline === null || kr.target === null || kr.current === null)
    return null;
  if (kr.target === kr.baseline)
    return kr.current === kr.target ? 100 : 0;
  const pct = ((kr.current - kr.baseline) / (kr.target - kr.baseline)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function krStatus(
  kr: KeyResult,
): "unset" | "in-progress" | "achieved" {
  const p = krProgress(kr);
  if (p === null) return "unset";
  if (p >= 100) return "achieved";
  if (p > 0) return "in-progress";
  return "unset";
}

/* ---------------- the intake inbox ---------------- */
// True while an idea is still in the Intake lane — parked, not yet worked.
//
// This is the line between "somebody wrote this down" and "we are spending time
// on it", and it is why the Intake lane can exist alongside the four Headlights
// bands without competing with them. Everything portfolio-facing reads this:
// intake items consume no capacity (`itemQuarters`) and are not counted among
// the items expected to be framed (`computeStats`).
export function isIntake(item: Item): boolean {
  return item.stage === INTAKE_STAGE;
}

/* ---------------- gates ---------------- */
export function isFramed(item: Item): boolean {
  return !!(
    item.problemStatement &&
    item.problemStatement.trim().length >= 20 &&
    isMeasurable(item.kr)
  );
}

// The specific framing requirements an item is still missing, phrased so they
// drop straight into a sentence. Empty once the item passes isFramed. Each
// piece is called out on its own so the block never lumps a fully-typed KR in
// with the one field (usually the baseline) the user actually left blank.
export function framingGaps(item: Item): string[] {
  const gaps: string[] = [];
  if (!item.problemStatement || item.problemStatement.trim().length < 20)
    gaps.push("a problem statement");
  const kr = item.kr;
  if (!kr || !kr.metric.trim()) gaps.push("a metric");
  if (!kr || kr.baseline === null) gaps.push("a baseline value");
  if (!kr || kr.target === null) gaps.push("a target value");
  return gaps;
}

// Natural-language join: [a] -> "a", [a,b] -> "a and b",
// [a,b,c] -> "a, b, and c".
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/* ---------------- prototypes (divergent prototyping) ---------------- */
export function itemPrototypes(item: Item): Prototype[] {
  return Array.isArray(item.prototypes) ? item.prototypes : [];
}

// Directions still in play — everything not explicitly rejected.
export function livePrototypes(item: Item): Prototype[] {
  return itemPrototypes(item).filter((p) => p.status !== "rejected");
}

export function chosenPrototype(item: Item): Prototype | null {
  return itemPrototypes(item).find((p) => p.status === "chosen") || null;
}

// Two or more live directions with none chosen yet: the idea has diverged but
// hasn't converged. A soft signal — the loop nudges, it doesn't hard-block.
export function divergedNotConverged(item: Item): boolean {
  const live = livePrototypes(item);
  return live.length >= 2 && !live.some((p) => p.status === "chosen");
}

export function hasEvidence(item: Item): boolean {
  if (itemPrototypes(item).some((p) => p.url && p.url.trim())) return true;
  return !!(item.prototypeUrl && item.prototypeUrl.trim());
}

/* ---------------- the artifact a card links out to ---------------- */

// Loop references the artifacts, it never mirrors them (Loop/INTEGRATIONS.md:
// "Notion owns narrative"). Which one you want depends on where the work is: a
// framed idea sends you to the brief, a converged one to the design, and one in
// delivery to the work item.
export type ItemLinkKind = "brief" | "design" | "ado" | "idea";

export interface ItemLink {
  kind: ItemLinkKind;
  url: string;
  // Names the destination rather than saying "open doc": the point of resolving
  // dynamically is that you know where a click goes before you make it. Also the
  // tooltip and aria-label on the surfaces too small to show it (ItemLink.tsx).
  label: string;
  detail: string; // the artifact's own name or status, for the tooltip. "" if unknown.
}

const LINK_LABELS: Record<ItemLinkKind, string> = {
  brief: "Open brief",
  design: "Open design",
  ado: "Open in ADO",
  idea: "Open idea",
};

// Per stage, which artifact is the one you most likely want — but every stage
// lists all four, because preference is not availability. An item in Building
// with no work item linked yet and a good brief has to open the brief; a button
// that dead-ends is worse than one that sends you somewhere slightly less
// specific. First kind in the list that actually has a URL wins.
//
// Solutioning prefers the design over the brief: by then the problem is stated
// and the open question is which direction won.
const LINK_PREFERENCE: Record<Stage, ItemLinkKind[]> = {
  Intake: ["idea", "brief", "design", "ado"],
  Discovery: ["brief", "idea", "design", "ado"],
  Solutioning: ["design", "brief", "ado", "idea"],
  Building: ["ado", "design", "brief", "idea"],
  Releasing: ["ado", "design", "brief", "idea"],
};

function trimmed(s: string | null | undefined): string {
  return (s || "").trim();
}

function resolveLinkKind(
  item: Item,
  kind: ItemLinkKind,
): { url: string; detail: string } | null {
  if (kind === "brief") {
    const url = trimmed(item.notionUrl);
    return url ? { url, detail: trimmed(item.notionTitle) } : null;
  }
  if (kind === "idea") {
    const url = trimmed(item.ahaUrl);
    return url ? { url, detail: trimmed(item.ahaReference) } : null;
  }
  if (kind === "ado") {
    const own = trimmed(item.adoUrl);
    if (own) return { url: own, detail: trimmed(item.adoStatus) };
    // Nothing on the epic itself, but the breakdown may still carry a work
    // item — and the first sub-item's board is a better answer than none.
    const sub = (item.subItems || []).find((s) => trimmed(s.adoUrl));
    return sub
      ? { url: trimmed(sub.adoUrl), detail: trimmed(sub.title) }
      : null;
  }
  // design: the direction that was converged on, else the newest one still in
  // play, else the pre-`prototypes` single link.
  const chosen = chosenPrototype(item);
  if (chosen && trimmed(chosen.url)) {
    return { url: trimmed(chosen.url), detail: trimmed(chosen.title) };
  }
  const newest = livePrototypes(item)
    .filter((p) => trimmed(p.url))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (newest) {
    return { url: trimmed(newest.url), detail: trimmed(newest.title) };
  }
  const legacy = trimmed(item.prototypeUrl);
  return legacy ? { url: legacy, detail: "" } : null;
}

// The single artifact link a card should offer, or null when the item has no
// linked artifact at all — in which case the surface asks for one rather than
// rendering a disabled button (see ItemLink.tsx).
export function itemLink(item: Item): ItemLink | null {
  const preference = LINK_PREFERENCE[item.stage] || LINK_PREFERENCE.Solutioning;
  for (const kind of preference) {
    const hit = resolveLinkKind(item, kind);
    if (hit) return { kind, label: LINK_LABELS[kind], ...hit };
  }
  return null;
}

// Both gates now sit on the same boundary — the one out of Solutioning.
//
// Framing (a real problem statement and a measurable KR) and evidence (a
// prototype that was actually built and read) are both solution-space work, and
// Solutioning is the band where they happen. So nothing crosses into Building
// or Releasing without them, and nothing inside Discovery or Solutioning is
// blocked for not having them yet. Under the old five-stage model these gates
// were split across Frame → Validate → Deliver; collapsing Frame and Validate
// into one band leaves one boundary for both to sit on.
export function stageBlockReason(
  item: Item,
  targetStage: string,
): string | null {
  const targetIdx = STAGES.indexOf(targetStage as (typeof STAGES)[number]);
  if (targetIdx < STAGES.indexOf("Building")) return null;
  if (!isFramed(item))
    return `"${item.title}" still needs ${joinList(
      framingGaps(item),
    )} before it can move to ${targetStage}.`;
  if (!hasEvidence(item))
    return `"${item.title}" needs a prototype or evidence link before it can move to ${targetStage}. Build something small and evaluate it first.`;
  return null;
}

export function canEnterStage(item: Item, targetStage: string): boolean {
  return !stageBlockReason(item, targetStage);
}

/* ---------------- ordering (priority within a lane) ---------------- */
// Sort comparator for the position of cards inside a single lane. Items with an
// explicit manual `order` sort first, ascending (top = highest priority);
// unranked items (order === null) fall below, most-recently-updated first.
export function byOrder(a: Item, b: Item): number {
  const ao = a.order,
    bo = b.order;
  if (ao != null && bo != null) return ao - bo;
  if (ao != null) return -1;
  if (bo != null) return 1;
  return +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

// New sequential `order` values (0..n-1) for a lane, given the item ids in the
// desired top-to-bottom order. Returns a map id -> order.
export function laneOrder(orderedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  orderedIds.forEach((id, idx) => {
    out[id] = idx;
  });
  return out;
}

/* ---------------- ranking ---------------- */
// Rank is an additive score over the three judged axes. `item.votes` and
// `w.votes` are deliberately absent: voting was removed from Loop (docs/
// ai-native-process-alignment.md, objection 1 — a popularity number should not
// quietly drive the roadmap). Both fields are still stored, because Aha! owns
// the endorsement count and keeps syncing it in by delta, but a signal with no
// affordance to change it must not move the score — hiding the input while
// leaving `votes × w` in the formula would leave rank driven by a number nobody
// can see, which is worse than showing it.
export function computeRank(item: Item, w: Weights): number {
  const reach = item.reach || 0,
    confidence = item.confidence || 0,
    fit = item.strategicFit || 0;
  return +(
    reach * w.reach +
    confidence * w.confidence +
    fit * w.strategicFit
  ).toFixed(1);
}

/* ---------------- dates ---------------- */
export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  );
}

export function genId(): string {
  return "i" + Math.random().toString(36).slice(2, 9);
}

export function toISODate(d: string | number | Date): string {
  const x = new Date(d);
  return (
    x.getFullYear() +
    "-" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(x.getDate()).padStart(2, "0")
  );
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function snapToWeek(d: Date): Date {
  // Monday of the week containing d
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function isScheduled(item: Item): boolean {
  return !!(item.targetStart && item.targetEnd);
}

// A single date in the same short style as fmtRange's endpoints, for places
// that show one date rather than a span (the non-bet revisit date).
export function fmtDate(iso: string): string {
  const d = parseDate(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtRange(item: {
  targetStart: string | null;
  targetEnd: string | null;
}): string {
  if (!item.targetStart || !item.targetEnd) return "No dates";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = parseDate(item.targetStart),
    e = parseDate(item.targetEnd);
  const sYr = s.getFullYear() === e.getFullYear() ? "" : " " + s.getFullYear();
  return (
    s.toLocaleDateString("en-US", opts) +
    sYr +
    " – " +
    e.toLocaleDateString("en-US", opts) +
    " " +
    e.getFullYear()
  );
}

/* ---------------- dependencies ---------------- */
export function getItem(items: Item[], id: string): Item | undefined {
  return items.find((i) => i.id === id);
}

export function blockerSatisfied(dep: Item): boolean {
  return dep.killed || !!dep.shippedAt || dep.stage === "Releasing";
}

export function unmetDeps(item: Item, items: Item[]): Item[] {
  return (item.dependsOn || [])
    .map((id) => getItem(items, id))
    .filter((d): d is Item => !!d && !d.killed && !blockerSatisfied(d));
}

export function depConflicts(item: Item, items: Item[]): Item[] {
  // Dependencies whose target end lands after this item's target start.
  if (!isScheduled(item)) return [];
  return (item.dependsOn || [])
    .map((id) => getItem(items, id))
    .filter(
      (d): d is Item =>
        !!d &&
        !d.killed &&
        !blockerSatisfied(d) &&
        isScheduled(d) &&
        parseDate(d.targetEnd!) > parseDate(item.targetStart!),
    );
}

export function killedDeps(item: Item, items: Item[]): Item[] {
  return (item.dependsOn || [])
    .map((id) => getItem(items, id))
    .filter((d): d is Item => !!d && d.killed);
}

export function createsDepCycle(
  items: Item[],
  itemId: string,
  candidateDepId: string,
): boolean {
  // Would itemId -> candidateDepId create a cycle? True if itemId is reachable from candidateDepId.
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === itemId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const it = getItem(items, id);
    return (it?.dependsOn || []).some(walk);
  };
  return walk(candidateDepId);
}

/* ---------------- sub-items ---------------- */
export function subProgress(item: Item): { done: number; total: number } | null {
  const subs = item.subItems || [];
  if (!subs.length) return null;
  return { done: subs.filter((s) => s.done).length, total: subs.length };
}

export function subScheduled(sub: SubItem): boolean {
  return !!(sub.targetStart && sub.targetEnd);
}

export function subOutOfRange(item: Item, sub: SubItem): boolean {
  if (!isScheduled(item) || !subScheduled(sub)) return false;
  return (
    parseDate(sub.targetStart!) < parseDate(item.targetStart!) ||
    parseDate(sub.targetEnd!) > parseDate(item.targetEnd!)
  );
}

/* ---------------- fiscal calendar ----------------
   Campminder's fiscal year starts September 1. Q1 = Sep–Nov, Q2 = Dec–Feb,
   Q3 = Mar–May, Q4 = Jun–Aug. A fiscal year is named for the calendar year in
   which it ends, so Sep 2026 – Aug 2027 is FY27.

   This is the calendar the roadmap deck labels its columns with: "Q4 '26 /
   June, July, Aug", "Q1 '27 / Sept, Oct, Nov", "Q2 '27 / Dec, Jan, Feb",
   "Q3 '27 / Mar, April, May". Seed dates sit on these boundaries, so a roadmap
   chip and its timeline bar name the same quarter. */
export const FISCAL_START_MONTH = 8; // September, 0-indexed

// How many months into the fiscal year a date sits: 0 = September, 11 = August.
// The single expression every fiscal calculation and the seasonality curves in
// seasons.ts index by, so the fiscal calendar and the season config can never
// disagree about where September is.
export function fiscalMonthOffset(d: Date): number {
  return (d.getMonth() - FISCAL_START_MONTH + 12) % 12;
}

export function fiscalQuarter(d: Date): { year: number; quarter: number } {
  const m = d.getMonth();
  const offset = fiscalMonthOffset(d); // months into the fiscal year
  return {
    quarter: Math.floor(offset / 3) + 1, // 1..4
    // Fiscal year is named for the calendar year it ends in: Sep–Dec roll forward.
    year: m >= FISCAL_START_MONTH ? d.getFullYear() + 1 : d.getFullYear(),
  };
}

// Whether a date is the first month of a fiscal quarter — Sep, Dec, Mar, Jun.
// The timeline reads this to place its quarter cells and heavier grid lines, so
// a change to FISCAL_START_MONTH moves the labels and the boundaries together.
export function isFiscalQuarterStartMonth(d: Date): boolean {
  return fiscalMonthOffset(d) % 3 === 0;
}

// First day of the fiscal quarter after the one containing `d`.
export function nextFiscalQuarterStart(d: Date): Date {
  const monthsIn = (d.getMonth() - FISCAL_START_MONTH + 12) % 3;
  return new Date(d.getFullYear(), d.getMonth() - monthsIn + 3, 1);
}

// Monotonic index for ordering/diffing fiscal quarters across years.
export function fiscalQuarterIndex(d: Date): number {
  const { year, quarter } = fiscalQuarter(d);
  return year * 4 + (quarter - 1);
}

// Header label, e.g. "Q1 FY26".
export function fiscalQuarterLabel(d: Date): string {
  const { year, quarter } = fiscalQuarter(d);
  return `Q${quarter} FY${String(year).slice(-2)}`;
}

/* ---------------- seasons ----------------
   Campminder talks in seasons, not quarter numbers: Fall, Winter, Spring,
   Summer. Because the fiscal year starts in September the two line up exactly —
   Q1 = Sep–Nov = Fall, Q2 = Dec–Feb = Winter, Q3 = Mar–May = Spring,
   Q4 = Jun–Aug = Summer — so a season is just a fiscal quarter said out loud.

   The season is named for the calendar year it *starts* in, which is one behind
   the fiscal year for Fall and Winter: Fall '26 is Sep–Nov 2026, inside FY27.
   This matches the labels the seed pipeline already uses in 3_epics.csv
   ("FY27-Q1 Fall'26"), so a chip in the roadmap deck and a timeline column name
   the same three months. fiscalQuarterLabel is kept as-is alongside this: ADO
   iteration paths and the finance calendar speak FY, not seasons. */
export const SEASON_NAMES = ["Fall", "Winter", "Spring", "Summer"] as const;

export type SeasonName = (typeof SEASON_NAMES)[number];

export function fiscalSeason(d: Date): SeasonName {
  return SEASON_NAMES[fiscalQuarter(d).quarter - 1];
}

// Header label, e.g. "Fall '26".
export function fiscalSeasonLabel(d: Date): string {
  // The calendar year the season starts in — not fiscalQuarter().year, which is
  // the year the fiscal year *ends* in and would render Fall '26 as "Fall '27".
  return `${fiscalSeason(d)} '${String(seasonStartYear(d)).slice(-2)}`;
}

// The calendar year a date's season began in. Jan–Aug sit in a season that
// started the previous September (Winter) or in the same year (Spring, Summer);
// only Dec–Feb straddles a year boundary, and only its Jan/Feb half looks back.
export function seasonStartYear(d: Date): number {
  const m = d.getMonth();
  // Jan and Feb are the tail of a Winter that began the previous December.
  return m <= 1 ? d.getFullYear() - 1 : d.getFullYear();
}

/* ---------------- horizons ---------------- */
export function suggestedHorizon(item: Item): HorizonKey | null {
  if (!item.targetStart) return null;
  const dq =
    fiscalQuarterIndex(parseDate(item.targetStart)) -
    fiscalQuarterIndex(new Date());
  if (dq <= 0) return "now";
  if (dq === 1) return "next";
  return "later";
}

export function horizonMismatch(item: Item): HorizonKey | null {
  // Manual horizon with dates that clearly disagree.
  // "non-bet" is exempt: it is a deliberate override of whatever the dates
  // imply, so nagging that old dates "suggest Now" would be arguing with a
  // decision the user just made.
  const sug = suggestedHorizon(item);
  if (!sug || !item.horizon || item.killed || item.horizon === "non-bet")
    return null;
  if (sug !== item.horizon) return sug;
  return null;
}

/* ---------------- stats ---------------- */
export interface Stats {
  total: number;
  framedRate: number;
  learnRate: number;
  median: number | null;
  killRate: number;
  killedCount: number;
}

export function computeStats(items: Item[]): Stats {
  const active = items.filter((i) => !i.killed);
  const total = active.length;
  // Framing is Solutioning work, so the rate is measured over the lanes where
  // it should already have happened — Solutioning onward. Counting Intake and
  // Discovery would score items against a bar they are not meant to have
  // cleared yet, and the number would only ever say "most ideas are early".
  const shouldBeFramed = active.filter(
    (i) => STAGES.indexOf(i.stage) >= STAGES.indexOf("Solutioning"),
  );
  const framedGood = shouldBeFramed.filter(isFramed).length;
  const framedRate = shouldBeFramed.length
    ? Math.round((100 * framedGood) / shouldBeFramed.length)
    : 0;
  const released = active.filter((i) => i.shippedAt || i.stage === "Releasing");
  const withOutcome = released.filter(
    (i) => i.outcomeReading && i.outcomeReading.trim().length > 0,
  ).length;
  const learnRate = released.length
    ? Math.round((100 * withOutcome) / released.length)
    : 0;
  const decided = items.filter((i) => i.killed || i.committedAt);
  const days = decided
    .map((i) => {
      const end = i.killed ? i.killedAt : i.committedAt;
      return daysBetween(i.createdAt, end!);
    })
    .sort((a, b) => a - b);
  let median: number | null = null;
  if (days.length) {
    const mid = Math.floor(days.length / 2);
    median =
      days.length % 2
        ? days[mid]
        : Math.round((days[mid - 1] + days[mid]) / 2);
  }
  const killedCount = items.filter((i) => i.killed).length;
  // Share of every idea ever captured that got killed — a decisive loop
  // retires ideas rather than letting them drift.
  const killRate = items.length
    ? Math.round((100 * killedCount) / items.length)
    : 0;
  return {
    total,
    framedRate,
    learnRate,
    median,
    killRate,
    killedCount,
  };
}

/* ---------------- bets ---------------- */
// Backfills defaults on older/imported bet rows, mirroring migrateItems. Bets
// carry no teams or dates of their own — those are derived from the items linked
// to them — so any legacy `segments` blob is simply dropped.
//
// This function is a whitelist: a field not named here is silently discarded, so
// **every new Bet field must be added below** or it will work in memory and
// vanish on the next reload or import. That is the single easiest thing to get
// wrong when extending the type.
export function normalizeBets(list: Bet[]): Bet[] {
  return (Array.isArray(list) ? list : []).map((raw) => {
    const src = raw as Bet & { segments?: unknown };
    const str = (v: unknown, fallback = "") =>
      typeof v === "string" ? v : fallback;
    // Scores are 1–5; clamp rather than reject so a bad import lands in range
    // instead of poisoning the comparison table with an outlier.
    const score = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(5, Math.max(1, Math.round(v)))
        : fallback;
    const oneOf = <T extends string>(
      v: unknown,
      allowed: readonly T[],
      fallback: T,
    ): T => (allowed.includes(v as T) ? (v as T) : fallback);

    const value = (src.value ?? {}) as Partial<BetValue>;
    const evidence = (src.evidence ?? {}) as Partial<BetEvidence>;
    const decision = (src.decision ?? {}) as Partial<BetDecision>;
    const planned = (src.plannedShare ?? {}) as Partial<
      Record<PlannedHorizon, number>
    >;

    return {
      id: src.id,
      title: str(src.title),
      description: str(src.description),
      thesis: str(src.thesis),
      whyNow: str(src.whyNow),
      tier: oneOf(src.tier, BET_TIERS, "experiment"),
      theme: oneOf(src.theme, BET_THEMES, "grow"),
      goalArea: oneOf(src.goalArea, BET_GOAL_AREAS, "product-strategy"),
      sponsor: str(src.sponsor),
      owner: str(src.owner),
      status: oneOf(src.status, BET_STATUSES, "proposed"),
      horizon: HORIZONS.some((h) => h.key === src.horizon)
        ? src.horizon
        : null,
      confidence: score(src.confidence, 3),
      reversibility: score(src.reversibility, 3),
      value: {
        statement: str(value.statement),
        type: oneOf(value.type, BET_VALUE_TYPES, "new-revenue"),
        magnitude:
          typeof value.magnitude === "number" && Number.isFinite(value.magnitude)
            ? value.magnitude
            : null,
        // A basis is only meaningful alongside a magnitude, but it defaults to
        // "guess" rather than "modeled" so an unmarked number reads as
        // undefended — the conservative direction.
        basis: oneOf(value.basis, BET_VALUE_BASES, "guess"),
        timeToValue:
          typeof value.timeToValue === "number" &&
          Number.isFinite(value.timeToValue)
            ? value.timeToValue
            : null,
      },
      evidence: {
        strength: score(evidence.strength, 1),
        notes: str(evidence.notes),
        links: Array.isArray(evidence.links)
          ? evidence.links.filter((l): l is string => typeof l === "string")
          : [],
      },
      outcomes: Array.isArray(src.outcomes)
        ? src.outcomes.map((o) => normalizeKr(o))
        : [],
      jtbdIds: Array.isArray(src.jtbdIds)
        ? src.jtbdIds.filter((j): j is string => typeof j === "string")
        : [],
      plannedShare: Object.fromEntries(
        PLANNED_HORIZONS.map((h) => [
          h,
          typeof planned[h] === "number" && Number.isFinite(planned[h])
            ? Math.min(100, Math.max(0, planned[h]))
            : 0,
        ]),
      ) as Record<PlannedHorizon, number>,
      killCriteria: str(src.killCriteria),
      nextReview: typeof src.nextReview === "string" ? src.nextReview : null,
      decision: {
        // Null until the bet ends — unlike the other enums there is no sensible
        // default verdict, and inventing one would corrupt the tally.
        verdict: BET_VERDICTS.includes(decision.verdict as BetVerdict)
          ? (decision.verdict as BetVerdict)
          : null,
        rationale: str(decision.rationale),
        decidedAt:
          typeof decision.decidedAt === "string" ? decision.decidedAt : null,
      },
      color: str(src.color) || BET_COLORS[0],
      activity: Array.isArray(src.activity)
        ? src.activity.filter((a): a is string => typeof a === "string")
        : [],
      createdAt: src.createdAt,
      updatedAt: src.updatedAt,
    };
  });
}

// What an anonymous share-link reader is allowed to receive.
//
// A share link is a forwardable bearer URL and the RSC payload is readable by
// anyone who opens devtools, so this strips rather than hides: killed ideas and
// parked Intake work disappear entirely, and the survivors lose their kill
// reason and their activity log.
//
// Pure and here, rather than inline in `getPublicState`, because it is a
// privacy boundary and privacy boundaries need tests. It has already failed
// once: `Bet.activity` was added and the item-shaped strip below did not grow
// to cover it, so an internal audit log shipped to anonymous readers while the
// surrounding comment claimed it was removed. **Any new field holding internal
// notes must be added here**, and the round-trip test is what makes that
// failure loud instead of silent.
export function trimForShare(state: {
  items: Item[];
  bets: Bet[];
}): { items: Item[]; bets: Bet[] } {
  return {
    items: state.items
      .filter((it) => !it.killed && !isIntake(it))
      .map((it) => ({ ...it, killedReason: "", activity: [] })),
    bets: state.bets.map((b) => ({ ...b, activity: [] })),
  };
}

// The domain an item belongs to, resolved most-specific-first: its module (the
// durable anchor, via module → JTBD → domain), else its team's default mapping,
// else the catch-all "unclaimed" domain. Never returns null, so every item
// always lands in a domain band — a renamed/removed team or an unmapped module
// surfaces under "Unclaimed" instead of vanishing.
export function resolveDomain(item: Item): string {
  return (
    moduleDomainId(item.moduleId) ??
    TEAM_DOMAIN[item.mission] ??
    UNCLAIMED_DOMAIN_ID
  );
}

// Every item linked to a bet — what the bet *reaches*, funded or merely enabled.
export function betItems(bet: Bet, items: Item[]): Item[] {
  return items.filter((i) => (i.betIds || []).includes(bet.id));
}

// Only the items this bet pays for. The distinction matters as soon as capacity
// is attached: an item on three bets would otherwise be counted three times and
// inflate the portfolio's apparent investment threefold.
export function betFundedItems(bet: Bet, items: Item[]): Item[] {
  return items.filter((i) => i.fundedBetId === bet.id);
}

// Items a bet leans on but does not pay for — the shared platform work another
// bet is funding. Reading these is how "three bets rest on this epic" becomes
// visible rather than being silently averaged away.
export function betEnabledItems(bet: Bet, items: Item[]): Item[] {
  return betItems(bet, items).filter((i) => i.fundedBetId !== bet.id);
}

// The distinct teams a bet touches, derived from its linked items and ordered by
// MISSIONS so the list reads consistently.
export function betTeams(bet: Bet, items: Item[]): string[] {
  const set = new Set(betItems(bet, items).map((i) => i.mission));
  const ordered: string[] = MISSIONS.filter((m) => set.has(m));
  const extras = [...set].filter((m) => !ordered.includes(m));
  return [...ordered, ...extras];
}

// The rolled-up span of a bet: earliest start → latest end across its scheduled
// linked items. Null when none of its items are on the timeline yet.
export function betEnvelope(
  bet: Bet,
  items: Item[],
): { start: Date; end: Date } | null {
  const scheduled = betItems(bet, items).filter(isScheduled);
  if (!scheduled.length) return null;
  let start = parseDate(scheduled[0].targetStart!);
  let end = parseDate(scheduled[0].targetEnd!);
  for (const it of scheduled) {
    const a = parseDate(it.targetStart!);
    const b = parseDate(it.targetEnd!);
    if (a < start) start = a;
    if (b > end) end = b;
  }
  return { start, end };
}

// Progress across the bet's linked items (mirrors subProgress' shape): `done`
// counts items that have reached customers (the Releasing band).
//
// Parked work is excluded from the denominator, like every other bet roll-up: an
// idea nobody has started is not progress waiting to happen, and counting it
// would make an internal reader and a share-link reader — who cannot see Intake
// at all — disagree about the same bet's fraction.
export function betProgress(
  bet: Bet,
  items: Item[],
): { done: number; total: number } | null {
  const linked = betItems(bet, items).filter((i) => !isIntake(i));
  if (!linked.length) return null;
  return {
    done: linked.filter((i) => i.stage === "Releasing").length,
    total: linked.length,
  };
}

/* ---------------- bet investment ----------------
   Capacity is measured in *epic-quarters*: an item's scheduled duration in
   fiscal quarters. This weights a three-quarter epic above a one-quarter one,
   which a plain epic count cannot. */

// How many fiscal quarters an item spans, inclusive. 0 when it is not scheduled.
// A span is counted by the quarters it touches, not by elapsed days, so an epic
// running 2027-12-01 → 2028-02-29 is one quarter (Q2 FY28), not three months
// straddling a year boundary.
//
// Also 0 for anything still in Intake, even when it carries dates — and this one
// line is what keeps every share below honest. Capacity means work we intend to
// do; a parked idea with a speculative date on it is not that, and letting it
// into the denominator would deflate every bet's share against a roadmap nobody
// has agreed to. Same reasoning that excludes killed items.
export function itemQuarters(item: Item): number {
  if (isIntake(item)) return 0;
  if (!isScheduled(item)) return 0;
  const a = fiscalQuarterIndex(parseDate(item.targetStart!));
  const b = fiscalQuarterIndex(parseDate(item.targetEnd!));
  return Math.max(0, b - a) + 1;
}

// The denominator for every share below: all scheduled epic-quarters on the
// roadmap, bet-funded and not.
//
// **This is deliberately the whole roadmap, not the sum of the bets.** Dividing
// by the bets alone inverts the headline number — a portfolio with one linked
// bet would read 100% rather than its true single-digit share — and it destroys
// the run-the-business remainder, which is the figure that shows what strategic
// work is actually competing against. Killed items are excluded: they are not
// consuming capacity.
export function totalEpicQuarters(items: Item[]): number {
  return items.reduce((sum, i) => (i.killed ? sum : sum + itemQuarters(i)), 0);
}

// A percentage of the whole-roadmap denominator, rounded to one decimal.
// Returns 0 rather than dividing by zero on an empty roadmap.
function shareOf(quarters: number, total: number): number {
  return total > 0 ? +((100 * quarters) / total).toFixed(1) : 0;
}

// The items whose cost is counted: alive, and out of Intake. This is the same
// rule that makes `itemQuarters` return 0 for a parked idea, applied where the
// epic *count* is reported — otherwise the two halves of a share contradict each
// other, and "8 epics · 6 epic-quarters" leaves the reader working out which
// number to believe.
function costedItems(items: Item[]): Item[] {
  return items.filter((i) => !i.killed && !isIntake(i));
}

// What a bet costs: epic-quarters it funds, as a share of the whole roadmap.
// Funded shares across all bets sum to at most 100, with run-the-business making
// up the difference. This is the only number ever compared against
// `plannedShare`.
export function betFundedShare(
  bet: Bet,
  items: Item[],
): { quarters: number; epics: number; share: number } {
  const funded = costedItems(betFundedItems(bet, items));
  const quarters = funded.reduce((s, i) => s + itemQuarters(i), 0);
  return {
    quarters,
    epics: funded.length,
    share: shareOf(quarters, totalEpicQuarters(items)),
  };
}

// What a bet leans on: every linked item including work another bet funds. Can
// exceed the funded share, and is labelled separately so the two are never
// blended into one misleading figure.
export function betReach(
  bet: Bet,
  items: Item[],
): { quarters: number; epics: number; share: number } {
  const linked = costedItems(betItems(bet, items));
  const quarters = linked.reduce((s, i) => s + itemQuarters(i), 0);
  return {
    quarters,
    epics: linked.length,
    share: shareOf(quarters, totalEpicQuarters(items)),
  };
}

// The share of the roadmap no bet is funding. Not a data-quality gap to be
// cleaned up — it is the baseline load that strategic bets compete against, and
// the portfolio view names it "run-the-business" rather than "unassigned".
export function runTheBusinessShare(items: Item[]): {
  quarters: number;
  epics: number;
  share: number;
} {
  const unfunded = costedItems(items).filter((i) => !i.fundedBetId);
  const quarters = unfunded.reduce((s, i) => s + itemQuarters(i), 0);
  return {
    quarters,
    epics: unfunded.length,
    share: shareOf(quarters, totalEpicQuarters(items)),
  };
}

// What share of a given team's scheduled work each bet consumes. This is the
// over-allocation view at the resolution where the trade-off actually bites —
// a team can be fully booked while the portfolio looks balanced.
export function betTeamShares(
  bet: Bet,
  items: Item[],
): { team: string; quarters: number; share: number }[] {
  const funded = costedItems(betFundedItems(bet, items));
  return betTeams(bet, items)
    .map((team) => {
      const teamTotal = costedItems(items)
        .filter((i) => i.mission === team)
        .reduce((s, i) => s + itemQuarters(i), 0);
      const quarters = funded
        .filter((i) => i.mission === team)
        .reduce((s, i) => s + itemQuarters(i), 0);
      return { team, quarters, share: shareOf(quarters, teamTotal) };
    })
    .filter((t) => t.quarters > 0);
}

/* ---------------- bet scope reconciliation ----------------
   A bet declares the JTBDs it intends to reshape; its epics independently roll
   up to JTBDs through their module. Comparing the two is the point: it is what
   turns a bet from a label into something the roadmap can be held against. */

export interface BetJtbdScope {
  jtbdId: string;
  declared: boolean;
  items: Item[];
}

// Declared JTBDs and actual ones, merged. Declared-first so the bet's own
// statement of intent leads, with undeclared spend appended after it.
export function betJtbdScope(bet: Bet, items: Item[]): BetJtbdScope[] {
  const linked = betItems(bet, items);
  const byJtbd = new Map<string, Item[]>();
  for (const item of linked) {
    const jtbd = moduleJtbd(item.moduleId);
    if (!jtbd) continue;
    byJtbd.set(jtbd.id, [...(byJtbd.get(jtbd.id) ?? []), item]);
  }
  const declared = (bet.jtbdIds || []).map((jtbdId) => ({
    jtbdId,
    declared: true,
    items: byJtbd.get(jtbdId) ?? [],
  }));
  const undeclared = [...byJtbd.keys()]
    .filter((jtbdId) => !(bet.jtbdIds || []).includes(jtbdId))
    .map((jtbdId) => ({ jtbdId, declared: false, items: byJtbd.get(jtbdId)! }));
  return [...declared, ...undeclared];
}

// JTBDs the bet claims but has staffed nothing in — "we say we're betting here
// and we've put no work behind it."
export function betUnstaffedClaims(bet: Bet, items: Item[]): string[] {
  return betJtbdScope(bet, items)
    .filter((s) => s.declared && s.items.length === 0)
    .map((s) => s.jtbdId);
}

// JTBDs the bet's work actually lands in but never declared — scope drift, or a
// declaration that went stale.
export function betUndeclaredSpend(bet: Bet, items: Item[]): string[] {
  return betJtbdScope(bet, items)
    .filter((s) => !s.declared)
    .map((s) => s.jtbdId);
}

// Items several bets depend on. Concentration risk that is invisible today: if
// this work slips, every one of those bets slips with it. Sometimes it also
// means the epic is too big and wants splitting — a human call, never automatic.
export function sharedPlatformItems(items: Item[], minBets = 3): Item[] {
  return items.filter((i) => !i.killed && (i.betIds || []).length >= minBets);
}

// The modernize / new-value / both mix across a bet's funded work. A
// "foundational" bet made entirely of modernization is a modernization
// programme, and should be legible as one.
export function betTypeMix(
  bet: Bet,
  items: Item[],
): Record<"modernize" | "new-value" | "both" | "unclassified", number> {
  const mix = { modernize: 0, "new-value": 0, both: 0, unclassified: 0 };
  for (const i of betFundedItems(bet, items)) {
    if (i.type === "modernize") mix.modernize += 1;
    else if (i.type === "new-value") mix["new-value"] += 1;
    else if (i.type === "both") mix.both += 1;
    else mix.unclassified += 1;
  }
  return mix;
}

/* ---------------- bet portfolio ---------------- */

// Bets that take part in the allocation math: foundational and still running.
// Experiments are deliberately excluded — with ~20 bets every share rounds to 5%
// and the allocation bar stops telling anyone anything.
export function allocatingBets(bets: Bet[]): Bet[] {
  return bets.filter(
    (b) => b.tier === "foundational" && !BET_TERMINAL_STATUSES.includes(b.status),
  );
}

// Total intended capacity claimed for a horizon. Over 100 means the portfolio is
// promising more than it has — surfaced as a warning, never blocked, since the
// point is to make the over-commitment visible rather than to prevent someone
// recording what they intend.
export function plannedShareTotal(bets: Bet[], horizon: PlannedHorizon): number {
  return allocatingBets(bets).reduce(
    (sum, b) => sum + (b.plannedShare?.[horizon] ?? 0),
    0,
  );
}

// Bets concluded or killed within the last `months`. The Rhythm of Business
// wants at least one losing bet every 6–8 months: a portfolio where nothing has
// ever been killed is not a portfolio of bets.
export function recentlyKilledBets(bets: Bet[], months = 8, now = new Date()): Bet[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return bets.filter((b) => {
    const at = b.decision?.decidedAt;
    if (!at) return false;
    const verdict = b.decision?.verdict;
    if (verdict !== "lost" && verdict !== "killed-early") return false;
    return new Date(at) >= cutoff;
  });
}

/* ---------------- milestones ---------------- */
// Backfills defaults on older/imported milestone rows, mirroring normalizeBets.
export function normalizeMilestones(list: Milestone[]): Milestone[] {
  return (Array.isArray(list) ? list : []).map((raw) => {
    const m: Milestone = { ...(raw as Milestone) };
    if (typeof m.title !== "string") m.title = "";
    if (typeof m.description !== "string") m.description = "";
    if (typeof m.color !== "string" || !m.color) m.color = "#7A5AF8";
    if (typeof m.date !== "string") m.date = "";
    return m;
  });
}

/* ---------------- scenario diffing ---------------- */
// The item fields whose change carries roadmap meaning in a compare view. Kept
// deliberately short so the diff reads as "what actually moved," not every
// incidental field (activity log, updatedAt, etc.).
const DIFF_ITEM_FIELDS: (keyof Item)[] = [
  "title",
  "mission",
  "owner",
  "type",
  "stage",
  "horizon",
  "order",
  "targetStart",
  "targetEnd",
  "killed",
  "reach",
  "confidence",
  "strategicFit",
  // Which bet pays for this item is an allocation decision, so moving it has to
  // show up in a scenario compare — it is exactly the kind of change someone
  // forks a scenario to try out.
  "fundedBetId",
];

function sameIdSet(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function itemFieldChanges(live: Item, draft: Item): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of DIFF_ITEM_FIELDS) {
    if (live[f] !== draft[f])
      out.push({ field: f, before: live[f], after: draft[f] });
  }
  // KR — the measurable fields that describe the bet's target.
  (["metric", "baseline", "target"] as const).forEach((k) => {
    if (live.kr?.[k] !== draft.kr?.[k])
      out.push({ field: `kr.${k}`, before: live.kr?.[k], after: draft.kr?.[k] });
  });
  if (!sameIdSet(live.dependsOn, draft.dependsOn))
    out.push({ field: "dependsOn", before: live.dependsOn, after: draft.dependsOn });
  if (!sameIdSet(live.betIds, draft.betIds))
    out.push({
      field: "betIds",
      before: live.betIds,
      after: draft.betIds,
    });
  return out;
}

// The bet fields whose change carries roadmap meaning in a compare view. Like
// DIFF_ITEM_FIELDS this is a whitelist, so **a new Bet field must be added here**
// or a scenario compare will silently miss it — and `plannedShare` in particular
// is the whole point of forking a scenario, so missing it would quietly break
// the allocation trade-off.
//
// `activity` is the one field deliberately left off. It grows on every mutation,
// so including it would mark every touched bet as changed and bury the fields
// above in a diff that is technically complete and practically unreadable.
const DIFF_BET_FIELDS: (keyof Bet)[] = [
  "title",
  "description",
  "thesis",
  "whyNow",
  "tier",
  "theme",
  "goalArea",
  "sponsor",
  "owner",
  "status",
  "horizon",
  "confidence",
  "reversibility",
  "killCriteria",
  "nextReview",
  "color",
];

// The activity entries a save should append, given what actually changed. Only
// the moves a reader would want narrated later — a bet becoming active, its
// intended share moving, a verdict landing — not every keystroke on the thesis.
//
// Lives here rather than in the modal so it can be tested without a form, and
// so any future caller (an import, a scripted migration) logs the same way.
export function betChangeLog(
  live: Bet,
  draft: Bet,
  linkDelta: { added: number; removed: number } = { added: 0, removed: 0 },
): string[] {
  const out: string[] = [];
  if (live.status !== draft.status)
    out.push(
      `Status ${BET_STATUS_LABELS[live.status]} → ${BET_STATUS_LABELS[draft.status]}.`,
    );
  if (live.tier !== draft.tier)
    out.push(`Tier ${BET_TIER_LABELS[live.tier]} → ${BET_TIER_LABELS[draft.tier]}.`);
  for (const h of PLANNED_HORIZONS) {
    const a = live.plannedShare?.[h] ?? 0;
    const b = draft.plannedShare?.[h] ?? 0;
    if (a !== b) out.push(`Planned share (${h}) ${a}% → ${b}%.`);
  }
  if (live.decision?.verdict !== draft.decision?.verdict && draft.decision?.verdict)
    out.push(`Verdict recorded: ${BET_VERDICT_LABELS[draft.decision.verdict]}.`);
  // A thesis or kill criteria arriving is worth noting; its later wording is not.
  if (!live.thesis?.trim() && draft.thesis?.trim()) out.push("Thesis written.");
  if (!live.killCriteria?.trim() && draft.killCriteria?.trim())
    out.push("Kill criteria written.");
  if (!live.nextReview && draft.nextReview)
    out.push(`Next review set for ${draft.nextReview}.`);
  if (linkDelta.added)
    out.push(`${linkDelta.added} epic${linkDelta.added === 1 ? "" : "s"} linked.`);
  if (linkDelta.removed)
    out.push(
      `${linkDelta.removed} epic${linkDelta.removed === 1 ? "" : "s"} unlinked.`,
    );
  return out;
}

function betFieldChanges(live: Bet, draft: Bet): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of DIFF_BET_FIELDS) {
    if (live[f] !== draft[f])
      out.push({ field: f, before: live[f], after: draft[f] });
  }
  // Nested shapes, compared field by field so the diff reads as "magnitude went
  // up" rather than as one opaque object swap.
  (["statement", "type", "magnitude", "basis", "timeToValue"] as const).forEach(
    (k) => {
      if (live.value?.[k] !== draft.value?.[k])
        out.push({
          field: `value.${k}`,
          before: live.value?.[k],
          after: draft.value?.[k],
        });
    },
  );
  (["verdict", "rationale", "decidedAt"] as const).forEach((k) => {
    if (live.decision?.[k] !== draft.decision?.[k])
      out.push({
        field: `decision.${k}`,
        before: live.decision?.[k],
        after: draft.decision?.[k],
      });
  });
  if (live.evidence?.strength !== draft.evidence?.strength)
    out.push({
      field: "evidence.strength",
      before: live.evidence?.strength,
      after: draft.evidence?.strength,
    });
  // The allocation itself — the change a scenario most often exists to try.
  PLANNED_HORIZONS.forEach((h) => {
    if (live.plannedShare?.[h] !== draft.plannedShare?.[h])
      out.push({
        field: `plannedShare.${h}`,
        before: live.plannedShare?.[h],
        after: draft.plannedShare?.[h],
      });
  });
  if (!sameIdSet(live.jtbdIds, draft.jtbdIds))
    out.push({ field: "jtbdIds", before: live.jtbdIds, after: draft.jtbdIds });
  return out;
}

// Diff the live roadmap against a scenario draft. Items/bets/milestones
// are matched by id (a fork preserves ids, so entities line up); `weights` lists
// changed ranking weights. A per-item "rank" change is appended when the
// computed business-value rank differs (using each side's own weights), so the
// compare view can surface "moved up/down in priority" even when the underlying
// score fields are what changed.
export function diffStates(live: LoopState, draft: LoopState): StateDiff {
  const liveItems = new Map(live.items.map((i) => [i.id, i]));
  const draftItems = new Map(draft.items.map((i) => [i.id, i]));
  const itemsChanged: EntityChange[] = [];
  for (const d of draft.items) {
    const l = liveItems.get(d.id);
    if (!l) continue;
    const changes = itemFieldChanges(l, d);
    const lr = computeRank(l, live.weights);
    const dr = computeRank(d, draft.weights);
    if (lr !== dr) changes.push({ field: "rank", before: lr, after: dr });
    if (changes.length) itemsChanged.push({ id: d.id, title: d.title, changes });
  }

  const liveBets = new Map(live.bets.map((b) => [b.id, b]));
  const draftBets = new Map(draft.bets.map((b) => [b.id, b]));
  const betsChanged: EntityChange[] = [];
  for (const d of draft.bets) {
    const l = liveBets.get(d.id);
    if (!l) continue;
    const changes = betFieldChanges(l, d);
    if (changes.length) betsChanged.push({ id: d.id, title: d.title, changes });
  }

  const liveMs = new Map(live.milestones.map((m) => [m.id, m]));
  const draftMs = new Map(draft.milestones.map((m) => [m.id, m]));
  const milestonesChanged: EntityChange[] = [];
  for (const d of draft.milestones) {
    const l = liveMs.get(d.id);
    if (!l) continue;
    const changes = (["title", "date", "description", "color"] as const)
      .filter((f) => l[f] !== d[f])
      .map((f) => ({ field: f, before: l[f], after: d[f] }));
    if (changes.length)
      milestonesChanged.push({ id: d.id, title: d.title, changes });
  }

  const weights = (["reach", "confidence", "strategicFit"] as const)
    .filter((k) => live.weights[k] !== draft.weights[k])
    .map((k) => ({ field: k, before: live.weights[k], after: draft.weights[k] }));

  return {
    itemsAdded: draft.items.filter((i) => !liveItems.has(i.id)),
    itemsRemoved: live.items.filter((i) => !draftItems.has(i.id)),
    itemsChanged,
    betsAdded: draft.bets.filter((b) => !liveBets.has(b.id)),
    betsRemoved: live.bets.filter((b) => !draftBets.has(b.id)),
    betsChanged,
    milestonesAdded: draft.milestones.filter((m) => !liveMs.has(m.id)),
    milestonesRemoved: live.milestones.filter((m) => !draftMs.has(m.id)),
    milestonesChanged,
    weights,
  };
}

// Total number of differences in a diff — 0 means the draft matches live.
export function diffCount(d: StateDiff): number {
  return (
    d.itemsAdded.length +
    d.itemsRemoved.length +
    d.itemsChanged.length +
    d.betsAdded.length +
    d.betsRemoved.length +
    d.betsChanged.length +
    d.milestonesAdded.length +
    d.milestonesRemoved.length +
    d.milestonesChanged.length +
    d.weights.length
  );
}

/* ---------------- milestone flag stacking ---------------- */

// Gap left between two flags sharing a row. Small enough that flags only stack
// when they'd genuinely collide, big enough that two neighbours read as two.
export const FLAG_GAP = 6;

/**
 * Assign each milestone flag a row, so flags that would overlap stack instead of
 * hiding each other.
 *
 * A flag is a pill of text pinned at a date, and dates cluster — three
 * milestones in the same fortnight drew three pills on top of each other, with
 * whichever rendered last winning and the rest simply gone. Greedy first-fit by
 * date: each flag takes the topmost row where it clears what's already there, so
 * a timeline with no collisions still draws a single row.
 *
 * Widths are the caller's estimate from the label rather than a measurement —
 * measuring means a layout pass per flag per zoom, and an estimate a few px out
 * only ever costs one unnecessary row.
 */
export function stackMilestoneFlags(
  flags: readonly { id: string; left: number; width: number }[],
): Map<string, number> {
  const rowEnds: number[] = []; // rightmost px used so far, per row
  const rows = new Map<string, number>();
  for (const f of [...flags].sort((a, b) => a.left - b.left)) {
    let row = rowEnds.findIndex((end) => end + FLAG_GAP <= f.left);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rowEnds[row] = f.left + f.width;
    rows.set(f.id, row);
  }
  return rows;
}

/* ---------------- timeline range ---------------- */
export function timelineRange(
  items: Item[],
  milestones: Milestone[] = [],
): { start: Date; end: Date } {
  let min = new Date(),
    max = new Date(Date.now() + 300 * DAY);
  const stretch = (s: Date, e: Date) => {
    if (s < min) min = s;
    if (e > max) max = e;
  };
  items
    .filter(isScheduled)
    .forEach((i) => stretch(parseDate(i.targetStart!), parseDate(i.targetEnd!)));
  // Bets carry no dates of their own — their span comes from these same
  // items — so nothing extra to fold in for them.
  // Fold in milestone dates so a marker outside the item span still fits.
  milestones.forEach((m) => {
    if (m.date) {
      const d = parseDate(m.date);
      stretch(d, d);
    }
  });
  return {
    start: new Date(min.getFullYear(), min.getMonth() - 1, 1),
    end: new Date(max.getFullYear(), max.getMonth() + 2, 1),
  };
}
