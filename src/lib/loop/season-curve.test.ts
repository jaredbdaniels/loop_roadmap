import { describe, expect, it } from "vitest";
import {
  sampleSeasonCurve,
  seasonAreaPath,
  seasonLinePath,
  seasonMonthTicks,
  type CurvePoint,
} from "./season-curve";
import { SEASONS, type SeasonCurve } from "./seasons";

const H = 34;
const PAD = 3;

// Sep 2026 → Aug 2028, the shape of the real two-year axis.
const START = new Date(2026, 8, 1);
const END = new Date(2028, 8, 1);

const flat = (v: number) => new Array(12).fill(v) as unknown as SeasonCurve;

describe("sampleSeasonCurve", () => {
  it("samples every month on the axis plus one beyond each end", () => {
    const pts = sampleSeasonCurve(flat(0.5), START, END, 3.4, H, PAD);
    // 24 months on the axis, plus a lead-in and a lead-out.
    expect(pts.length).toBe(26);
  });

  it("puts the lead-in month at negative x so the curve enters at its true slope", () => {
    const pts = sampleSeasonCurve(flat(0.5), START, END, 3.4, H, PAD);
    expect(pts[0].x).toBeLessThan(0);
    expect(pts[1].x).toBeGreaterThan(0);
  });

  it("anchors each sample at the month midpoint, not its first day", () => {
    const ppd = 3.4;
    const pts = sampleSeasonCurve(flat(0.5), START, END, ppd, H, PAD);
    // pts[1] is September, the first month on the axis: 30 days, so its
    // midpoint is 15 days in. Anchoring at the month start would give x = 0.
    expect(pts[1].x).toBeCloseTo(15 * ppd, 5);
  });

  it("maps intensity 1 to the top of the lane and 0 to the baseline", () => {
    const hi = sampleSeasonCurve(flat(1), START, END, 3.4, H, PAD);
    const lo = sampleSeasonCurve(flat(0), START, END, 3.4, H, PAD);
    expect(hi[0].y).toBeCloseTo(PAD, 5);
    expect(lo[0].y).toBeCloseTo(H - PAD, 5);
  });

  it("reads the curve in fiscal order — index 0 is September", () => {
    // A curve that is 1 only in its first slot must peak in September.
    const sepOnly = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as unknown as SeasonCurve;
    const pts = sampleSeasonCurve(sepOnly, START, END, 3.4, H, PAD);
    expect(pts[1].v).toBe(1); // Sep '26
    expect(pts[2].v).toBe(0); // Oct '26
    expect(pts[13].v).toBe(1); // Sep '27, one year on
  });

  it("scales x with px-per-day so curves stay aligned at every zoom", () => {
    const month = sampleSeasonCurve(flat(0.5), START, END, 8, H, PAD);
    const year = sampleSeasonCurve(flat(0.5), START, END, 1.35, H, PAD);
    expect(month.length).toBe(year.length);
    expect(month[5].x / year[5].x).toBeCloseTo(8 / 1.35, 5);
  });
});

describe("seasonLinePath", () => {
  it("returns empty for no points and a bare move for one", () => {
    expect(seasonLinePath([])).toBe("");
    expect(seasonLinePath([{ x: 1, y: 2, v: 0 }])).toBe("M 1 2");
  });

  it("emits one cubic segment per gap between samples", () => {
    const pts = sampleSeasonCurve(flat(0.5), START, END, 3.4, H, PAD);
    const curves = (seasonLinePath(pts).match(/C /g) || []).length;
    expect(curves).toBe(pts.length - 1);
  });

  it("stays flat across a constant curve instead of bulging between samples", () => {
    // Catmull-Rom would be flat here too; the interesting case is that the
    // control points don't wander off the horizontal.
    const pts = sampleSeasonCurve(flat(0.5), START, END, 3.4, H, PAD);
    const ys = [...seasonLinePath(pts).matchAll(/-?[\d.]+ (-?[\d.]+)/g)].map(
      (m) => Number(m[1]),
    );
    for (const y of ys) expect(y).toBeCloseTo(pts[0].y, 5);
  });

  // The reason for monotone cubic over Catmull-Rom: a peak between two low
  // months must not overshoot the lane's bounds. Note this is a claim about the
  // *drawn curve*, not the control points — a bezier control point may sit
  // slightly outside the hull it steers, which is harmless. So walk the actual
  // cubic rather than reading the path's numbers.
  const curveExtremes = (d: string) => {
    const seg = [
      ...d.matchAll(
        /M (-?[\d.]+) (-?[\d.]+)|C (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+), (-?[\d.]+) (-?[\d.]+)/g,
      ),
    ];
    let y0 = Number(seg[0][2]);
    let min = y0;
    let max = y0;
    for (const s of seg.slice(1)) {
      const [c1y, c2y, y1] = [Number(s[4]), Number(s[6]), Number(s[8])];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const u = 1 - t;
        const y =
          u * u * u * y0 +
          3 * u * u * t * c1y +
          3 * u * t * t * c2y +
          t * t * t * y1;
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      y0 = y1;
    }
    return { min, max };
  };

  it("never overshoots the lane bounds, even on a hard spike", () => {
    const spike = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0] as unknown as SeasonCurve;
    const pts = sampleSeasonCurve(spike, START, END, 3.4, H, PAD);
    const { min, max } = curveExtremes(seasonLinePath(pts));
    expect(min).toBeGreaterThanOrEqual(PAD - 0.001);
    expect(max).toBeLessThanOrEqual(H - PAD + 0.001);
  });

  it("keeps every real season's drawn curve inside the lane", () => {
    for (const s of SEASONS) {
      const pts = sampleSeasonCurve(s.curve, START, END, 3.4, H, PAD);
      const { min, max } = curveExtremes(seasonLinePath(pts));
      expect(min, s.id).toBeGreaterThanOrEqual(PAD - 0.001);
      expect(max, s.id).toBeLessThanOrEqual(H - PAD + 0.001);
    }
  });
});

describe("seasonAreaPath", () => {
  it("closes the curve down to the baseline and back", () => {
    const pts: CurvePoint[] = [
      { x: 0, y: 10, v: 0.5 },
      { x: 10, y: 5, v: 0.8 },
    ];
    const d = seasonAreaPath(pts, H);
    expect(d.startsWith("M 0 10")).toBe(true);
    expect(d.endsWith(`L 10 ${H} L 0 ${H} Z`)).toBe(true);
  });

  it("returns empty for no points", () => {
    expect(seasonAreaPath([], H)).toBe("");
  });
});

describe("seasonMonthTicks", () => {
  it("emits one tick per month on the axis, and none beyond it", () => {
    // Unlike sampleSeasonCurve there's no lead-in or lead-out: a ruler tick
    // outside the axis is a label pointing at nothing.
    const ticks = seasonMonthTicks(START, END, 3.4);
    expect(ticks.length).toBe(24);
    expect(ticks[0].x).toBe(0);
  });

  it("puts each tick on the month's first day, where a gridline goes", () => {
    const ppd = 3.4;
    const ticks = seasonMonthTicks(START, END, ppd);
    // September 2026 is 30 days, so October starts 30 days in — and the curve
    // samples sit a half-month later, at the midpoints between these.
    expect(ticks[1].x).toBeCloseTo(30 * ppd, 5);
    expect(ticks[0].width).toBeCloseTo(30 * ppd, 5);
  });

  it("marks the fiscal quarter starts, not the calendar ones", () => {
    const ticks = seasonMonthTicks(START, END, 3.4);
    // Campminder's fiscal year opens in September, so quarters begin at
    // Sep/Dec/Mar/Jun — indices 0, 3, 6, 9 on an axis starting in September.
    const marked = ticks.flatMap((t, i) => (t.quarterStart ? [i] : []));
    expect(marked).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
  });

  it("shortens month labels when a month is too narrow to name", () => {
    // At year zoom (1.35 px/day) a month is ~40px wide; "Sep" doesn't fit.
    expect(seasonMonthTicks(START, END, 1.35)[0].label).toBe("S");
    expect(seasonMonthTicks(START, END, 3.4)[0].label).toBe("Sep");
  });
});
