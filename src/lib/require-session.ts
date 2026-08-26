import { headers } from "next/headers";
import { auth } from "./auth";
import { MCP_SERVICE_EMAIL, verifyMcpApiKey } from "./mcp/auth";

// Dev-only sign-in bypass so the app runs on localhost before Google OAuth is
// set up. Strictly gated: NEVER active in production, and only when DEV_AUTH=1.
function devSession() {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_AUTH !== "1") return null;
  return {
    user: {
      id: "dev-user",
      email: "dev@campminder.com",
      name: "Dev User",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as unknown as Awaited<ReturnType<typeof auth.api.getSession>>;
}

// Returns the current session, or null. Used by API routes to gate access.
export async function getSession() {
  const dev = devSession();
  if (dev) return dev;
  return auth.api.getSession({ headers: await headers() });
}

// The sentinel identity a valid Loop MCP API key resolves to. Deliberately
// NOT cast to look like a real Better Auth session (that session also carries
// a `session` field this doesn't have) — `isMcpService` lets callers tell the
// two apart instead of a write handler silently treating this as a full user.
export interface McpSession {
  isMcpService: true;
  user: { email: string; name: string; id: string };
}

export function isMcpSession(
  sess: NonNullable<Awaited<ReturnType<typeof getReadSession>>>,
): sess is McpSession {
  return "isMcpService" in sess;
}

// Session for *read* routes: a real Better Auth session, or the Loop MCP
// server's API key, which resolves to a sentinel service identity (never a
// real user). Write routes must keep using getSession() — this is
// deliberately read-only surface, not a general service-auth bypass.
//
// Checks the API key first: it's a cheap header compare, and an MCP client
// never carries a session cookie, so this lets every MCP call skip
// getSession()'s DB-backed lookup entirely instead of paying for a session
// check that can never succeed for that caller.
export async function getReadSession(req: Request) {
  if (verifyMcpApiKey(req)) {
    return {
      isMcpService: true,
      user: { email: MCP_SERVICE_EMAIL, name: "Loop MCP", id: "mcp-service" },
    } satisfies McpSession;
  }
  return getSession();
}
