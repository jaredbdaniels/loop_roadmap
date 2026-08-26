import "server-only";
import { safeEqual } from "../safe-equal";

// Service-to-service auth for the Loop MCP server (see /mcp-server at the repo
// root). An MCP client can't carry a Better Auth session cookie, so a shared
// API key stands in for one — same shape as the Aha! webhook secret
// (src/lib/aha/client.ts), just read-only and carried as a bearer token
// instead of a webhook signature.
//
// This backs *read* routes only. Write routes (POST/PUT/PATCH/DELETE) must
// keep using getSession() alone — the MCP server has no write tools, and the
// key was never meant to authorize them.

// The sentinel "user" a valid API key resolves to. It has no real Better Auth
// identity, so scenario reads scoped by createdBy naturally fall back to only
// the ones "readableByAnyone" (locked Headlights archives) — an API key can
// read the live roadmap and public archives, never another user's private
// what-if drafts.
export const MCP_SERVICE_EMAIL = "mcp-service@campminder.internal";

export function mcpConfigured(): boolean {
  return Boolean(process.env.LOOP_MCP_API_KEY);
}

export function verifyMcpApiKey(req: Request): boolean {
  const expected = process.env.LOOP_MCP_API_KEY;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  return Boolean(bearer) && safeEqual(bearer, expected);
}
