import "server-only";

// Reads the bearer token off an Authorization header, tolerating a missing
// "Bearer " prefix. Shared by every shared-secret check that accepts a
// bearer token (Aha! webhook secret, Loop MCP API key).
export function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  return auth.replace(/^Bearer\s+/i, "");
}
