import { describe, expect, it, vi } from "vitest";

// Only assert the cheap short-circuit: a token that isn't shaped like a
// personal key must never reach the DB. The rest of keys.ts (hash lookup,
// owner-scoped revoke, lastUsedAt throttling) is store-layer CRUD against
// real rows — same as share.ts/store.ts elsewhere in this codebase, it isn't
// unit tested without a real database.
vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => {
      throw new Error("db.select should not run for a malformed token");
    }),
  },
}));

import { resolvePersonalMcpKey } from "./keys";

describe("resolvePersonalMcpKey", () => {
  it("rejects anything not shaped like a personal key, without querying the DB", async () => {
    expect(await resolvePersonalMcpKey("")).toBeNull();
    expect(await resolvePersonalMcpKey("some-random-bearer-value")).toBeNull();
    // The shared service key is a different shape entirely (no fixed
    // prefix) — this guard is what keeps that path from ever touching the
    // personal-key table.
    expect(await resolvePersonalMcpKey("loop-mcp-shared-secret")).toBeNull();
  });
});
