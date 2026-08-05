"use client";

import { useState } from "react";
import {
  SEASON_LANES,
  laneColor,
  seasonColor,
  seasonIntensityAt,
  seasonsInLane,
  type Season,
  type SeasonLane,
} from "@/lib/loop/seasons";
import {
  sampleSeasonCurve,
  seasonAreaPath,
  seasonLinePath,
  seasonMonthTicks,
  seasonStripStops,
} from "@/lib/loop/season-curve";
import { fiscalSeasonLabel } from "@/lib/loop/logic";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

// A two-year axis is thousands of px wide, so a short row turns every curve
// into a shallow, unreadable slope — the rise and fall is the whole point. 46px
// buys enough amplitude to see a peak while staying visibly secondary to the
// 36px item rows. The gradient fill below does the rest of the work: the band's
// height carries the signal even where the line itself is gentle.
const ROW_H = 46;
const PAD = 4;

// The strip alternative. A strip carries intensity as density rather than
// height, so it doesn't need amplitude to be legible and a lane costs a third of
// the vertical space — the whole reason it's offered.
const STRIP_H = 22;

// The drawn bar is shorter than its row: adjacent strips at similar intensity
// merge into one block otherwise, and a lane of seven seasons reads as a single
// smear. The gap is what makes them seven.
const STRIP_BAR_H = STRIP_H - 4;

// How a lane draws its seasons. Both shapes read the same curve; they disagree
// about whether a season's intensity should be a height or a density.
type SeasonShape = "curve" | "strip";

// A zero month should read as an empty track rather than as nothing at all, and
// a peak has to stay light enough for a name pill to sit on it.
const stripOpacity = (v: number) => 0.06 + 0.78 * v;

interface Hover {
  season: Season;
  date: Date;
  value: number;
  x: number;
}

/**
 * The two seasonality lanes — `Camp Seasons` and `Campminder Seasons` — drawn as
 * a ridgeline above the roadmap. Each season is one small filled area curve
 * sharing the timeline's exact `rangeStart` + `ppd` geometry, so a peak sits
 * directly over the work scheduled into it.
 *
 * The lanes are read-only context: nothing here is draggable or editable, which
 * is why they take no mutation callbacks and behave identically in share mode.
 */
export function SeasonLanes({
  rangeStart,
  rangeEnd,
  ppd,
  totalWidth,
  open,
  onToggle,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  ppd: number;
  totalWidth: number;
  open: Record<SeasonLane, boolean>;
  onToggle: (lane: SeasonLane) => void;
}) {
  return (
    <>
      {SEASON_LANES.map((lane) => (
        <Lane
          key={lane.key}
          lane={lane}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          ppd={ppd}
          totalWidth={totalWidth}
          open={open[lane.key]}
          onToggle={() => onToggle(lane.key)}
        />
      ))}
    </>
  );
}

function Lane({
  lane,
  rangeStart,
  rangeEnd,
  ppd,
  totalWidth,
  open,
  onToggle,
}: {
  lane: (typeof SEASON_LANES)[number];
  rangeStart: Date;
  rangeEnd: Date;
  ppd: number;
  totalWidth: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  // Per lane, and transient like `open` above: the point of the choice is
  // comparing the two shapes on the same roadmap, which means one lane can be
  // curves while the other is strips.
  const [shape, setShape] = useState<SeasonShape>("curve");
  // Ordered by peak month, so the lane reads as one wave through the year
  // rather than a pile of humps — see seasonsInLane.
  const seasons = seasonsInLane(lane.key);
  const ticks = open ? seasonMonthTicks(rangeStart, rangeEnd, ppd) : [];
  const strips = shape === "strip";
  const rowH = strips ? STRIP_H : ROW_H;

  // Pointer x → the date under the cursor → that season's interpolated reading.
  // Interpolated rather than snapped to the month so the number tracks the drawn
  // curve; a reading that disagrees with the line above it reads as a bug.
  const onMove = (e: React.PointerEvent, season: Season) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const date = new Date(rangeStart);
    date.setDate(date.getDate() + Math.round(x / ppd));
    setHover({ season, date, value: seasonIntensityAt(season, date), x });
  };

  return (
    <div className={"tl-season-band" + (open ? " open" : "")}>
      <div className="tl-season-head">
        <button
          type="button"
          className="tl-mission-label tl-season-label"
          style={{ ["--season-lane-dot" as string]: laneColor(lane.key) }}
          aria-expanded={open}
          title={lane.desc}
          onClick={onToggle}
        >
          <span className="tl-season-toggle" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          {lane.label}
          {!open && <span className="tl-season-count">{seasons.length}</span>}
        </button>
        {/* Equal-height rows invite a comparison the model doesn't support:
            every curve is normalized to its own peak (see seasons.ts), so a tall
            row isn't a busier season than a short one. Say so where the rows
            are, not only in a tooltip nobody opens. */}
        {open && (
          <span className="tl-season-scale">
            each row scaled to its own peak
          </span>
        )}
        {/* Two ways to draw the same numbers. Curves show the shape of a season;
            strips show when it's hot, in a third of the height and without
            depending on amplitude the axis can't spare. Which one wins depends
            on the reader, so both stay. */}
        {open && (
          <span className="tl-season-shape" role="group" aria-label="Season shape">
            <button
              type="button"
              className={strips ? "" : "on"}
              aria-pressed={!strips}
              onClick={() => setShape("curve")}
            >
              Curves
            </button>
            <button
              type="button"
              className={strips ? "on" : ""}
              aria-pressed={strips}
              onClick={() => setShape("strip")}
            >
              Strips
            </button>
          </span>
        )}
      </div>

      {open && (
        <>
          {/* The timeline's month header is 300px+ above an open lane, which
              leaves the curves with no nearby time anchor. Repeat the ruler
              here, and carry the month boundaries down through the rows. */}
          <div className="tl-season-ruler" aria-hidden>
            {ticks.map((t, i) => (
              <span
                key={i}
                className={
                  "tl-season-tick" + (t.quarterStart ? " q" : "")
                }
                style={{ width: t.width }}
              >
                {t.label}
              </span>
            ))}
          </div>

          <div
            className={"tl-season-rows" + (strips ? " strips" : "")}
            style={{ height: seasons.length * rowH }}
          >
            {/* Drawn inside the band rather than relying on the timeline's own
                .tl-grid, which the band's opaque background paints over. In strip
                mode the rows are filled, so the CSS lifts this layer above them
                rather than letting the fill bury the only time anchor. */}
            <svg
              className="tl-season-gridlines"
              width={totalWidth}
              height={seasons.length * rowH}
              aria-hidden
            >
              {ticks.map((t, i) => (
                <line
                  key={i}
                  className={t.quarterStart ? "q" : undefined}
                  x1={t.x}
                  x2={t.x}
                  y1={0}
                  y2={seasons.length * rowH}
                />
              ))}
            </svg>

            {seasons.map((season) => {
              const color = seasonColor(season);
              const pts = sampleSeasonCurve(
                season.curve,
                rangeStart,
                rangeEnd,
                ppd,
                ROW_H,
                PAD,
              );
              const isHovered = hover?.season.id === season.id;
              return (
                <div
                  className={
                    "tl-season-row" +
                    (season.emphasis === "accent" ? " accent" : "") +
                    (strips ? " strip" : "")
                  }
                  style={{ height: rowH }}
                  key={season.id}
                  onPointerMove={(e) => onMove(e, season)}
                  onPointerLeave={() => setHover(null)}
                >
                  {strips ? (
                    <svg
                      className="tl-season-striprow"
                      width={totalWidth}
                      height={STRIP_H}
                      aria-hidden
                    >
                      {/* No <title>, for the same reason the curve below has
                          none (origin/main, "Stop the native SVG tooltip from
                          overlapping the season hover card"): the browser draws
                          one as a native tooltip that lands on top of
                          `.tl-season-tip`, which already carries this label and
                          description. A strip is a new place to make that same
                          mistake, so it doesn't. */}
                      <defs>
                        <linearGradient
                          id={`season-strip-${season.id}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="0"
                        >
                          {seasonStripStops(
                            season.curve,
                            rangeStart,
                            rangeEnd,
                            ppd,
                            totalWidth,
                          ).map((st, i) => (
                            <stop
                              key={i}
                              offset={st.offset}
                              stopColor={color}
                              stopOpacity={stripOpacity(st.v)}
                            />
                          ))}
                        </linearGradient>
                      </defs>
                      <rect
                        width={totalWidth}
                        height={STRIP_BAR_H}
                        fill={`url(#season-strip-${season.id})`}
                      />
                    </svg>
                  ) : (
                  <svg
                    className="tl-season-curve"
                    width={totalWidth}
                    height={ROW_H}
                    style={{ ["--season-color" as string]: color }}
                    aria-hidden
                  >
                    {/* No <title> here on purpose: the browser renders one as
                        a native tooltip that lands on top of `.tl-season-tip`,
                        which already carries this label and description. The svg
                        is aria-hidden, so a <title> buys nothing for assistive
                        tech either. */}
                    {/* Stops are inline rather than CSS-driven: SVG gradient
                        stops take the season's own color.
                        Densest just under the CREST and fading toward the
                        baseline. Loading the baseline instead reads better in
                        theory — ink where the area is — but these curves mostly
                        sit high, so it drew seven near-solid slabs that merged
                        into one mass. Fading down keeps the fill attached to the
                        line whose shape it's describing, and leaves the floor
                        clear enough that rows stay separate. The baseline gets
                        its own stroke below instead. */}
                    <defs>
                      <linearGradient
                        id={`season-fill-${season.id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={color}
                          stopOpacity="0.26"
                        />
                        <stop
                          offset="100%"
                          stopColor={color}
                          stopOpacity="0.04"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      className="tl-season-area"
                      fill={`url(#season-fill-${season.id})`}
                      d={seasonAreaPath(pts, ROW_H - PAD)}
                    />
                    {/* The zero line. Without it there's no reference for how
                        high a curve actually is. */}
                    <line
                      className="tl-season-base"
                      x1={0}
                      x2={totalWidth}
                      y1={ROW_H - PAD}
                      y2={ROW_H - PAD}
                    />
                    <path
                      className="tl-season-line"
                      d={seasonLinePath(pts)}
                      fill="none"
                    />
                  </svg>
                  )}
                  {/* Sticky, not absolute at x=0: the row is thousands of px
                      wide, so a name pinned to the row's own origin scrolls out
                      of view and leaves an unlabeled ridgeline behind. */}
                  <span className="tl-season-name-wrap">
                    <span
                      className="tl-season-name"
                      style={{ ["--season-color" as string]: color }}
                    >
                      {season.label}
                      {/* A curated curve is a written-down belief, not a
                          measurement. Say so on the surface where someone might
                          plan against it. */}
                      {season.source === "curated" && (
                        <span
                          className="tl-season-source"
                          title="Curated estimate — not measured from usage data"
                        >
                          est
                        </span>
                      )}
                    </span>
                  </span>
                  {isHovered && (
                    <>
                      <span
                        className="tl-season-hairline"
                        style={{ left: hover.x }}
                        aria-hidden
                      />
                      <span
                        className="tl-season-tip"
                        style={{ left: hover.x }}
                        role="status"
                      >
                        <strong>{season.label}</strong>
                        <span className="tl-season-tip-read">
                          {Math.round(hover.value * 100)}% of peak ·{" "}
                          {fiscalSeasonLabel(hover.date)} ·{" "}
                          {MONTH_DAY.format(hover.date)}
                        </span>
                        <span className="tl-season-tip-desc">
                          {season.description}
                        </span>
                        <span className="tl-season-tip-src">
                          {season.source === "curated"
                            ? "Curated estimate — no usage data connected yet"
                            : "Measured from usage data"}
                        </span>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
