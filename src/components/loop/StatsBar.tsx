"use client";

import {
  LayoutList,
  Target,
  CircleCheckBig,
  Timer,
  Ban,
} from "lucide-react";
import { computeStats } from "@/lib/loop/logic";
import { useLoop } from "./store";

export function StatsBar() {
  const { items } = useLoop();
  const s = computeStats(items);

  const stats = [
    {
      icon: LayoutList,
      label: "Active items",
      value: s.total,
      hint: "live across all stages",
    },
    {
      icon: Target,
      label: "Framed with problem + KR",
      value: `${s.framedRate}%`,
      hint: "of items past Capture",
    },
    {
      icon: CircleCheckBig,
      label: "Shipped with outcome read",
      value: `${s.learnRate}%`,
      hint: "closes the Learn loop",
    },
    {
      icon: Timer,
      label: "Median days, capture → decision",
      value: s.median === null ? "—" : s.median,
      hint: "committed or killed",
    },
    {
      icon: Ban,
      label: "Ideas killed",
      value: `${s.killRate}%`,
      hint: `${s.killedCount} retired to date`,
    },
  ];

  return (
    <section className="stats-bar" aria-label="Outcome metrics">
      {stats.map((st) => {
        const Icon = st.icon;
        return (
          <div className="stat" key={st.label}>
            <div className="stat-top">
              <span className="stat-icon" aria-hidden>
                <Icon size={16} strokeWidth={2.2} />
              </span>
              <div className="stat-label">{st.label}</div>
            </div>
            <div className="stat-value">{st.value}</div>
            <div className="stat-hint">{st.hint}</div>
          </div>
        );
      })}
    </section>
  );
}
