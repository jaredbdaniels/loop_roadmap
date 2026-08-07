import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  bets as betsTable,
  items as itemsTable,
  milestones as milestonesTable,
  scenarios as scenariosTable,
  settings as settingsTable,
} from "../schema";
import {
  SEED_WEIGHTS,
  seedBets,
  seedItems,
  seedMilestones,
} from "./seed";
import { migrateItems, normalizeBets, normalizeMilestones } from "./logic";
import type {
  Bet,
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
function isMissingRelation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "42P01" ||
    /relation ".*" does not exist/i.test(e?.message ?? "")
  );
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

export async function getAllBets(): Promise<Bet[]> {
  try {
    const rows = await db.select().from(betsTable);
    return normalizeBets(rows.map((r) => r.data));
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn(
        "bets table not found — run `npm run db:push`. Returning [].",
      );
      return [];
    }
    throw err;
  }
}

export async function getAllMilestones(): Promise<Milestone[]> {
  try {
    const rows = await db.select().from(milestonesTable);
    return normalizeMilestones(rows.map((r) => r.data));
  } catch (err) {
    if (isMissingRelation(err)) {
      console.warn(
        "milestones table not found — run `npm run db:push`. Returning [].",
      );
      return [];
    }
    throw err;
  }
}

export async function getState(): Promise<{
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
}> {
  await ensureSeeded();
  const [items, weights, bets, milestones] = await Promise.all([
    getAllItems(),
    getWeights(),
    getAllBets(),
    getAllMilestones(),
  ]);
  return { items, weights, bets, milestones };
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
}> {
  const { items, weights, bets, milestones } = await getState();
  const publicItems = items
    .filter((it) => !it.killed)
    .map((it) => ({ ...it, killedReason: "", activity: [] }));
  return { items: publicItems, weights, bets, milestones };
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
// before a model change still renders like live does. Every function is scoped
// by `createdBy` so scenarios are private to their owner. Like the other newer
// tables, a missing relation (schema not yet pushed) degrades gracefully.

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
    },
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
        forkedAt: scenariosTable.forkedAt,
        createdAt: scenariosTable.createdAt,
        updatedAt: scenariosTable.updatedAt,
      })
      .from(scenariosTable)
      .where(eq(scenariosTable.createdBy, createdBy))
      .orderBy(desc(scenariosTable.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: r.createdBy,
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
export async function createScenario(
  name: string,
  createdBy: string,
): Promise<Scenario> {
  const live = await getState();
  const now = new Date();
  const id = "sc_" + crypto.randomUUID();
  const state: LoopState = {
    items: live.items,
    weights: live.weights,
    bets: live.bets,
    milestones: live.milestones,
  };
  await db.insert(scenariosTable).values({
    id,
    name,
    createdBy,
    state,
    forkedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return {
    id,
    name,
    createdBy,
    state,
    forkedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

// Read one scenario (with its state), scoped to its owner. Null if not found or
// not owned by `createdBy`.
export async function getScenario(
  id: string,
  createdBy: string,
): Promise<Scenario | null> {
  try {
    const rows = await db
      .select()
      .from(scenariosTable)
      .where(
        and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
      )
      .limit(1);
    return rows[0] ? rowToScenario(rows[0]) : null;
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

// Save the whole working state of a scenario. Returns false if the scenario
// doesn't exist or isn't owned by `createdBy` (nothing updated).
export async function saveScenario(
  id: string,
  createdBy: string,
  state: LoopState,
): Promise<boolean> {
  const updated = await db
    .update(scenariosTable)
    .set({ state, updatedAt: new Date() })
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    )
    .returning({ id: scenariosTable.id });
  return updated.length > 0;
}

// Discard a scenario, scoped to its owner.
export async function deleteScenario(
  id: string,
  createdBy: string,
): Promise<void> {
  await db
    .delete(scenariosTable)
    .where(
      and(eq(scenariosTable.id, id), eq(scenariosTable.createdBy, createdBy)),
    );
}
