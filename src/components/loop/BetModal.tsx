"use client";

import { useEffect, useState } from "react";
import {
  BET_COLORS,
  BET_GOAL_AREAS,
  BET_GOAL_AREA_LABELS,
  BET_STATUSES,
  BET_STATUS_LABELS,
  BET_THEMES,
  BET_THEME_LABELS,
  BET_TIERS,
  BET_TIER_LABELS,
  BET_VALUE_BASES,
  BET_VALUE_BASIS_LABELS,
  BET_VALUE_TYPES,
  BET_VALUE_TYPE_LABELS,
  BET_VERDICTS,
  BET_VERDICT_LABELS,
  HORIZONS,
  OWNERS,
  PLANNED_HORIZONS,
  STAGES,
  STAGE_COLORS,
} from "@/lib/loop/constants";
import {
  betChangeLog,
  betEnvelope,
  betFundedShare,
  betJtbdScope,
  betReach,
  betTeams,
  fmtRange,
  genId,
  plannedShareTotal,
  toISODate,
} from "@/lib/loop/logic";
import { JTBDS, getJtbd } from "@/lib/loop/taxonomy";
import type { Bet, Item, PlannedHorizon } from "@/lib/loop/types";
import { useLoop } from "./store";

// Create or edit a strategic bet. The form is ordered as the six blocks in
// docs/strategic-bets.md, so reading top to bottom answers "should we keep
// funding this?": the claim, the measure, the scope, the investment, the
// delivery state, the decision.
//
// Everything factual stays derived. The bet declares intent — a thesis, the
// JTBDs it means to reshape, an intended share of capacity — and the teams,
// dates, epic counts and actual share are computed from the linked items. The
// two are shown side by side precisely so they can disagree visibly.
export function BetModal() {
  const {
    betEdit,
    betFocus,
    closeBet,
    bets,
    items,
    createBet,
    updateBet,
    removeBet,
    updateItem,
    toast,
  } = useLoop();

  const existing =
    betEdit && betEdit !== "new"
      ? bets.find((b) => b.id === betEdit) ?? null
      : null;
  const isNew = betEdit === "new";

  // Keyed by the target bet so switching which one is open resets the form.
  return betEdit ? (
    <BetForm
      key={betEdit}
      existing={existing}
      isNew={isNew}
      focusField={betFocus}
      items={items}
      bets={bets}
      onClose={closeBet}
      onCreate={createBet}
      onUpdate={updateBet}
      onDelete={removeBet}
      onUpdateItem={updateItem}
      toast={toast}
    />
  ) : null;
}

// A blank bet. Defaults are deliberately unflattering — `guess` basis, evidence
// 1, tier "experiment" — so a bet has to earn its claims rather than arrive
// pre-credited.
function emptyBet(id: string): Bet {
  const now = new Date().toISOString();
  return {
    id,
    title: "",
    description: "",
    thesis: "",
    whyNow: "",
    tier: "experiment",
    theme: "grow",
    goalArea: "product-strategy",
    sponsor: "",
    owner: "",
    status: "proposed",
    horizon: null,
    confidence: 3,
    reversibility: 3,
    value: {
      statement: "",
      type: "new-revenue",
      magnitude: null,
      basis: "guess",
      timeToValue: null,
    },
    evidence: { strength: 1, notes: "", links: [] },
    outcomes: [],
    jtbdIds: [],
    plannedShare: { now: 0, next: 0, later: 0 },
    killCriteria: "",
    nextReview: null,
    decision: { verdict: null, rationale: "", decidedAt: null },
    color: BET_COLORS[0],
    activity: [],
    createdAt: now,
    updatedAt: now,
  };
}

function BetForm({
  existing,
  isNew,
  focusField,
  items,
  bets,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onUpdateItem,
  toast,
}: {
  existing: Bet | null;
  isNew: boolean;
  // A field id to land on, set when the editor was opened from a blank in the
  // bet detail's lede. Null for an ordinary open.
  focusField: string | null;
  items: Item[];
  bets: Bet[];
  onClose: () => void;
  onCreate: (b: Bet) => void;
  onUpdate: (b: Bet) => void;
  onDelete: (id: string) => void;
  onUpdateItem: (i: Item) => void;
  toast: (msg: string, warn?: boolean) => void;
}) {
  // A stable id up front so linking items can reference the bet before it saves.
  const [betId] = useState(() => existing?.id ?? genId());
  const [draft, setDraft] = useState<Bet>(
    () => existing ?? emptyBet(betId),
  );
  // Links are edited locally and reconciled onto the items at save, mirroring
  // how the old initiative modal handled membership.
  const [linkedIds, setLinkedIds] = useState<string[]>(
    existing ? items.filter((i) => (i.betIds || []).includes(existing.id)).map((i) => i.id) : [],
  );
  const [fundedIds, setFundedIds] = useState<string[]>(
    existing ? items.filter((i) => i.fundedBetId === existing.id).map((i) => i.id) : [],
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // Land on the field the reader clicked. The bet detail renders an empty
  // declared field as a blank in the middle of a sentence, and the point of
  // that is a one-click path from noticing the gap to typing into it — landing
  // at the top of a six-block form and hunting for the right box is not that.
  //
  // Runs once per open: the modal is keyed by bet id, so switching bets
  // remounts and re-runs it, while typing does not.
  useEffect(() => {
    if (!focusField) return;
    const el = document.getElementById(`bet-field-${focusField}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [focusField]);

  const set = <K extends keyof Bet>(key: K, v: Bet[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const linkedItems = linkedIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);

  // A preview of what the roadmap would look like with this draft applied, so
  // the derived panels react to link changes before anything is saved.
  const previewItems = items.map((i) => {
    const linked = linkedIds.includes(i.id);
    const betIds = linked
      ? [...new Set([...(i.betIds || []), betId])]
      : (i.betIds || []).filter((b) => b !== betId);
    let fundedBetId = i.fundedBetId;
    if (fundedIds.includes(i.id)) fundedBetId = betId;
    else if (fundedBetId === betId) fundedBetId = null;
    return { ...i, betIds, fundedBetId };
  });
  const previewBet = { ...draft, id: betId };

  const funded = betFundedShare(previewBet, previewItems);
  const reach = betReach(previewBet, previewItems);
  const teams = betTeams(previewBet, previewItems);
  const env = betEnvelope(previewBet, previewItems);
  const scope = betJtbdScope(previewBet, previewItems);
  const unstaffed = scope.filter((s) => s.declared && s.items.length === 0);
  const undeclared = scope.filter((s) => !s.declared);

  // Candidates for the picker: every item not already linked, narrowed by query.
  const q = query.trim().toLowerCase();
  const matches = items
    .filter((i) => !linkedIds.includes(i.id))
    .filter((i) => (q ? i.title.toLowerCase().includes(q) : true));

  const addItem = (id: string) => {
    setLinkedIds((prev) => [...prev, id]);
    // Linking is the common case and one bet is the common shape, so default to
    // funding it. If another bet already pays, leave that alone — taking over
    // someone else's funding should be a deliberate click, not a side effect.
    const item = items.find((i) => i.id === id);
    if (item && !item.fundedBetId) setFundedIds((prev) => [...prev, id]);
  };
  const removeLink = (id: string) => {
    setLinkedIds((prev) => prev.filter((x) => x !== id));
    setFundedIds((prev) => prev.filter((x) => x !== id));
  };
  const toggleFunded = (id: string) =>
    setFundedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleJtbd = (id: string) =>
    set(
      "jtbdIds",
      draft.jtbdIds.includes(id)
        ? draft.jtbdIds.filter((j) => j !== id)
        : [...draft.jtbdIds, id],
    );

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      toast("Give the bet a title first.", true);
      return;
    }
    const nowIso = new Date().toISOString();
    // Link churn is counted before the reconciliation below writes it, because
    // that loop mutates items rather than returning a delta.
    const linkDelta = {
      added: linkedIds.filter(
        (id) => !(items.find((i) => i.id === id)?.betIds || []).includes(betId),
      ).length,
      removed: items.filter(
        (i) => (i.betIds || []).includes(betId) && !linkedIds.includes(i.id),
      ).length,
    };
    const bet: Bet = {
      ...draft,
      id: betId,
      title,
      activity: [
        ...(draft.activity || []),
        ...(isNew || !existing
          ? ["Bet created."]
          : betChangeLog(existing, draft, linkDelta)),
      ],
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    if (isNew) onCreate(bet);
    else onUpdate(bet);

    // Reconcile membership and funding onto the items, which is where both
    // live. Only items whose link or funder actually changed are written.
    items.forEach((i) => {
      const hadLink = (i.betIds || []).includes(betId);
      const hasLink = linkedIds.includes(i.id);
      const hadFund = i.fundedBetId === betId;
      const hasFund = fundedIds.includes(i.id) && hasLink;
      if (hadLink === hasLink && hadFund === hasFund) return;
      const betIds = hasLink
        ? [...new Set([...(i.betIds || []), betId])]
        : (i.betIds || []).filter((b) => b !== betId);
      // Unfunding here means "this bet no longer pays", never "nobody pays" —
      // another bet's claim on the item is left untouched.
      const fundedBetId = hasFund ? betId : hadFund ? null : i.fundedBetId;
      onUpdateItem({ ...i, betIds, fundedBetId, updatedAt: nowIso });
    });

    toast(isNew ? "Bet created." : "Bet saved.");
    onClose();
  };

  const del = () => {
    if (!existing) return;
    const stamp = new Date().toISOString();
    items
      .filter(
        (i) => (i.betIds || []).includes(existing.id) || i.fundedBetId === existing.id,
      )
      .forEach((i) =>
        onUpdateItem({
          ...i,
          betIds: (i.betIds || []).filter((id) => id !== existing.id),
          fundedBetId: i.fundedBetId === existing.id ? null : i.fundedBetId,
          updatedAt: stamp,
        }),
      );
    onDelete(existing.id);
    toast("Bet deleted.");
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>{isNew ? "New bet" : "Edit bet"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {/* ---------- 1. The claim ---------- */}
          <h3 className="bet-section">The claim</h3>
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              placeholder="e.g. Parent Experience Convergence"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="field" id="bet-field-thesis">
            <label>Thesis</label>
            <p className="helper" style={{ margin: "0 0 6px" }}>
              We believe X produces Y because Z — the answer to &ldquo;why are we
              betting in this area at all?&rdquo;
            </p>
            <textarea
              value={draft.thesis}
              onChange={(e) => set("thesis", e.target.value)}
            />
          </div>
          <div className="field" id="bet-field-whyNow">
            <label>Why now</label>
            <textarea
              placeholder="The timing or competitive window."
              value={draft.whyNow}
              onChange={(e) => set("whyNow", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="bet-grid">
            <Select
              label="Tier"
              value={draft.tier}
              options={BET_TIERS.map((t) => [t, BET_TIER_LABELS[t]])}
              onChange={(v) => set("tier", v as Bet["tier"])}
            />
            <Select
              label="Theme"
              value={draft.theme}
              options={BET_THEMES.map((t) => [t, BET_THEME_LABELS[t]])}
              onChange={(v) => set("theme", v as Bet["theme"])}
            />
            <Select
              label="Goal area"
              value={draft.goalArea}
              options={BET_GOAL_AREAS.map((g) => [g, BET_GOAL_AREA_LABELS[g]])}
              onChange={(v) => set("goalArea", v as Bet["goalArea"])}
            />
            <Select
              label="Status"
              value={draft.status}
              options={BET_STATUSES.map((s) => [s, BET_STATUS_LABELS[s]])}
              onChange={(v) => set("status", v as Bet["status"])}
            />
            <Select
              label="Horizon"
              value={draft.horizon ?? ""}
              options={[
                ["", "—"] as [string, string],
                ...HORIZONS.map((h) => [h.key, h.label] as [string, string]),
              ]}
              onChange={(v) => set("horizon", (v || null) as Bet["horizon"])}
            />
            <Select
              label="Owner"
              value={draft.owner}
              options={[
                ["", "Unassigned"] as [string, string],
                ...OWNERS.map((o) => [o, o] as [string, string]),
              ]}
              onChange={(v) => set("owner", v)}
            />
          </div>
          <div className="field">
            <label>Sponsor</label>
            <input
              type="text"
              placeholder="The exec accountable for this bet."
              value={draft.sponsor}
              onChange={(e) => set("sponsor", e.target.value)}
            />
          </div>
          <div className="bet-grid">
            <Score
              label="Confidence"
              value={draft.confidence}
              onChange={(n) => set("confidence", n)}
              hint="How sure are we the thesis holds?"
            />
            <Score
              label="Reversibility"
              value={draft.reversibility}
              onChange={(n) => set("reversibility", n)}
              hint="How cheaply can we stop? 1 = one-way door."
            />
            <Score
              label="Evidence"
              value={draft.evidence.strength}
              onChange={(n) =>
                set("evidence", { ...draft.evidence, strength: n })
              }
              hint="What backs the thesis today?"
            />
          </div>
          <div className="field">
            <label>Evidence notes</label>
            <textarea
              placeholder="Research, competitive loss data, a prototype reading…"
              value={draft.evidence.notes}
              onChange={(e) =>
                set("evidence", { ...draft.evidence, notes: e.target.value })
              }
            />
          </div>

          {/* ---------- 2. The measure ---------- */}
          <h3 className="bet-section">The measure</h3>
          <p className="helper" style={{ margin: "0 0 8px" }}>
            The bet&rsquo;s own value and KPIs, stated here rather than summed
            from its epics&rsquo; KRs — those measure whether one piece of work
            moved its own metric, which doesn&rsquo;t add up to a portfolio
            number.
          </p>
          <div className="field">
            <label>Value statement</label>
            <input
              type="text"
              placeholder="What this is worth, and to whom."
              value={draft.value.statement}
              onChange={(e) =>
                set("value", { ...draft.value, statement: e.target.value })
              }
            />
          </div>
          <div className="bet-grid">
            <Select
              label="Value type"
              value={draft.value.type}
              options={BET_VALUE_TYPES.map((t) => [t, BET_VALUE_TYPE_LABELS[t]])}
              onChange={(v) =>
                set("value", { ...draft.value, type: v as Bet["value"]["type"] })
              }
            />
            <div className="field" id="bet-field-value">
              <label>Magnitude ($)</label>
              <input
                type="number"
                value={draft.value.magnitude ?? ""}
                onChange={(e) =>
                  set("value", {
                    ...draft.value,
                    magnitude:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <Select
              label="Basis"
              value={draft.value.basis}
              options={BET_VALUE_BASES.map((b) => [b, BET_VALUE_BASIS_LABELS[b]])}
              onChange={(v) =>
                set("value", {
                  ...draft.value,
                  basis: v as Bet["value"]["basis"],
                })
              }
            />
            <div className="field">
              <label>Time to value (quarters)</label>
              <input
                type="number"
                value={draft.value.timeToValue ?? ""}
                onChange={(e) =>
                  set("value", {
                    ...draft.value,
                    timeToValue:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          {draft.value.magnitude !== null && draft.value.basis === "guess" && (
            <p className="helper bet-warn">
              A guessed magnitude is allowed, but it keeps this bet out of the
              value-density comparison. Model or benchmark it to make it
              comparable.
            </p>
          )}

          {/* ---------- 3. The scope ---------- */}
          <h3 className="bet-section">The scope</h3>
          <div className="field">
            <label>Declared JTBDs</label>
            <p className="helper" style={{ margin: "0 0 8px" }}>
              What this bet intends to reshape. Declared here, then reconciled
              against where its epics actually land.
            </p>
            <div className="bet-jtbd-picker">
              {JTBDS.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  className={
                    "bet-jtbd" + (draft.jtbdIds.includes(j.id) ? " active" : "")
                  }
                  aria-pressed={draft.jtbdIds.includes(j.id)}
                  onClick={() => toggleJtbd(j.id)}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </div>
          {(unstaffed.length > 0 || undeclared.length > 0) && (
            <div className="field">
              <label>Reconciliation</label>
              {unstaffed.length > 0 && (
                <p className="helper bet-warn">
                  Claimed, nothing staffed:{" "}
                  {unstaffed.map((s) => getJtbd(s.jtbdId)?.label ?? s.jtbdId).join(", ")}
                </p>
              )}
              {undeclared.length > 0 && (
                <p className="helper bet-warn">
                  Work outside the declaration:{" "}
                  {undeclared
                    .map(
                      (s) =>
                        `${getJtbd(s.jtbdId)?.label ?? s.jtbdId} (${s.items.length})`,
                    )
                    .join(", ")}
                </p>
              )}
            </div>
          )}

          {/* ---------- 4. The investment ---------- */}
          <h3 className="bet-section">The investment</h3>
          <div className="field">
            <label>Planned share of capacity (%)</label>
            <p className="helper" style={{ margin: "0 0 8px" }}>
              {draft.tier === "foundational"
                ? "Intended share per horizon. Only foundational bets take part in the allocation math."
                : "Experiments don’t carry a share — set the tier to Foundational to allocate capacity."}
            </p>
            <div className="bet-grid">
              {PLANNED_HORIZONS.map((h) => {
                const others =
                  plannedShareTotal(
                    bets.filter((b) => b.id !== betId),
                    h,
                  ) + (draft.tier === "foundational" ? draft.plannedShare[h] : 0);
                return (
                  <div className="field" key={h}>
                    <label>{HORIZONS.find((x) => x.key === h)?.label ?? h}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={draft.tier !== "foundational"}
                      value={draft.plannedShare[h]}
                      onChange={(e) =>
                        set("plannedShare", {
                          ...draft.plannedShare,
                          [h]: Math.min(
                            100,
                            Math.max(0, Number(e.target.value) || 0),
                          ),
                        } as Record<PlannedHorizon, number>)
                      }
                    />
                    {others > 100 && (
                      <span className="helper bet-warn">
                        All bets total {others}% here
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label>Actual (derived)</label>
            <p className="helper" style={{ margin: 0 }}>
              Funded {funded.share}% — {funded.epics} epic
              {funded.epics === 1 ? "" : "s"}, {funded.quarters} epic-quarter
              {funded.quarters === 1 ? "" : "s"}.
              {reach.quarters > funded.quarters && (
                <>
                  {" "}
                  Reaches work totalling {reach.share}% ({reach.epics} epic
                  {reach.epics === 1 ? "" : "s"}) once the work other bets fund
                  is counted.
                </>
              )}
              <br />
              {teams.length > 0 ? `Teams: ${teams.join(", ")}` : "No team yet"}
              {env
                ? ` · ${fmtRange({
                    targetStart: toISODate(env.start),
                    targetEnd: toISODate(env.end),
                  })}`
                : " · not scheduled yet"}
            </p>
          </div>

          {/* ---------- 5. The delivery state ---------- */}
          <h3 className="bet-section">The work</h3>
          <div className="field">
            <label>Linked epics</label>
            <p className="helper" style={{ margin: "0 0 8px" }}>
              One bet funds an epic; the rest are enabled by it. Toggle{" "}
              <em>Funds</em> to say whose capacity it counts against — that is
              what keeps the shares above from double-counting.
            </p>
            {linkedItems.length > 0 ? (
              <div className="bet-links">
                {linkedItems.map((i) => {
                  const isFunded = fundedIds.includes(i.id);
                  const otherFunder =
                    !isFunded && i.fundedBetId && i.fundedBetId !== betId
                      ? bets.find((b) => b.id === i.fundedBetId)
                      : null;
                  return (
                    <div
                      key={i.id}
                      className="bet-link"
                      style={{ ["--dep-color" as string]: STAGE_COLORS[i.stage] }}
                    >
                      <span className="bet-link-title">
                        {i.title}
                        {i.killed ? " (killed)" : ""}
                      </span>
                      <span className="bet-link-meta">
                        {i.killed ? "Killed" : i.mission || "No team"} · {i.stage}
                        {otherFunder ? ` · funded by ${otherFunder.title}` : ""}
                      </span>
                      <button
                        type="button"
                        className={"bet-fund" + (isFunded ? " active" : "")}
                        aria-pressed={isFunded}
                        onClick={() => toggleFunded(i.id)}
                        title={
                          isFunded
                            ? "This bet pays for this epic"
                            : "This bet is enabled by this epic but doesn't pay for it"
                        }
                      >
                        {isFunded ? "Funds" : "Enabled by"}
                      </button>
                      <button
                        type="button"
                        className="dep-chip-remove"
                        aria-label={`Remove ${i.title}`}
                        onClick={() => removeLink(i.id)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dep-empty">No epics linked yet.</div>
            )}
            {items.length > 0 && (
              <div className="dep-search">
                <input
                  type="text"
                  className="dep-search-input"
                  placeholder="Search an epic to add to this bet…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setOpen(false)}
                />
                {open && (
                  <div className="dep-search-results">
                    {matches.length === 0 ? (
                      <div className="dep-search-empty">
                        {q ? "No matching epics." : "Nothing left to add."}
                      </div>
                    ) : (
                      matches.slice(0, 8).map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          className="dep-search-option"
                          style={{
                            ["--dep-color" as string]: STAGE_COLORS[i.stage],
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addItem(i.id);
                            setQuery("");
                          }}
                        >
                          <span>
                            {i.title}
                            {i.killed ? " (killed)" : ""}
                          </span>
                          <span className="dep-stage">{i.mission}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {linkedItems.length > 0 && (
            <div className="field">
              <label>By stage (derived)</label>
              <p className="helper" style={{ margin: 0 }}>
                {STAGES.map((s) => {
                  const n = linkedItems.filter((i) => i.stage === s).length;
                  return n ? `${n} ${s}` : null;
                })
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
          )}

          {/* ---------- 6. The decision ---------- */}
          <h3 className="bet-section">The decision</h3>
          <div className="field" id="bet-field-killCriteria">
            <label>Kill criteria</label>
            <p className="helper" style={{ margin: "0 0 6px" }}>
              What would make us stop. Without this it&rsquo;s a plan, not a bet.
            </p>
            <textarea
              value={draft.killCriteria}
              onChange={(e) => set("killCriteria", e.target.value)}
            />
          </div>
          <div className="bet-grid">
            <div className="field" id="bet-field-nextReview">
              <label>Next review</label>
              <input
                type="date"
                value={draft.nextReview ?? ""}
                onChange={(e) => set("nextReview", e.target.value || null)}
              />
            </div>
            <Select
              label="Verdict"
              value={draft.decision.verdict ?? ""}
              options={[
                ["", "Still running"] as [string, string],
                ...BET_VERDICTS.map(
                  (v) => [v, BET_VERDICT_LABELS[v]] as [string, string],
                ),
              ]}
              onChange={(v) =>
                set("decision", {
                  ...draft.decision,
                  verdict: (v || null) as Bet["decision"]["verdict"],
                  // Stamping the date with the verdict is what makes the
                  // decision-quality tally answerable; clearing it removes both.
                  decidedAt: v
                    ? draft.decision.decidedAt ?? new Date().toISOString()
                    : null,
                })
              }
            />
          </div>
          {draft.decision.verdict && (
            <div className="field">
              <label>Rationale</label>
              <textarea
                placeholder="Why it ended this way — judged on the decision, not only the outcome."
                value={draft.decision.rationale}
                onChange={(e) =>
                  set("decision", { ...draft.decision, rationale: e.target.value })
                }
              />
            </div>
          )}

          <div className="field">
            <label>Color</label>
            <div className="init-swatches">
              {BET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"init-swatch" + (c === draft.color ? " active" : "")}
                  style={{ background: c }}
                  aria-label={"Use color " + c}
                  aria-pressed={c === draft.color}
                  onClick={() => set("color", c)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          {!isNew && existing ? (
            <button className="link-button danger" onClick={del}>
              Delete bet
            </button>
          ) : (
            <span className="helper">
              The bet spans the earliest to latest of its linked epics on the
              timeline.
            </span>
          )}
          <button className="cm-button" onClick={save}>
            {isNew ? "Create bet" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- small form primitives ---------------- */

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

// A 1–5 score as five buttons rather than a number input: the scale is short,
// and clicking a position is faster and less error-prone than typing.
function Score({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="bet-score" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={"bet-score-dot" + (n <= value ? " on" : "")}
            aria-label={`${label} ${n} of 5`}
            aria-pressed={n === value}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {hint && <span className="helper">{hint}</span>}
    </div>
  );
}
