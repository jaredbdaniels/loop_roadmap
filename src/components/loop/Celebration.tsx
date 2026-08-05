"use client";

import { useMemo } from "react";
import type { Celebration as Celeb } from "./store";
import { useLoop } from "./store";

// Confetti palette — a bright rainbow that reads over both the light canvas
// and any open modal. Deliberately not the muted brand tokens: a party wants
// saturation.
const CONFETTI_COLORS = [
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
  "#1dd1a1",
  "#5f27cd",
  "#ff9ff3",
  "#54a0ff",
];

// Deterministic pseudo-random from an integer seed so a burst's confetti is
// stable across the component's re-renders (no Math.random churn per frame),
// yet each burst id gives a different-looking shower.
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Burst({ celebration }: { celebration: Celeb }) {
  const { kind, emoji, label, id } = celebration;

  // Confetti rains for a ship only; every other kind is emoji-only.
  const pieces = useMemo(() => {
    if (kind !== "ship") return [];
    const rnd = seeded(id * 7919 + 13);
    return Array.from({ length: 46 }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
      delay: rnd() * 0.5,
      duration: 1.5 + rnd() * 1.1,
      drift: (rnd() - 0.5) * 32,
      rot: 360 + Math.floor(rnd() * 540),
      w: 7 + Math.floor(rnd() * 5),
      h: 10 + Math.floor(rnd() * 8),
      round: rnd() > 0.7,
    }));
  }, [id, kind]);

  // A backward move sinks and fades — no streak, no confetti.
  if (kind === "regress") {
    return (
      <div className="celebrate-burst">
        <div className="celebrate-deflate">
          <span className="celebrate-creature">{emoji}</span>
        </div>
        {label && (
          <div className="celebrate-caption regress">{label}</div>
        )}
      </div>
    );
  }

  // A vote is a quick little chip that pops up and fades.
  if (kind === "vote") {
    return (
      <div className="celebrate-burst">
        <div className="celebrate-vote">
          <span className="celebrate-vote-plus">+1</span>
          <span className="celebrate-vote-emoji">{emoji}</span>
        </div>
      </div>
    );
  }

  // Killing an idea gets a somber emoji with a rising puff of smoke.
  if (kind === "kill") {
    return (
      <div className="celebrate-burst">
        <div className="celebrate-kill">
          <span className="celebrate-kill-puff" />
          <span className="celebrate-creature">{emoji}</span>
        </div>
        {label && <div className="celebrate-caption kill">{label}</div>}
      </div>
    );
  }

  // ship + advance: a creature streaks across; ship also rains confetti.
  const mini = kind === "advance";
  return (
    <div className="celebrate-burst">
      {pieces.map((p) => (
        <span
          key={p.key}
          className="confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              width: `${p.w}px`,
              height: `${p.h}px`,
              borderRadius: p.round ? "50%" : "2px",
              "--dur": `${p.duration}s`,
              "--delay": `${p.delay}s`,
              "--drift": `${p.drift}vw`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}

      <div className={"celebrate-runner" + (mini ? " mini" : "")}>
        <span className="celebrate-trail" />
        <span className="celebrate-creature">{emoji}</span>
      </div>

      {label && (
        <div className={"celebrate-caption" + (mini ? " mini" : "")}>
          {label}
        </div>
      )}
    </div>
  );
}

export function Celebration() {
  const { celebrations } = useLoop();
  if (!celebrations.length) return null;
  return (
    <div className="celebrate-layer" aria-hidden>
      {celebrations.map((c) => (
        <Burst key={c.id} celebration={c} />
      ))}
    </div>
  );
}
