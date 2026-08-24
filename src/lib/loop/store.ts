import "server-only";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "../db";
import {
  bets as betsTable,
  items as itemsTable,
  milestones as milestonesTable,
  outlooks as outlooksTable,
  scenarios as scenariosTable,
  settings as settingsTable,
} from "../schema";
import {
  SEED_WEIGHTS,
  seedBets,
  seedItems,
  seedMilestones,
  seedOutlooks,
} from "./seed";
import {
  migrateItems,
  normalizeBets,
  normalizeMilestones,
  normalizeOutlooks,
  trimForShare,
} from "./logic";
import type {
  Bet,
  DeliveryOutlook,
  Item,
  LoopState,
  Milestone,
  Scenario,
  ScenarioMeta,
  Weights,
} from "./types";

const SETTINGS_ID = "global";

// A table that hasn't been created yet (schema pushed via `npm run db:push`, out
// of band from deploys). Postgres reports this as 42P01 (undefined_table). We
// swallow *only* this specific error for newer tables so shipping schema-
// dependent code before the schema is pushed degrades gracefully (feature just
// doesn't show) instead of crashing the whole server render. Every other DB
// error still propagates.
//
// Drizzle wraps the driver error in its own `DrizzleQueryError`, which carries
// the underlying pg error (with `.code`) as `.cause` rather than on itself —
// checking only the outer error's `.code`/`.message` never matched, so this
// went uncaught in production the moment a real "table not migrated yet" case
// hit it: the outlooks table missing crashed every page load instead of
// degrading gracefully. Walking `.cause` is what actually reaches the pg error.
function isMissingRelation(err: unknown): boolean {
  let cur = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    const e = cur as { code?: string; message?: string; cause?: unknown };
    if (
      e.code === "42P01" ||
      /relation ".*" does not exist/i.test(e.message ?? "")
    ) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

// Seeds the two-year modernization roadmap + default weights the first time the
// app runs against an empty database. Idempotent.
export async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ id: itemsTable.id }).from(itemsTable).limit(1);
  if (existing.length > 0) return;

  const seeded = seedItems();
  if (seeded.length) {
    await db.insert(itemsTable).values(
      seeded.map((it) => ({
        id: it.id,
        data: it,
        updatedAt: new Date(it.updatedAt),
        createdAt: new Date(it.createdAt),
      })),
    );
  }
  const seededInits = seedBets();
  if (seededInits.length) {
    await db
      .insert(betsTable)
      .values(
        seededInits.map((it) => ({
          id: it.id,
          data: it,
          updatedAt: new Date(it.updatedAt),
          createdAt: new Date(it.createdAt),
        })),
      )
      .onConflictDoNothing();
  }
  const seededMs = seedMilestones();
  if (seededMs.length) {
    try {
      await db
        .insert(milestonesTable)
        .values(
          seededMs.map((it) => ({
            id: it.id,
            data: it,
            updatedAt: new Date(it.updatedAt),
            createdAt: new Date(it.createdAt),
          })),
        )
        .onConflictDoNothing();
    } catch (err) {
      // The milestones table may not exist on older databases (see
      // getAllMilestones). Seeding is best-effort — skip rather than fail the
      // whole first-run seed if the migration hasn't been applied yet.
      if (isMissingRelation(err)) {
        console.warn(
          "milestones table not found — run `npm run db:push` to seed milestones.",
        );
      } else {
        throw err;
      }
    }
  }
  const seededOutlooks = seedOutlooks();
  if (seededOutlooks.length) {
    try {
      await db
        .insert(outlooksTable)
        .values(
          seededOutlooks.map((o) => ({
            id: o.id,
            data: o,
            updatedAt: new Date(o.updatedAt),
          })),
        )
        .onConflictDoNothing();
    } catch (err) {
      // The outlooks table may not exist on older databases (see
      // getAllOutlooks). Seeding is best-effort, same as milestones above.
      if (isMissingRelation(err)) {
        console.warn(
          "outlooks table not found — run `npm run db:push` to seed outlooks.",
        );
      } else {
        throw err;
      }
    }
  }
  await db
    .insert(settingsTable)
    .values({ id: SETTINGS_ID, weights: SEED_WEIGHTS })
    .onConflictDoNothing();
}

export async function getWeights(): Promise<Weights> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, SETTINGS_ID))
    .limit(1);
  return rows[0]?.weights ?? SEED_WEIGHTS;
}

export async function getAllItems(): Promise<Item[]> {
  const rows = await db.select().from(itemsTable);
  // Migrate on read so the initial server render matches the client: legacy
  // stages (e.g. the retired "Prioritize") are remapped and defaults backfilled
  // even for rows written before the current model.
  return migrateItems(rows.map((r) => r.data));
}

// Shared by every newer table (bets, milestones, outlooks): each is one JSON
// blob per row, so reading it all back is "select, unwrap `.data`, normalize"
// plus the same missing-relation fallback. `query` stays a thunk (rather than
// taking the table itself) so this has no drizzle table typing to get right —
// it just needs whatever the caller's `db.select().from(...)` returns.
async function getAllRows<T>(
  query: () => Promise<{ data: T }[]>,
  normalize: (rows: T[]) => T[],
  label: string,
): Promise<T[]> {
  try {
    const rows = await query();
    return normalize(rows.map((r) => r.data));
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn(`${label} table not found — run \`npm run db:push\`. Returning [].`);
      return [];
    }
    throw err;
  }
}

export async function getAllBets(): Promise<Bet[]> {
  return getAllRows(() => db.select().from(betsTable), normalizeBets, "bets");
}

export async function getAllMilestones(): Promise<Milestone[]> {
  return getAllRows(
    () => db.select().from(milestonesTable),
    normalizeMilestones,
    "milestones",
  );
}

export async function getAllOutlooks(): Promise<DeliveryOutlook[]> {
  return getAllRows(
    () => db.select().from(outlooksTable),
    normalizeOutlooks,
    "outlooks",
  );
}

export async function getState(): Promise<{
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  outlooks: DeliveryOutlook[];
}> {
  await ensureSeeded();
  const [items, weights, bets, milestones, outlooks] = await Promise.all([
    getAllItems(),
    getWeights(),
    getAllBets(),
    getAllMilestones(),
    getAllOutlooks(),
  ]);
  return { items, weights, bets, milestones, outlooks };
}

// Read state trimmed for the anonymous, read-only /share/<token> view. A share
// link is a forwardable bearer URL, so we strip the most internal-only content:
// killed ideas disappear entirely, and on the survivors we clear the kill
// reason and the activity/audit log. Scores, timelines, and Notion/ADO links
// stay visible (that's the intended "trim the sensitive bits" scope). The
// returned shape matches getState() so LoopApp renders unchanged.
export async function getPublicState(): Promise<{
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  outlooks: DeliveryOutlook[];
}> {
  const { items, weights, bets, milestones, outlooks } = await getState();
  // Intake is dropped here rather than hidden in the UI, because a share link is
  // handed to people outside the team and the payload is readable by anyone who
  // opens devtools. A parked idea's problem statement and KR must not ship to
  // them at all — the same reason killed items and the activity log are stripped
  // rather than merely not rendered. It is also the difference that matters
  // most: an unpromoted idea read as "the roadmap" is a half-formed thought
  // mistaken for a commitment (see docs/settings-tab.md).
  const trimmed = trimForShare({ items, bets, outlooks });
  return { ...trimmed, weights, milestones };
}

export async function upsertItem(item: Item): Promise<void> {
  await db
    .insert(itemsTable)
    .values({
      id: item.id,
      data: item,
      updatedAt: new Date(item.updatedAt),
      createdAt: new Date(item.createdAt),
    })
    .onConflictDoUpdate({
      target: itemsTable.id,
      set: { data: item, updatedAt: new Date(item.updatedAt) },
    });
}

// Deleting an item can leave other items pointing at it via `dependsOn`. Prune
// those references here (rather than relying on every reader to filter dead
// ids) so the dangling id doesn't get written back to the DB the next time
// the referencing item is saved.
export async function deleteItem(id: string): Promise<void> {
  const rows = await db.select().from(itemsTable);
  const deletedTitle = rows.find((r) => r.id === id)?.data.title;
  const affected = rows
    .map((r) => r.data)
    .filter((it) => (it.dependsOn || []).includes(id));
  const stamp = new Date().toISOString();
  await Promise.all(
    affected.map((it) =>
      upsertItem({
        ...it,
        dependsOn: (it.dependsOn || []).filter((d) => d !== id),
        updatedAt: stamp,
        activity: [
          ...(it.activity || []),
          `Dependency removed: "${deletedTitle ?? "an idea"}" was deleted.`,
        ],
      }),
    ),
  );
  await db.delete(itemsTable).where(eq(itemsTable.id, id));
}

export async function upsertBet(init: Bet): Promise<void> {
  await db
    .insert(betsTable)
    .values({
      id: init.id,
      data: init,
      updatedAt: new Date(init.updatedAt),
      createdAt: new Date(init.createdAt),
    })
    .onConflictDoUpdate({
      target: betsTable.id,
      set: { data: init, updatedAt: new Date(init.updatedAt) },
    });
}

export async function deleteBet(id: string): Promise<void> {
  await db.delete(betsTable).where(eq(betsTable.id, id));
}

export async function upsertMilestone(milestone: Milestone): Promise<void> {
  await db
    .insert(milestonesTable)
    .values({
      id: milestone.id,
      data: milestone,
      updatedAt: new Date(milestone.updatedAt),
      createdAt: new Date(milestone.createdAt),
    })
    .onConflictDoUpdate({
      target: milestonesTable.id,
      set: { data: milestone, updatedAt: new Date(milestone.updatedAt) },
    });
}

export async function deleteMilestone(id: string): Promise<void> {
  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
}

// Always an upsert — `id` is the deterministic `${mission}:${month}` key, so
// there's no separate create path the way items/bets/milestones have.
export async function upsertOutlook(outlook: DeliveryOutlook): Promise<void> {
  await db
    .insert(outlooksTable)
    .values({
      id: outlook.id,
      data: outlook,
      updatedAt: new Date(outlook.updatedAt),
    })
    .onConflictDoUpdate({
      target: outlooksTable.id,
      set: { data: outlook, updatedAt: new Date(outlook.updatedAt) },
    });
}

export async function setWeights(weights: Weights): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ id: SETTINGS_ID, weights, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { weights, updatedAt: new Date() },
    });
}

// Replaces the entire dataset — used by the JSON import flow. Bets are
// only touched when an array is provided: new exports always include the key
// (even []), so they round-trip; legacy files omit it and leave bets
// untouched rather than silently wiping them.
export async function replaceAll(
  items: Item[],
  weights?: Weights,
  bets?: Bet[],
  milestones?: Milestone[],
): Promise<void> {
  await db.delete(itemsTable);
  if (items.length) {
    await db.insert(itemsTable).values(
      items.map((it) => ({
        id: it.id,
        data: it,
        updatedAt: new Date(it.updatedAt),
        createdAt: new Date(it.createdAt),
      })),
    );
  }
  if (bets) {
    await db.delete(betsTable);
    if (bets.length) {
      await db.insert(betsTable).values(
        bets.map((it) => ({
          id: it.id,
          data: it,
          updatedAt: new Date(it.updatedAt),
          createdAt: new Date(it.createdAt),
        })),
      );
    }
  }
  // Only touch milestones when the file carries them, so older exports that
  // predate the feature don't wipe existing milestones.
  if (milestones) {
    await db.delete(milestonesTable);
    if (milestones.length) {
      await db.insert(milestonesTable).values(
        milestones.map((it) => ({
          id: it.id,
          data: it,
          updatedAt: new Date(it.updatedAt),
          createdAt: new Date(it.createdAt),
        })),
      );
    }
  }
  if (weights) await setWeights(weights);
}

/* ============================ Scenarios ============================ */
// Personal "what-if" drafts. Each is one whole-LoopState blob in the `scenarios`
// table — the live roadmap tables and their per-entity write path are untouched.
// Reads normalize the blob (migrateItems / normalize*) so a scenario forked
// before a model change still renders like live does. Writes (save/delete) are
// always scoped by `createdBy` so a draft can only be edited or discarded by
// its owner. Reads (list/get) admit one exception: "headlights-archive"
// scenarios are locked, read-only snapshots meant for leadership/other teams
// to open, so listScenarios/getScenario also return them regardless of who
// forked them — a plain "whatif" draft stays visible only to its creator. Like
// the other newer tables, a missing relation (schema not yet pushed) degrades
// gracefully.
const readableByAnyone = eq(scenariosTable.kind, "headlights-archive");

function rowToScenario(row: typeof scenariosTable.$inferSelect): Scenario {
  const st = row.state;
  return {
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    state: {
      items: migrateItems(st.items ?? []),
      weights: st.weights ?? SEED_WEIGHTS,
      bets: normalizeBets(st.bets ?? []),
      milestones: normalizeMilestones(st.milestones ?? []),
      // `?? []` covers scenarios forked before outlooks existed.
      outlooks: normalizeOutlooks(st.outlooks ?? []),
    },
    // `?? "whatif"` covers scenarios created before kind/locked existed.
    kind: row.kind ?? "whatif",
    locked: row.locked ?? false,
    forkedAt: row.forkedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Metadata (no state blob) for the current user's scenarios, newest edit first.
export async function listScenarios(createdBy: string): Promise<ScenarioMeta[]> {
  try {
    const rows = await db
      .select({
        id: scenariosTable.id,
        name: scenariosTable.name,
        createdBy: scenariosTable.createdBy,
        kind: scenariosTable.kind,
        locked: scenariosTable.locked,
        forkedAt: scenariosTable.forkedAt,
        createdAt: scenariosTable.createdAt,
        updatedAt: scenariosTable.updatedAt,
      })
      .from(scenariosTable)
      .where(or(eq(scenariosTable.createdBy, createdBy), readableByAnyone))
      .orderBy(desc(scenariosTable.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: r.createdBy,
      kind: r.kind ?? "whatif",
      locked: r.locked ?? false,
      forkedAt: r.forkedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn(
        "scenarios table not found — run `npm run db:push`. Returning [].",
      );
      return [];
    }
    throw err;
  }
}

// Fork the live roadmap into a new named scenario owned by `createdBy`.
// `kind` defaults to "whatif"; passing "headlights-archive" locks the row at
// creation (see ScenarioKind in types.ts) — there is no separate "lock this
// scenario" step, because a whatif that gets locked after the fact would still
// carry whatever half-finished edits were in it when someone remembered to
// lock it.
export async function createScenario(
  name: string,
  createdBy: string,
  kind: Scenario["kind"] = "whatif",
): Promise<Scenario> {
  const live = await getState();
  const now = new Date();
  const id = "sc_" + crypto.randomUUID();
  const state: LoopState = {
    items: live.items,
    weights: live.weights,
    bets: live.bets,
    milestones: live.milestones,
    outlooks: live.outlooks,
  };
  const locked = kind === "headlights-archive";
  await db.insert(scenariosTable).values({
    id,
    name,
    createdBy,
    state,
    kind,
    locked,
    forkedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    name,
    createdBy,
    state,
    kind,
    locked,
    forkedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// Read one scenario (with its state). Null if not found, or if it's a private
// "whatif" draft not owned by `createdBy` — a "headlights-archive" is
// returned regardless of owner (see the module comment above).
export async function getScenario(
  id: string,
  createdBy: string,
): Promise<Scenario | null> {
  try {
    const rows = await db
      .select()
      .from(scenariosTable)
      .where(
        and(
          eq(scenariosTable.id, id),
          or(eq(scenariosTable.createdBy, createdBy), readableByAnyone),
        ),
      )
      .limit(1);
    return rows[0] ? rowToScenario(rows[0]) : null;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

export type ScenarioWriteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "locked" };

// Save the whole working state of a scenario. Refuses (rather than silently
// no-op'ing) when the scenario is locked — a locked archive answers "what did
// we believe in <month>", and letting an in-flight edit overwrite that would
// make the archive lie. Checked with its own read rather than folded into the
// UPDATE's WHERE clause so the caller can tell "doesn't exist" apart from
// "exists but is locked" instead of getting the same false either way.
export async function saveScenario(
  id: string,
  createdBy: string,
  state: LoopState,
): Promise<ScenarioWriteResult> {
  const rows = await db
    .select({ locked: scenariosTable.locked })
    .from(scenariosTable)
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    )
    .limit(1);
  if (!rows[0]) return { ok: false, reason: "not_found" };
  if (rows[0].locked) return { ok: false, reason: "locked" };
  await db
    .update(scenariosTable)
    .set({ state, updatedAt: new Date() })
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    );
  return { ok: true };
}

// Discard a scenario, scoped to its owner. Idempotent on an already-gone
// scenario (a retried request, or a double-clicked discard, should not error
// just because a previous call already deleted it) — but still refuses on a
// locked archive for the same reason saveScenario does; see ScenarioKind in
// types.ts.
export async function deleteScenario(
  id: string,
  createdBy: string,
): Promise<ScenarioWriteResult> {
  const rows = await db
    .select({ locked: scenariosTable.locked })
    .from(scenariosTable)
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    )
    .limit(1);
  if (!rows[0]) return { ok: true };
  if (rows[0].locked) return { ok: false, reason: "locked" };
  await db
    .delete(scenariosTable)
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    );
  return { ok: true };
}
