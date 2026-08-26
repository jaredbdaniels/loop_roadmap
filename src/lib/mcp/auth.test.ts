import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mcpConfigured, verifyMcpApiKey } from "./auth";

const KEY = "loop-mcp-s3cret";

const req = (auth?: string) =>
  new Request("http://test/api/items", {
    headers: auth ? { authorization: auth } : {},
  });

describe("mcp/auth", () => {
  beforeEach(() => {
    process.env.LOOP_MCP_API_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.LOOP_MCP_API_KEY;
  });

  it("mcpConfigured reflects whether the key is set", () => {
    expect(mcpConfigured()).toBe(true);
    delete process.env.LOOP_MCP_API_KEY;
    expect(mcpConfigured()).toBe(false);
  });

  it("accepts the correct bearer token", () => {
    expect(verifyMcpApiKey(req(`Bearer ${KEY}`))).toBe(true);
  });

  it("rejects a missing or wrong header", () => {
    expect(verifyMcpApiKey(req())).toBe(false);
    expect(verifyMcpApiKey(req("Bearer wrong"))).toBe(false);
  });

  it("tolerates a bare key with no 'Bearer ' prefix", () => {
    // Mirrors verifyAhaSecret's tolerance — the raw header value is accepted
    // as-is when it doesn't start with "Bearer ".
    expect(verifyMcpApiKey(req(KEY))).toBe(true);
  });

  it("rejects every request when no key is configured", () => {
    delete process.env.LOOP_MCP_API_KEY;
    expect(verifyMcpApiKey(req(`Bearer ${KEY}`))).toBe(false);
  });
});
