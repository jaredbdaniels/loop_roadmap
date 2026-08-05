import { describe, expect, it } from "vitest";
import {
  SEASONS,
  SEASON_LANES,
  laneColor,
  seasonColor,
  seasonIntensityAt,
  seasonPeakMonth,
  seasonsInLane,
} from "./seasons";

describe("SEASONS", () => {
  // A typo'd curve renders a plausible-but-wrong shape rather than failing, so
  // the shape is asserted here instead of being caught by eye on the timeline.
  it("gives every season twelve monthly samples in 0..1", () => {
    for (const s of SEASONS) {
      expect(s.curve.length, s.id).toBe(12);
      for (const [i, v] of s.curve.entries()) {
        expect(Number.isFinite(v), `${s.id}[${i}]`).toBe(true);
        expect(v, `${s.id}[${i}]`).toBeGreaterThanOrEqual(0);
        expect(v, `${s.id}[${i}]`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("peaks at 1 somewhere, so the lanes share one intensity scale", () => {
    // Two lanes are only comparable if neither is silently drawn at half
    // height — every season has to use the full 0..1 range.
    for (const s of SEASONS) {
      expect(Math.max(...s.curve), s.id).toBe(1);
    }
  });

  it("has unique ids and a known lane for every season", () => {
    const lanes = new Set(SEASON_LANES.map((l) => l.key));
    const ids = SEASONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SEASONS) expect(lanes.has(s.lane), s.id).toBe(true);
  });

  it("labels every curve as curated until real usage data is connected", () => {
    // Loop/INTEGRATIONS.md defers the Pendo/warehouse connectors. Until one
    // lands, nothing here may claim to be measured.
    for (const s of SEASONS) expect(s.source, s.id).toBe("curated");
  });

  it("populates both lanes", () => {
    for (const lane of SEASON_LANES)
      expect(seasonsInLane(lane.key).length, lane.key).toBeGreaterThan(0);
  });

  // The lanes went from seven hues to one-per-lane precisely because seven
  // near-identical oranges were unreadable stacked. Accents are what would
  // quietly undo that, so the budget is enforced rather than remembered.
  it("spends at most two accents per lane", () => {
    for (const lane of SEASON_LANES) {
      const accents = seasonsInLane(lane.key).filter(
        (s) => s.emphasis === "accent",
      );
      expect(accents.length, lane.key).toBeLessThanOrEqual(2);
      // A lane with no accent has nothing the eye lands on first.
      expect(accents.length, lane.key).toBeGreaterThan(0);
    }
  });

  it("draws one hue per lane, and never the same hue in both", () => {
    for (const lane of SEASON_LANES) {
      const base = new Set(
        seasonsInLane(lane.key)
          .filter((s) => s.emphasis === "base")
          .map(seasonColor),
      );
      expect(base, lane.key).toEqual(new Set([laneColor(lane.key)]));
    }
    const [camp, cm] = SEASON_LANES;
    expect(laneColor(camp.key)).not.toBe(laneColor(cm.key));
  });
});

describe("seasonsInLane", () => {
  // The ordering IS the readability fix: authoring order groups by topic, which
  // draws as unrelated humps. By peak, the lane is one wave through the year.
  it("orders a lane by the month each season peaks", () => {
    for (const lane of SEASON_LANES) {
      const peaks = seasonsInLane(lane.key).map((s) =>
        seasonPeakMonth(s.curve),
      );
      expect([...peaks].sort((a, b) => a - b), lane.key).toEqual(peaks);
    }
  });

  it("reads the camp's year in calendar order, facilities through in-season", () => {
    // Spelled out rather than asserted structurally: this sequence is the story
    // the lane is supposed to tell, and a curve edit that scrambles it should
    // fail here loudly instead of just looking a bit off on screen.
    expect(seasonsInLane("camp").map((s) => s.id)).toEqual([
      "off-season-facilities",
      "conference",
      "staff-recruiting",
      "enrollment",
      "staff-hiring",
      "staff-onboarding",
      "camp-in-season",
    ]);
  });

  it("returns a fresh array, leaving SEASONS in authoring order", () => {
    // seasonsInLane sorts in place; if it ever sorted the module's own array,
    // the source of truth would silently reorder itself under every reader.
    const before = SEASONS.map((s) => s.id);
    seasonsInLane("camp");
    expect(SEASONS.map((s) => s.id)).toEqual(before);
  });
});

describe("seasonPeakMonth", () => {
  it("takes the first month of a plateau, not the last", () => {
    const inSeason = SEASONS.find((s) => s.id === "camp-in-season")!;
    // 1.0 in both June (fiscal 9) and July (10) — the season arrives in June.
    expect(seasonPeakMonth(inSeason.curve)).toBe(9);
  });
});

describe("season phase relationships", () => {
  // The whole reason the two lanes sit next to each other: our quietest sales
  // quarter is the camp's busiest operating one. If a curve edit breaks that,
  // the lanes stop telling the story they were built to tell.
  it("keeps Campminder sales and camp in-season in counter-phase", () => {
    const sales = SEASONS.find((s) => s.id === "sales")!;
    const inSeason = SEASONS.find((s) => s.id === "camp-in-season")!;
    const support = SEASONS.find((s) => s.id === "support")!;
    const july = new Date(2027, 6, 15);
    const october = new Date(2026, 9, 15);

    expect(seasonIntensityAt(inSeason, july)).toBeGreaterThan(0.9);
    expect(seasonIntensityAt(sales, july)).toBeLessThan(0.2);
    expect(seasonIntensityAt(support, july)).toBeGreaterThan(0.9);

    expect(seasonIntensityAt(sales, october)).toBeGreaterThan(0.9);
    expect(seasonIntensityAt(inSeason, october)).toBeLessThan(0.2);
  });
});

describe("seasonIntensityAt", () => {
  it("returns the month's own sample at the month midpoint", () => {
    const sales = SEASONS.find((s) => s.id === "sales")!;
    // A month's samples sit at its midpoint. In a 31-day month that lands
    // exactly on day 16; in a 30-day month it falls between days 15 and 16, so
    // this pins the case where the two agree. October is fiscal index 1.
    const midOct = new Date(2026, 9, 16);
    expect(seasonIntensityAt(sales, midOct)).toBeCloseTo(sales.curve[1], 5);
  });

  it("interpolates toward the previous month early and the next month late", () => {
    const sales = SEASONS.find((s) => s.id === "sales")!;
    // Sep 0.85 → Oct 1.0, so late September must read above mid-September and
    // early September must read below it (back toward August's 0.15).
    const early = seasonIntensityAt(sales, new Date(2026, 8, 1));
    const mid = seasonIntensityAt(sales, new Date(2026, 8, 15));
    const late = seasonIntensityAt(sales, new Date(2026, 8, 30));
    expect(early).toBeLessThan(mid);
    expect(late).toBeGreaterThan(mid);
  });

  it("stays within 0..1 on every day of a two-year span", () => {
    const d = new Date(2026, 8, 1);
    for (let i = 0; i < 730; i++) {
      for (const s of SEASONS) {
        const v = seasonIntensityAt(s, d);
        expect(v, `${s.id} on ${d.toISOString().slice(0, 10)}`).toBeGreaterThanOrEqual(0);
        expect(v, `${s.id} on ${d.toISOString().slice(0, 10)}`).toBeLessThanOrEqual(1);
      }
      d.setDate(d.getDate() + 1);
    }
  });
});
