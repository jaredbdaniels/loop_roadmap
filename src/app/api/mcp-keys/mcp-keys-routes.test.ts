import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the true boundaries: the session and the key store. This exercises
// the routes' actual auth gating and — the part that matters for
// security — that the caller's own session id is what's used to
// scope/own a key, never anything the client supplies.
vi.mock("@/lib/require-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/mcp/keys", () => ({
  createMcpApiKey: vi.fn(),
  listMcpApiKeys: vi.fn(),
  revokeMcpApiKey: vi.fn(),
}));

import { getSession } from "@/lib/require-session";
import { createMcpApiKey, listMcpApiKeys, revokeMcpApiKey } from "@/lib/mcp/keys";
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

const SESSION = { user: { id: "user-1", email: "a@campminder.com" } } as never;

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(createMcpApiKey).mockReset();
  vi.mocked(listMcpApiKeys).mockReset();
  vi.mocked(revokeMcpApiKey).mockReset();
});

describe("GET /api/mcp-keys", () => {
  it("401s without a session, and never calls the store", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listMcpApiKeys).not.toHaveBeenCalled();
  });

  it("lists only the signed-in user's own keys", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(listMcpApiKeys).mockResolvedValue([
      {
        id: "k1",
        userId: "user-1",
        name: "Claude Desktop",
        keyHash: "hash",
        keyPrefix: "loop_mcp_abc123",
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);
    const res = await GET();
    expect(listMcpApiKeys).toHaveBeenCalledWith("user-1");
    const body = (await res.json()) as { keys: unknown[] };
    expect(body.keys).toHaveLength(1);
  });
});

describe("POST /api/mcp-keys", () => {
  it("401s without a session, and never mints a key", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(createMcpApiKey).not.toHaveBeenCalled();
  });

  it("mints a key for the signed-in user's own id, using the given label", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(createMcpApiKey).mockResolvedValue({ id: "k1", key: "loop_mcp_secret" });
    const res = await POST(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ name: "Claude Desktop" }),
      }),
    );
    expect(createMcpApiKey).toHaveBeenCalledWith("user-1", "Claude Desktop");
    expect(await res.json()).toEqual({ id: "k1", key: "loop_mcp_secret" });
  });

  it("tolerates a missing/non-JSON body", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(createMcpApiKey).mockResolvedValue({ id: "k1", key: "loop_mcp_secret" });
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(createMcpApiKey).toHaveBeenCalledWith("user-1", undefined);
  });
});

describe("DELETE /api/mcp-keys/:id", () => {
  const params = Promise.resolve({ id: "k1" });

  it("401s without a session, and never revokes", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await DELETE(new Request("http://test"), { params });
    expect(res.status).toBe(401);
    expect(revokeMcpApiKey).not.toHaveBeenCalled();
  });

  it("scopes the revoke to the signed-in user's own id, not anything client-supplied", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(revokeMcpApiKey).mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), { params });
    expect(revokeMcpApiKey).toHaveBeenCalledWith("user-1", "k1");
    expect(res.status).toBe(200);
  });

  it("404s when the store reports no matching, still-active key for this owner", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION);
    vi.mocked(revokeMcpApiKey).mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), { params });
    expect(res.status).toBe(404);
  });
});
