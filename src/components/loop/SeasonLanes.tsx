"use client";

import { useState } from "react";
import {
  SEASON_LANES,
  seasonIntensityAt,
  seasonsInLane,
  type Season,
  type SeasonLane,
} from "@/lib/loop/seasons";
import {
  sampleSeasonCurve,
  seasonAreaPath,
  seasonLinePath,
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
  const seasons = seasonsInLane(lane.key);

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
      <button
        type="button"
        className="tl-mission-label tl-season-label"
        style={{ ["--season-lane-dot" as string]: seasons[0]?.color }}
        aria-expanded={open}
        title={lane.desc}
        onClick={onToggle}
      >
        <span className="tl-season-toggle" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        {lane.label}
        {!open && (
          <span className="tl-season-count">{seasons.length}</span>
        )}
      </button>

      {open &&
        seasons.map((season) => {
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
              className="tl-season-row"
              key={season.id}
              onPointerMove={(e) => onMove(e, season)}
              onPointerLeave={() => setHover(null)}
            >
              <svg
                className="tl-season-curve"
                width={totalWidth}
                height={ROW_H}
                style={{ ["--season-color" as string]: season.color }}
                aria-hidden
              >
                {/* No <title> here on purpose: the browser renders one as a
                    native tooltip that lands on top of `.tl-season-tip`, which
                    already carries this label and description. The svg is
                    aria-hidden, so a <title> buys nothing for assistive tech
                    either. */}
                {/* Stops are inline rather than CSS-driven: SVG gradient stops
                    take the season's own color, and the fade to the baseline is
                    what makes a peak read as a peak at this aspect ratio. */}
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
                      stopColor={season.color}
                      stopOpacity="0.34"
                    />
                    <stop
                      offset="100%"
                      stopColor={season.color}
                      stopOpacity="0.03"
                    />
                  </linearGradient>
                </defs>
                <path
                  className="tl-season-area"
                  fill={`url(#season-fill-${season.id})`}
                  d={seasonAreaPath(pts, ROW_H - PAD)}
                />
                <path
                  className="tl-season-line"
                  d={seasonLinePath(pts)}
                  fill="none"
                />
              </svg>
              <span
                className="tl-season-name"
                style={{ ["--season-color" as string]: season.color }}
              >
                {season.label}
                {/* A curated curve is a written-down belief, not a measurement.
                    Say so on the surface where someone might plan against it. */}
                {season.source === "curated" && (
                  <span className="tl-season-source" title="Curated estimate — not measured from usage data">
                    est
                  </span>
                )}
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
  );
}
