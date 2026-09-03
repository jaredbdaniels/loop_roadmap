import { describe, expect, it } from "vitest";
import { resolveSummaryOptions, type SummaryOptions } from "./ai-summary-options";

describe("resolveSummaryOptions", () => {
  const current: SummaryOptions = { audience: "exec", length: "medium", format: "prose" };

  it("keeps current state when no overrides are given", () => {
    expect(resolveSummaryOptions(current, {})).toEqual(current);
  });

  it("overrides only the audience", () => {
    expect(resolveSummaryOptions(current, { audience: "team" })).toEqual({
      audience: "team",
      length: "medium",
      format: "prose",
    });
  });

  it("overrides only the length", () => {
    expect(resolveSummaryOptions(current, { length: "long" })).toEqual({
      audience: "exec",
      length: "long",
      format: "prose",
    });
  });

  it("overrides only the format", () => {
    expect(resolveSummaryOptions(current, { format: "bullets" })).toEqual({
      audience: "exec",
      length: "medium",
      format: "bullets",
    });
  });

  it("overrides multiple dimensions at once", () => {
    expect(resolveSummaryOptions(current, { length: "short", format: "bullets" })).toEqual({
      audience: "exec",
      length: "short",
      format: "bullets",
    });
  });
});
