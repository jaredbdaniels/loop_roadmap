import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  Bet,
  DeliveryOutlook,
  Item,
  LoopState,
  Milestone,
  Weights,
} from "./loop/types";

/* ============================ Loop domain ============================ */
// Each roadmap item is stored as a lossless JSON blob (the client works with
// whole Item objects), with id + updatedAt mirrored as columns for ordering
// and cheap "what changed" polling. See src/lib/loop/types.ts for the shape.
export const items = pgTable("items", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Item>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Cross-team strategic bets, stored as lossless JSON blobs just like items (the
// client works with whole Bet objects). Mirrors the `items` table shape.
// See src/lib/loop/types.ts for the Bet shape.
//
// The SQL table is still called `initiatives`, deliberately. Bets were called
// initiatives before the strategic-bets rename, and because the row is a single
// JSON blob every new field rides along with no schema change — renaming the
// table would turn a zero-migration change into a data migration for no gain
// beyond cosmetics. Same reasoning keeps the routes at /api/initiatives.
export const bets = pgTable("initiatives", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Bet>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Point-in-time milestones, stored as lossless JSON blobs like items and
// bets. Mirrors those table shapes. See src/lib/loop/types.ts for the
// Milestone shape.
export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Milestone>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// A team's stated delivery outlook for one month of a Headlights cycle, stored
// as a lossless JSON blob just like items/bets/milestones. `id` is the
// deterministic `${mission}:${month}` key (see DeliveryOutlook in
// src/lib/loop/types.ts), so every write is an upsert and there's no separate
// id generation step.
export const outlooks = pgTable("outlooks", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<DeliveryOutlook>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// A scenario is a personal, throwaway "what-if" copy of the whole roadmap. The
// entire LoopState (items + weights + bets + milestones + outlooks) is stored
// as one lossless JSON blob per row — the same shape we round-trip through
// export/import — so the live roadmap tables (items/bets/milestones/settings/
// outlooks) and their per-entity write path are left completely untouched.
// `createdBy` scopes a
// scenario to its owner (personal drafts); `forkedAt` records when it was forked
// from live (informational — the compare baseline is live *now*). See
// src/lib/loop/types.ts for the LoopState shape.
export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  state: jsonb("state").$type<LoopState>().notNull(),
  // "whatif" (default, editable/discardable) or "headlights-archive" (locked
  // at fork time by "Submit for Headlights" — see ScenarioKind in types.ts).
  kind: text("kind").$type<"whatif" | "headlights-archive">().default("whatif").notNull(),
  // Enforced in saveScenario/deleteScenario, not just read here — a locked row
  // can never be saved over or deleted, which is the entire point of an
  // archive being able to answer "what did we believe in <month>" honestly.
  locked: boolean("locked").default(false).notNull(),
  forkedAt: timestamp("forked_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Single global row (id = "global") holding the ranking weights.
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  weights: jsonb("weights").$type<Weights>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Read-only share links. The token is an unguessable bearer secret that grants
// anonymous, read-only access to the (single, global) roadmap at /share/<token>
// — no Campminder login required. The UI exposes one active link at a time
// (regenerate = revoke the current row + insert a new one), but the table
// supports multiple rows for cheap future-proofing and an audit trail.
export const shareLinks = pgTable("share_links", {
  token: text("token").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  createdBy: text("created_by").notNull(),
  label: text("label"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/* ============================ Better Auth ============================ */
// Field names match Better Auth's expected Drizzle schema.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
