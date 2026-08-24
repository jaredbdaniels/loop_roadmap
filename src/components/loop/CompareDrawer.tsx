"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GitCompare, Plus, Trash2 } from "lucide-react";
import { diffCount, diffStates } from "@/lib/loop/logic";
import type { LoopState, StateDiff } from "@/lib/loop/types";
import { useLoop } from "./store";

// Human labels for the diff field keys produced by diffStates.
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  mission: "Team",
  moduleId: "Module",
  type: "Type",
  stage: "Stage",
  horizon: "Horizon",
  order: "Lane position",
  targetStart: "Start",
  targetEnd: "End",
  killed: "Killed",
  reach: "Reach",
  confidence: "Confidence",
  strategicFit: "Strategic fit",
  "kr.metric": "KR metric",
  "kr.baseline": "KR baseline",
  "kr.target": "KR target",
  dependsOn: "Dependencies",
  betIds: "Bets",
  rank: "Priority score",
  color: "Color",
  description: "Description",
  date: "Date",
  level: "Confidence",
  reasoning: "Reasoning",
  whatWouldRaiseIt: "What would raise it",
  risks: "Risks",
  asks: "Asks",
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (Array.isArray(v)) return v.length ? `${v.length}` : "none";
  return String(v);
}

// A read-only "compare this draft to the live roadmap" panel. Fetches the live
// state fresh on open and diffs the in-view draft against it, so it always
// reflects live *now* (not the fork-time baseline).
export function CompareDrawer() {
  const {
    compareOpen,
    setCompareOpen,
    scenarioName,
    items,
    weights,
    bets,
    milestones,
    outlooks,
    draftMode,
  } = useLoop();
  const [diff, setDiff] = useState<StateDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/items", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const live = (await res.json()) as LoopState;
      const draft: LoopState = { items, weights, bets, milestones, outlooks };
      setDiff(diffStates(live, draft));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [items, weights, bets, milestones, outlooks]);

  useEffect(() => {
    if (compareOpen && draftMode) run();
  }, [compareOpen, draftMode, run]);

  if (!compareOpen) return null;

  const close = () => setCompareOpen(false);
  const total = diff ? diffCount(diff) : 0;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2>
            <GitCompare
              size={17}
              strokeWidth={2.2}
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            {scenarioName ?? "Draft"} vs. live roadmap
          </h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {loading && <p className="helper">Comparing…</p>}
          {error && (
            <p className="helper">Could not load the live roadmap to compare.</p>
          )}
          {diff && !loading && (
            <>
              <p className="helper" style={{ marginTop: 0 }}>
                {total === 0
                  ? "This draft matches the live roadmap exactly — nothing has changed yet."
                  : `${total} difference${total === 1 ? "" : "s"} from the live roadmap. None of this affects live until you promote it.`}
              </p>

              {diff.itemsAdded.length > 0 && (
                <Section
                  title="New bets"
                  icon={<Plus size={14} strokeWidth={2.4} />}
                >
                  {diff.itemsAdded.map((i) => (
                    <div key={i.id} className="cmp-row">
                      <strong>{i.title || "Untitled"}</strong>
                      <span className="cmp-tag">{i.mission}</span>
                    </div>
                  ))}
                </Section>
              )}

              {diff.itemsRemoved.length > 0 && (
                <Section
                  title="Removed"
                  icon={<Trash2 size={14} strokeWidth={2.4} />}
                >
                  {diff.itemsRemoved.map((i) => (
                    <div key={i.id} className="cmp-row">
                      <strong>{i.title || "Untitled"}</strong>
                      <span className="cmp-tag">{i.mission}</span>
                    </div>
                  ))}
                </Section>
              )}

              {diff.itemsChanged.length > 0 && (
                <Section title="Changed">
                  {diff.itemsChanged.map((c) => (
                    <div key={c.id} className="cmp-row cmp-row--stack">
                      <strong>{c.title || "Untitled"}</strong>
                      <ul className="cmp-changes">
                        {c.changes.map((ch, idx) => (
                          <li key={idx}>
                            {label(ch.field)}: <span>{fmt(ch.before)}</span>
                            <ArrowRight
                              size={12}
                              strokeWidth={2.4}
                              style={{ margin: "0 5px", verticalAlign: "-1px" }}
                            />
                            <span>{fmt(ch.after)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Section>
              )}

              {(diff.betsAdded.length > 0 ||
                diff.betsRemoved.length > 0 ||
                diff.betsChanged.length > 0) && (
                <Section title="Bets">
                  {diff.betsAdded.map((i) => (
                    <div key={i.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--add">added</span>
                      <strong>{i.title}</strong>
                    </div>
                  ))}
                  {diff.betsRemoved.map((i) => (
                    <div key={i.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--rm">removed</span>
                      <strong>{i.title}</strong>
                    </div>
                  ))}
                  {diff.betsChanged.map((c) => (
                    <div key={c.id} className="cmp-row">
                      <strong>{c.title}</strong>
                      <span className="cmp-sub">
                        {c.changes.map((ch) => label(ch.field)).join(", ")} changed
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              {(diff.milestonesAdded.length > 0 ||
                diff.milestonesRemoved.length > 0 ||
                diff.milestonesChanged.length > 0) && (
                <Section title="Milestones">
                  {diff.milestonesAdded.map((m) => (
                    <div key={m.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--add">added</span>
                      <strong>{m.title}</strong>
                    </div>
                  ))}
                  {diff.milestonesRemoved.map((m) => (
                    <div key={m.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--rm">removed</span>
                      <strong>{m.title}</strong>
                    </div>
                  ))}
                  {diff.milestonesChanged.map((c) => (
                    <div key={c.id} className="cmp-row">
                      <strong>{c.title}</strong>
                      <span className="cmp-sub">
                        {c.changes.map((ch) => label(ch.field)).join(", ")} changed
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              {(diff.outlooksAdded.length > 0 ||
                diff.outlooksRemoved.length > 0 ||
                diff.outlooksChanged.length > 0) && (
                <Section title="Delivery outlooks">
                  {diff.outlooksAdded.map((o) => (
                    <div key={o.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--add">added</span>
                      <strong>{o.mission}</strong>
                    </div>
                  ))}
                  {diff.outlooksRemoved.map((o) => (
                    <div key={o.id} className="cmp-row">
                      <span className="cmp-tag cmp-tag--rm">removed</span>
                      <strong>{o.mission}</strong>
                    </div>
                  ))}
                  {diff.outlooksChanged.map((c) => (
                    <div key={c.id} className="cmp-row">
                      <strong>{c.title}</strong>
                      <span className="cmp-sub">
                        {c.changes.map((ch) => label(ch.field)).join(", ")} changed
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              {diff.weights.length > 0 && (
                <Section title="Ranking weights">
                  {diff.weights.map((ch) => (
                    <div key={ch.field} className="cmp-row">
                      <strong>{label(ch.field)}</strong>
                      <span>
                        {fmt(ch.before)}
                        <ArrowRight
                          size={12}
                          strokeWidth={2.4}
                          style={{ margin: "0 5px", verticalAlign: "-1px" }}
                        />
                        {fmt(ch.after)}
                      </span>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <span />
          <button className="cm-button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cmp-section">
      <div className="cmp-section-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
