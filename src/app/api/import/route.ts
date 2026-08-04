import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { replaceAll } from "@/lib/loop/store";
import {
  migrateItems,
  normalizeBets,
  normalizeMilestones,
} from "@/lib/loop/logic";
import type { Bet, Item, Milestone, Weights } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// POST /api/import — replace the entire dataset from an uploaded loop-v2 JSON.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = (await req.json()) as {
    items?: Item[];
    weights?: Weights;
    bets?: Bet[];
    // Bets were exported under `initiatives` before the strategic-bets rename.
    initiatives?: Bet[];
    milestones?: Milestone[];
  };
  if (!parsed.items || !Array.isArray(parsed.items)) {
    return NextResponse.json({ error: "Missing items array" }, { status: 400 });
  }
  const items = migrateItems(parsed.items);
  // Accept either key. Every export produced before the rename carries
  // `initiatives`, and reading only `bets` would treat such a file as "carries
  // no bets" — silently leaving the existing ones in place when the whole point
  // of the import was to replace them. `normalizeBets` fills the new fields, so
  // an old row lands as a valid, if sparse, bet.
  const rawBets = Array.isArray(parsed.bets)
    ? parsed.bets
    : Array.isArray(parsed.initiatives)
      ? parsed.initiatives
      : undefined;
  // Still undefined when the file carries neither, so a loop-v2 export that
  // predates the feature entirely doesn't wipe what's already there.
  const bets = rawBets ? normalizeBets(rawBets) : undefined;
  // Same guard for milestones so legacy exports don't wipe them.
  const milestones = Array.isArray(parsed.milestones)
    ? normalizeMilestones(parsed.milestones)
    : undefined;
  await replaceAll(items, parsed.weights, bets, milestones);
  return NextResponse.json({ ok: true, count: items.length });
}
