import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aiEnabled, aiFeaturesEnabled } from "./model";

// The enable-gate is the whole graceful-degradation contract: off unless the
// flag is set AND the active provider has a key.
const saved = { ...process.env };

beforeEach(() => {
  delete process.env.AI_FEATURES;
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("aiEnabled", () => {
  it("is false when the master flag is off, even with a key", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(aiFeaturesEnabled()).toBe(false);
    expect(aiEnabled()).toBe(false);
  });

  it("is false when the flag is on but the provider has no key", () => {
    process.env.AI_FEATURES = "1";
    expect(aiFeaturesEnabled()).toBe(true);
    expect(aiEnabled()).toBe(false);
  });

  it("is true when flag on and the active provider key is present", () => {
    process.env.AI_FEATURES = "1";
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(aiEnabled()).toBe(true);
  });

  it("checks the anthropic key when that provider is selected", () => {
    process.env.AI_FEATURES = "1";
    process.env.AI_PROVIDER = "anthropic";
    process.env.OPENAI_API_KEY = "sk-test"; // wrong provider's key
    expect(aiEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(aiEnabled()).toBe(true);
  });
});
