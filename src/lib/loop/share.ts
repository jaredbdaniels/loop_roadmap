import "server-only";
import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { shareLinks } from "../schema";

export type ShareLink = typeof shareLinks.$inferSelect;

// URL-safe bearer token (~32 chars). Node crypto is available because the API
// routes run in the Node runtime (the Neon Pool driver requires it).
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// A row is a live link only if it's enabled, not revoked, and not past expiry.
function isLive(row: ShareLink, now: Date): boolean {
  if (!row.enabled || row.revokedAt) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

// The current active link, or null. Single-active-link semantics: there should
// be at most one enabled, non-revoked row at a time.
export async function getActiveShareLink(): Promise<ShareLink | null> {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.enabled, true), isNull(shareLinks.revokedAt)));
  const now = new Date();
  const live = rows.filter((r) => isLive(r, now));
  // Prefer the most recently created live link if several somehow exist.
  live.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return live[0] ?? null;
}

// Revoke every currently-enabled row, then insert a fresh one. Used for both
// "generate" (none active) and "regenerate" (rotate the secret) — old links
// stop working immediately.
export async function createShareLink(email: string): Promise<string> {
  await db
    .update(shareLinks)
    .set({ enabled: false, revokedAt: new Date() })
    .where(and(eq(shareLinks.enabled, true), isNull(shareLinks.revokedAt)));
  const token = newToken();
  await db.insert(shareLinks).values({ token, createdBy: email });
  return token;
}

export async function revokeShareLink(token: string): Promise<void> {
  await db
    .update(shareLinks)
    .set({ enabled: false, revokedAt: new Date() })
    .where(eq(shareLinks.token, token));
}

// True only for a live token. Drives the public /share/<token> gate.
export async function validateShareToken(token: string): Promise<boolean> {
  if (!token) return false;
  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  const row = rows[0];
  return !!row && isLive(row, new Date());
}
