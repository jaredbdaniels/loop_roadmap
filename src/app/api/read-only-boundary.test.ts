import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Guards the read/write auth split getReadSession() exists for: write verbs
// must keep resolving auth through getSession() alone, never getReadSession()
// — the latter also accepts the Loop MCP API key, a read-only identity with
// no personal auth (see lib/require-session.ts). Without this check, a
// future "cleanup" that swaps a write handler onto getReadSession() would
// compile and pass review as an innocuous one-line diff, silently handing
// the shared MCP key write/delete access.

const API_DIR = fileURLToPath(new URL(".", import.meta.url));
const WRITE_VERBS = ["POST", "PUT", "PATCH", "DELETE"];

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return findRouteFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

// Extracts the brace-matched body of `export async function <verb>(...) { ... }`,
// or null if this file doesn't export that verb.
function extractHandlerBody(source: string, verb: string): string | null {
  const start = source.indexOf(`export async function ${verb}`);
  if (start === -1) return null;
  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) return null;
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(bodyStart, i + 1);
  }
  return null;
}

describe("read-only auth boundary", () => {
  it("never lets a write handler resolve auth via getReadSession", () => {
    const violations = findRouteFiles(API_DIR).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return WRITE_VERBS.filter((verb) =>
        extractHandlerBody(source, verb)?.includes("getReadSession"),
      ).map((verb) => `${file} (${verb})`);
    });
    expect(violations).toEqual([]);
  });
});
