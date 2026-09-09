import "server-only";
import { createHash, randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { mcpApiKeys, user } from "../schema";

export type McpApiKey = typeof mcpApiKeys.$inferSelect;

// Prefixed so a token is self-identifying (and so resolvePersonalMcpKey can
// cheaply reject anything that isn't shaped like one before touching the DB).
const KEY_PREFIX = "loop_mcp_";
// How much of the token to keep visible in the UI after the one-time reveal
// — enough to tell two keys apart, never enough to reconstruct the secret.
const VISIBLE_PREFIX_LEN = KEY_PREFIX.length + 6;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Mints a new personal key for `userId` and returns the plaintext once —
// only the hash is ever persisted, so this is the only moment the caller can
// see it (same one-time-reveal contract as a GitHub PAT).
export async function createMcpApiKey(
  userId: string,
  name?: string,
): Promise<{ id: string; key: string }> {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const id = randomBytes(12).toString("base64url");
  await db.insert(mcpApiKeys).values({
    id,
    userId,
    name: name?.trim() || null,
    keyHash: hashKey(key),
    keyPrefix: key.slice(0, VISIBLE_PREFIX_LEN),
  });
  return { id, key };
}

// A user's own keys (active and revoked) — never the hash or plaintext.
// Newest first, so a freshly created key is the one the UI shows on top.
export async function listMcpApiKeys(userId: string): Promise<McpApiKey[]> {
  return db
    .select()
    .from(mcpApiKeys)
    .where(eq(mcpApiKeys.userId, userId))
    .orderBy(desc(mcpApiKeys.createdAt));
}

// Revokes a key, scoped to its owner so one user can never revoke another's.
// Returns false if no matching, still-active key exists.
export async function revokeMcpApiKey(
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(mcpApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpApiKeys.id, id),
        eq(mcpApiKeys.userId, userId),
        isNull(mcpApiKeys.revokedAt),
      ),
    )
    .returning({ id: mcpApiKeys.id });
  return rows.length > 0;
}

// Below this staleness, skip the lastUsedAt write on resolve — a session
// calling several MCP tools back-to-back would otherwise pay for an extra
// UPDATE on every single one. The attribution trail only needs to say
// "roughly when", not track every call.
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

// Resolves a bearer token to the real Campminder user who owns it, or null
// if it's missing, unrecognized, or revoked. Used by getReadSession as the
// per-person alternative to the shared LOOP_MCP_API_KEY sentinel — the
// returned identity is a real user, so callers should treat it exactly like
// a normal session (own scenario drafts visible, real createdBy, etc.), not
// redact it the way the shared-key sentinel is redacted.
export async function resolvePersonalMcpKey(
  token: string,
): Promise<{ id: string; email: string; name: string } | null> {
  if (!token || !token.startsWith(KEY_PREFIX)) return null;
  const rows = await db
    .select({
      keyId: mcpApiKeys.id,
      revokedAt: mcpApiKeys.revokedAt,
      lastUsedAt: mcpApiKeys.lastUsedAt,
      userId: user.id,
      email: user.email,
      name: user.name,
    })
    .from(mcpApiKeys)
    .innerJoin(user, eq(mcpApiKeys.userId, user.id))
    .where(eq(mcpApiKeys.keyHash, hashKey(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  const stale =
    !row.lastUsedAt ||
    Date.now() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  if (stale) {
    // Best-effort attribution trail ("who's signing up where") — never
    // blocks the read this is gating if it fails, and throttled above so it
    // isn't a write on every single tool call in a session.
    await db
      .update(mcpApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpApiKeys.id, row.keyId))
      .catch(() => {});
  }
  return { id: row.userId, email: row.email, name: row.name };
}
