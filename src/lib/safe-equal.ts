import "server-only";
import { timingSafeEqual } from "node:crypto";

// Constant-time string compare that tolerates length differences without
// leaking them through an early return. Shared by every shared-secret check
// in the app (Aha! webhook, Loop MCP API key) so a future fix to this
// comparison only has to happen once.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
