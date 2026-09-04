import {
  BET_GOAL_AREA_LABELS,
  BET_STATUS_LABELS,
  BET_TIER_LABELS,
  BET_VALUE_BASIS_LABELS,
  BET_VALUE_TYPE_LABELS,
  HORIZONS,
} from "@/lib/loop/constants";
import type { Bet, Item } from "@/lib/loop/types";

// Trims an Item down to the non-sensitive, pre-rendered shape the `summary`
// AI feature's schema expects (see lib/ai/features/summary.ts) — shared by
// every summary call site so "what does the model get to see" stays defined
// in one place rather than reimplemented per button.

function krReading(it: Item): string {
  const k = it.kr;
  if (!k?.metric) return "";
  const bits: string[] = [];
  if (k.baseline != null && k.target != null)
    bits.push(`${k.baseline} → ${k.target}${k.unit ? " " + k.unit : ""}`);
  else if (k.target != null) bits.push(`target ${k.target}${k.unit ? " " + k.unit : ""}`);
  if (k.current != null) bits.push(`now ${k.current}`);
  return `${k.metric}${bits.length ? ": " + bits.join(", ") : ""}`;
}

function windowOf(it: Item): string {
  if (it.targetStart && it.targetEnd) return `${it.targetStart} → ${it.targetEnd}`;
  if (it.targetStart) return `from ${it.targetStart}`;
  return "";
}

export interface SummaryItemSnapshot {
  title: string;
  mission: string;
  stage: string;
  horizon: string | null;
  problem: string; // problemStatement — the "for whom, why" this item exists
  description: string;
  kr: string;
  window: string;
}

export function trimItemForSummary(it: Item): SummaryItemSnapshot {
  return {
    title: it.title,
    mission: it.mission,
    stage: it.stage,
    horizon: it.horizon,
    // Legacy items predate these fields and migrateItems doesn't backfill
    // them (see isFramed's guard in logic.ts), so they can be undefined at
    // runtime despite Item's type — default like the other fields here.
    problem: it.problemStatement ?? "",
    description: it.description ?? "",
    kr: krReading(it),
    window: windowOf(it),
  };
}

// Same trimming for the `theme-summary` feature (lib/ai/features/theme-summary.ts),
// which operates on Bets rather than Items.

function betValueReading(bet: Bet): string {
  const { magnitude, type, basis } = bet.value;
  if (magnitude == null) return "";
  const money =
    magnitude >= 1_000_000
      ? `$${(magnitude / 1_000_000).toFixed(1)}M`
      : magnitude >= 1_000
        ? `$${Math.round(magnitude / 1_000)}k`
        : `$${magnitude}`;
  return `${money} in ${BET_VALUE_TYPE_LABELS[type].toLowerCase()} (${BET_VALUE_BASIS_LABELS[basis].toLowerCase()})`;
}

export interface ThemeBetSnapshot {
  title: string;
  thesis: string;
  tier: string;
  goalArea: string;
  status: string;
  horizon: string | null;
  value: string;
}

export function trimBetForThemeSummary(bet: Bet): ThemeBetSnapshot {
  return {
    title: bet.title,
    thesis: bet.thesis,
    tier: BET_TIER_LABELS[bet.tier],
    goalArea: BET_GOAL_AREA_LABELS[bet.goalArea],
    status: BET_STATUS_LABELS[bet.status],
    horizon: bet.horizon
      ? (HORIZONS.find((h) => h.key === bet.horizon)?.label ?? bet.horizon)
      : null,
    value: betValueReading(bet),
  };
}
