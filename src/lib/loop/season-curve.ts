// Geometry for the seasonality lanes: turning a season's twelve monthly
// intensity samples (seasons.ts) into an SVG area path that shares the timeline's
// coordinate space exactly, so a peak lines up with the bars underneath it.
//
// Kept pure and separate from the component so the math is unit-testable — a
// curve that's subtly misaligned or dips below its baseline is the kind of bug
// you can stare past on screen.

import {
  daysBetween,
  fiscalMonthOffset,
  isFiscalQuarterStartMonth,
} from "./logic";
import { curveIntensityAt, type SeasonCurve } from "./seasons";

export interface CurvePoint {
  x: number; // px from the axis origin; negative for the lead-in month
  y: number;
  v: number; // the intensity this point was drawn from, 0..1
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Sample a season's curve once per month across the axis.
 *
 * Samples sit at each month's MIDPOINT, not its first day: anchoring at the
 * start would draw every curve half a month early, so a summer peak would lean
 * into May. One extra month is emitted beyond each end of the axis (at negative
 * x on the left) so the curve enters and leaves the viewport at its true slope
 * instead of flattening against the edge — SVG clips the overhang.
 */
export function sampleSeasonCurve(
  curve: SeasonCurve,
  start: Date,
  end: Date,
  ppd: number,
  height: number,
  pad: number,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  // The axis draws months while cursor < end, so its last month is the one
  // before `end`. Stopping one month later than that emits exactly one lead-out.
  const stop = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  const span = height - 2 * pad;
  while (cursor < stop) {
    const v = curve[fiscalMonthOffset(cursor)];
    points.push({
      x: daysBetween(start, cursor) * ppd + (daysInMonth(cursor) * ppd) / 2,
      y: height - pad - v * span,
      v,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

export interface StripStop {
  offset: number; // 0..1 along the axis, for an SVG gradient stop
  v: number; // intensity there, 0..1
}

/**
 * The same twelve samples, as gradient stops for a season drawn as an intensity
 * STRIP rather than a ridgeline.
 *
 * A ridgeline needs height to be legible, and these lanes are 46px tall against
 * a month that's 100–240px wide — a full 0→peak swing draws as a ~10° slope,
 * which is why the curves read as gentle wobbles no matter how they're styled.
 * A strip encodes the same intensity as density instead of height, so it reads
 * identically at every zoom and in a third of the vertical space.
 *
 * The end stops are interpolated at the axis edges rather than borrowed from the
 * nearest month midpoint, so a strip starts at the value that actually belongs
 * at x=0 instead of holding the first month's reading flat for half a month.
 */
export function seasonStripStops(
  curve: SeasonCurve,
  start: Date,
  end: Date,
  ppd: number,
  width: number,
): StripStop[] {
  const edges = [
    { offset: 0, v: curveIntensityAt(curve, start) },
    { offset: 1, v: curveIntensityAt(curve, end) },
  ];
  // A zero-width axis has no interior to interpolate across, and dividing by it
  // would emit NaN offsets — which SVG renders as no gradient at all.
  if (width <= 0) return edges;
  // Height and pad don't affect x or v; only the y this throws away.
  const interior = sampleSeasonCurve(curve, start, end, ppd, 1, 0)
    .filter((p) => p.x > 0 && p.x < width)
    .map((p) => ({ offset: p.x / width, v: p.v }));
  return [edges[0], ...interior, edges[1]];
}

export interface MonthTick {
  x: number; // px of the month's first day
  width: number; // px the month occupies
  label: string;
  quarterStart: boolean;
}

/**
 * One tick per month across the axis, for the ruler drawn inside an open lane.
 *
 * The timeline's own month header already exists, but an open lane is 300px+
 * tall, which puts that header far off the top of the curves — and a periodic
 * curve with no visible month boundaries can only be read as "busy sometime
 * around there". So the lane repeats the ruler locally.
 *
 * Same `start`/`ppd` geometry as sampleSeasonCurve, and quarter boundaries come
 * from the fiscal calendar rather than `month % 3`, so the ticks land exactly
 * where the timeline's own gridlines do.
 */
export function seasonMonthTicks(
  start: Date,
  end: Date,
  ppd: number,
): MonthTick[] {
  const ticks: MonthTick[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor < end) {
    ticks.push({
      x: daysBetween(start, cursor) * ppd,
      width: daysInMonth(cursor) * ppd,
      // At year zoom a month is ~40px wide, which fits "S" but not "Sep".
      label: cursor.toLocaleDateString("en-US", {
        month: ppd < 2 ? "narrow" : "short",
      }),
      quarterStart: isFiscalQuarterStartMonth(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

/**
 * Monotone cubic tangents (Fritsch–Carlson).
 *
 * Deliberately not Catmull-Rom, which overshoots around a peak: on data bounded
 * to 0..1 that draws intensity above the lane or dipping below its baseline
 * between two low months. A curve that reads as negative demand is a visible
 * lie, so the interpolant is constrained to stay monotone between samples.
 */
function monotoneTangents(pts: CurvePoint[]): number[] {
  const n = pts.length;
  if (n < 2) return new Array(n).fill(0);

  const secant: number[] = [];
  for (let i = 0; i < n - 1; i++)
    secant.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));

  const m: number[] = new Array(n);
  m[0] = secant[0];
  m[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (secant[i - 1] + secant[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) {
      // A flat segment must stay flat, or the curve bulges between two equal
      // months — which is exactly how a fake second peak appears.
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    // Flatten a tangent that points against the segment — that's what stops the
    // curve from rising past a peak before it turns back down.
    if (m[i] / secant[i] < 0) m[i] = 0;
    if (m[i + 1] / secant[i] < 0) m[i + 1] = 0;
    // Re-derive from the (possibly zeroed) tangents before the circle clamp.
    // Clamping against the pre-zeroed values would write the flattening back
    // out again, and the curve would overshoot at exactly the peaks.
    const a = m[i] / secant[i];
    const b = m[i + 1] / secant[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * secant[i];
      m[i + 1] = t * b * secant[i];
    }
  }
  return m;
}

/** The smoothed stroke along the top of a season's curve. */
export function seasonLinePath(pts: CurvePoint[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const m = monotoneTangents(pts);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    const c1x = pts[i].x + h / 3;
    const c1y = pts[i].y + (m[i] * h) / 3;
    const c2x = pts[i + 1].x - h / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * h) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

/** The same curve closed down to the baseline, for the fill. */
export function seasonAreaPath(pts: CurvePoint[], baseline: number): string {
  const line = seasonLinePath(pts);
  if (!line) return "";
  const last = pts[pts.length - 1];
  return `${line} L ${last.x} ${baseline} L ${pts[0].x} ${baseline} Z`;
}
