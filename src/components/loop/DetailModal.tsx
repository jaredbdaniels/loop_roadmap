"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Target,
  BarChart3,
  CalendarRange,
  Link2,
  ListTree,
  GraduationCap,
  History,
  FlaskConical,
} from "lucide-react";
import {
  ITEM_TYPES,
  ITEM_TYPE_INFO,
  MISSIONS,
  MISSION_INFO,
  TEAM_UNASSIGNED,
  OWNERS,
  STAGES,
  STAGE_COLORS,
  type Stage,
} from "@/lib/loop/constants";
import {
  computeRank,
  createsDepCycle,
  framingGaps,
  genId,
  horizonMismatch,
  isFramed,
  krProgress,
  krStatus,
  parseDate,
  stageBlockReason,
  subProgress,
  toISODate,
} from "@/lib/loop/logic";
import type { Item, Prototype, PrototypeStatus, SubItem } from "@/lib/loop/types";
import { stageMoveKind } from "./mutations";
import { useLoop } from "./store";
import { ModuleSelect } from "./ModuleSelect";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";
import type { RiceOutput } from "@/lib/ai/features/rice";
import type { CritiqueOutput } from "@/lib/ai/features/critique";
import type { KrOutput } from "@/lib/ai/features/kr";

export function DetailModal() {
  const {
    items,
    weights,
    bets,
    detailId,
    closeDetail,
    updateItem,
    removeItem,
    toast,
    celebrate,
    setEditing,
    shareMode,
  } = useLoop();
  const item = items.find((i) => i.id === detailId) || null;

  const [form, setForm] = useState<Item | null>(null);
  const [subs, setSubs] = useState<SubItem[]>([]);
  const [protos, setProtos] = useState<Prototype[]>([]);
  // "Depends on" is a deliberate search-to-add picker: type to find the one
  // item this work is sequenced behind, rather than scanning a wall of every
  // item. depOpen controls the results dropdown; depQuery is the search text.
  const [depQuery, setDepQuery] = useState("");
  const [depOpen, setDepOpen] = useState(false);
  // "Bets" is the same search-to-add picker as "Depends on": type to find
  // an bet to link this item to, rather than scanning every one.
  const [initQuery, setInitQuery] = useState("");
  const [initOpen, setInitOpen] = useState(false);
  // Items that have reached Learn open in a simplified, capture-first layout;
  // `showAll` lets the user expand back to the full editing form. Reset whenever
  // a different item is opened (see the effect keyed on detailId below).
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({ ...item });
      setSubs((item.subItems || []).map((s) => ({ ...s })));
      setProtos(
        (item.prototypes || []).map((p) => ({
          ...p,
          createdBy: { ...p.createdBy },
        })),
      );
      setEditing(true);
    } else {
      setForm(null);
      setEditing(false);
    }
    setDepQuery("");
    setDepOpen(false);
    setInitQuery("");
    setInitOpen(false);
    setShowAll(false);
    return () => setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  const rankPreview = useMemo(
    () => (form ? computeRank(form, weights) : 0),
    [form, weights],
  );

  // AI suggestion hooks (no-ops in the UI when the feature is off — the buttons
  // simply don't render). Each returns a draft the human accepts by saving.
  const riceAi = useAiSuggestion<RiceOutput>("rice");
  const critiqueAi = useAiSuggestion<CritiqueOutput>("critique");
  const krAi = useAiSuggestion<KrOutput>("kr");
  const explainAi = useAiSuggestion<{ text: string }>("explain-rank");
  const [riceRationale, setRiceRationale] = useState<RiceOutput["rationale"] | null>(null);
  const [critique, setCritique] = useState<CritiqueOutput | null>(null);
  const [explainText, setExplainText] = useState<string | null>(null);

  // The one item above and below this one in its lane, by computed rank — the
  // context the explain-ranking feature narrates against.
  const rankNeighbors = useMemo(() => {
    type N = { title: string; rank: number; dir: "above" | "below" };
    if (!form) return [] as N[];
    const peers = items
      .filter((i) => !i.killed && i.mission === form.mission)
      .map((i) => ({ id: i.id, title: i.title, rank: computeRank(i, weights) }))
      .sort((a, b) => b.rank - a.rank);
    const idx = peers.findIndex((p) => p.id === form.id);
    const out: N[] = [];
    if (idx > 0) out.push({ title: peers[idx - 1].title, rank: peers[idx - 1].rank, dir: "above" });
    if (idx >= 0 && idx < peers.length - 1)
      out.push({ title: peers[idx + 1].title, rank: peers[idx + 1].rank, dir: "below" });
    return out;
  }, [items, weights, form]);

  if (!item || !form) return null;

  const set = <K extends keyof Item>(k: K, v: Item[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const setKr = <K extends keyof Item["kr"]>(k: K, v: Item["kr"][K]) =>
    setForm((f) => (f ? { ...f, kr: { ...f.kr, [k]: v } } : f));
  const setKrNum = (k: "baseline" | "target" | "current", raw: string) =>
    setKr(k, raw.trim() === "" ? null : Number(raw));

  // Once an item has shipped into Learn, default to the simplified learning-
  // capture layout. Gate on the *persisted* stage (item.stage), not the editable
  // form.stage, so changing the stage dropdown mid-edit doesn't reflow the view.
  const learnMode = item.stage === "Learn" && !showAll;

  // --- AI drafts. None of these persist; they fill the form for the user to
  // review and save (or discard by closing). Failures toast and change nothing.
  const runRice = async () => {
    const { data, error } = await riceAi.run({
      title: form.title,
      problemStatement: form.problemStatement,
      mission: form.mission,
      description: form.description,
    });
    if (!data) return toast(error ?? "Couldn't suggest scores.", true);
    setForm((f) =>
      f
        ? { ...f, reach: data.reach, confidence: data.confidence, strategicFit: data.strategicFit }
        : f,
    );
    setRiceRationale(data.rationale);
    toast("Suggested scores — review and save.");
  };

  const runCritique = async () => {
    const { data, error } = await critiqueAi.run({
      title: form.title,
      problemStatement: form.problemStatement,
    });
    if (!data) return toast(error ?? "Couldn't critique the framing.", true);
    setCritique(data);
  };
  const useRewrite = () => {
    if (critique) set("problemStatement", critique.rewrite);
  };

  const runKr = async () => {
    const goal =
      form.kr.statement || form.kr.metric || form.description || form.title;
    const { data, error } = await krAi.run({
      title: form.title,
      description: form.description,
      goal,
    });
    if (!data) return toast(error ?? "Couldn't draft a KR.", true);
    setForm((f) => (f ? { ...f, kr: { ...data } } : f));
    toast("Drafted a measurable KR — review and save.");
  };

  const runExplain = async () => {
    const { data, error } = await explainAi.run({
      title: form.title,
      scores: {
        votes: form.votes || 0,
        reach: form.reach || 0,
        confidence: form.confidence || 0,
        strategicFit: form.strategicFit || 0,
      },
      weights,
      rank: rankPreview,
      neighbors: rankNeighbors,
    });
    if (!data) return toast(error ?? "Couldn't explain the ranking.", true);
    setExplainText(data.text);
  };

  const mm = horizonMismatch(form);

  const toggleDep = (otherId: string, checked: boolean) => {
    if (checked && createsDepCycle(items, form.id, otherId)) {
      const other = items.find((i) => i.id === otherId);
      toast(
        `Can't add that: "${other?.title}" already depends on "${form.title}" (directly or through a chain). That would be a circular dependency.`,
        true,
      );
      return;
    }
    set(
      "dependsOn",
      checked
        ? [...form.dependsOn, otherId]
        : form.dependsOn.filter((d) => d !== otherId),
    );
  };

  const toggleBet = (initId: string, checked: boolean) => {
    const current = form.betIds || [];
    set(
      "betIds",
      checked
        ? [...current, initId]
        : current.filter((id) => id !== initId),
    );
  };

  const addSub = () =>
    setSubs((s) => [
      ...s,
      {
        id: genId(),
        title: "",
        targetStart: null,
        targetEnd: null,
        done: false,
        adoUrl: "",
        adoStatus: "",
      },
    ]);
  const updateSub = (id: string, patch: Partial<SubItem>) => {
    const nextSubs = subs.map((x) => (x.id === id ? { ...x, ...patch } : x));
    // Checking the last open sub-item completes the checklist — a small win.
    if (
      patch.done === true &&
      subs.length > 0 &&
      subs.some((x) => !x.done) &&
      nextSubs.every((x) => x.done)
    ) {
      celebrate({ kind: "advance", label: "All sub-items done!" });
    }
    setSubs(nextSubs);
  };
  const removeSub = (id: string) => setSubs((s) => s.filter((x) => x.id !== id));

  const addProto = () =>
    setProtos((p) => [
      ...p,
      {
        id: genId(),
        title: "",
        url: "",
        approach: "",
        createdBy: { type: "human", name: "" },
        status: "exploring",
        outcomeReading: "",
        createdAt: new Date().toISOString(),
      },
    ]);
  const updateProto = (id: string, patch: Partial<Prototype>) =>
    setProtos((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeProto = (id: string) =>
    setProtos((list) => list.filter((x) => x.id !== id));
  // Converging is a single call: choosing one direction demotes any other chosen.
  const setProtoStatus = (id: string, status: PrototypeStatus) =>
    setProtos((list) =>
      list.map((x) =>
        x.id === id
          ? { ...x, status }
          : status === "chosen" && x.status === "chosen"
            ? { ...x, status: "exploring" }
            : x,
      ),
    );
  const setProtoAuthor = (id: string, type: "human" | "agent") =>
    setProtos((list) =>
      list.map((x) =>
        x.id === id ? { ...x, createdBy: { ...x.createdBy, type } } : x,
      ),
    );

  const liveProtos = protos.filter((p) => p.status !== "rejected");
  const chosen = protos.find((p) => p.status === "chosen") || null;
  const diverged = liveProtos.length >= 2 && !chosen;

  const save = () => {
    const newStart = form.targetStart || "";
    const newEnd = form.targetEnd || "";
    if (newStart && newEnd && parseDate(newEnd) <= parseDate(newStart)) {
      toast("Target end must be after target start.", true);
      return;
    }
    if ((newStart && !newEnd) || (!newStart && newEnd)) {
      toast(
        "An item needs both a start and an end to appear on the timeline. Saved anyway.",
        true,
      );
    }
    // collect sub-items (discard empties, validate dates)
    const collected: SubItem[] = [];
    for (const row of subs) {
      const title = row.title.trim();
      if (!title) {
        // A truly blank row is fine to drop, but if the user pasted an ADO
        // link (or set dates) onto it, silently discarding the row would lose
        // that input — ask for a title instead of eating it.
        if (row.adoUrl.trim() || row.targetStart || row.targetEnd) {
          toast("Give the sub-item a title before saving (it has a link or dates).", true);
          return;
        }
        continue;
      }
      if (
        row.targetStart &&
        row.targetEnd &&
        parseDate(row.targetEnd) <= parseDate(row.targetStart)
      ) {
        toast(`Sub-item "${title}": end must be after start.`, true);
        return;
      }
      collected.push({ ...row, title });
    }

    // collect prototypes (discard rows with neither a title nor a link)
    const collectedProtos: Prototype[] = [];
    for (const row of protos) {
      const title = row.title.trim();
      const url = row.url.trim();
      if (!title && !url) continue;
      collectedProtos.push({
        ...row,
        title,
        url,
        approach: row.approach.trim(),
        outcomeReading: row.outcomeReading.trim(),
      });
    }
    // Keep the legacy single-link field pointing at the primary direction
    // (chosen, else first still-in-play, else first) so evidence + export stay coherent.
    const primaryProto =
      collectedProtos.find((p) => p.status === "chosen") ||
      collectedProtos.find((p) => p.status !== "rejected") ||
      collectedProtos[0];

    let next: Item = {
      ...form,
      subItems: collected,
      prototypes: collectedProtos,
      prototypeUrl: primaryProto ? primaryProto.url : "",
      targetStart: newStart || null,
      targetEnd: newEnd || null,
      updatedAt: new Date().toISOString(),
    };

    const targetStage = form.stage;
    if (targetStage !== item.stage) {
      const reason = stageBlockReason(next, targetStage);
      if (reason) {
        toast(reason, true);
        next = { ...next, stage: item.stage };
      } else {
        next.activity = [...(next.activity || []), `Moved to ${targetStage}.`];
        if (targetStage === "Deliver" && !next.committedAt)
          next.committedAt = next.updatedAt;
        if (targetStage === "Learn" && !next.shippedAt)
          next.shippedAt = next.updatedAt;
        // React to the move: a ship sets the unicorn loose, a forward step
        // cheers, a step back sighs.
        const kind = stageMoveKind(item.stage, targetStage);
        const label =
          kind === "ship"
            ? `Shipped: ${next.title}`
            : kind === "advance"
              ? `→ ${targetStage}`
              : `Back to ${targetStage}`;
        celebrate({ kind, label });
      }
    }

    updateItem(next);
    closeDetail();
    toast("Saved.");
  };

  const toggleKill = () => {
    const killed = !form.killed;
    const next: Item = {
      ...form,
      killed,
      killedAt: killed ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      activity: [
        ...(form.activity || []),
        killed ? "Killed." : "Un-killed, back in the loop.",
      ],
    };
    updateItem(next);
    // Killing an idea gets a somber send-off; un-killing stays quiet.
    if (killed) celebrate({ kind: "kill", label: `Killed: ${form.title}` });
    closeDetail();
  };

  const del = () => {
    if (
      !confirm("Delete this item permanently? This cannot be undone.")
    )
      return;
    removeItem(form.id);
    closeDetail();
  };

  const stageWarning =
    !isFramed(form) &&
    STAGES.indexOf(form.stage) >= STAGES.indexOf("Validate")
      ? `This item is past Frame but still missing ${framingGaps(form).join(
          ", ",
        )}. Fill these in to keep the loop honest.`
      : "";

  const prog = subProgress({ ...form, subItems: subs });
  const others = items.filter((i) => i.id !== form.id);
  // Items this one already waits on, resolved to full objects for the chips.
  const selectedDeps = form.dependsOn
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => !!i);
  // Candidates for the search picker: everything not already a dependency,
  // narrowed by the query. Empty query shows the full remaining list on focus.
  const q = depQuery.trim().toLowerCase();
  const depMatches = others
    .filter((o) => !form.dependsOn.includes(o.id))
    .filter((o) => (q ? o.title.toLowerCase().includes(q) : true));

  // Bets this item belongs to, resolved to full objects for the chips.
  const selectedInits = (form.betIds || [])
    .map((id) => bets.find((n) => n.id === id))
    .filter((n): n is (typeof bets)[number] => !!n);
  const iq = initQuery.trim().toLowerCase();
  const initMatches = bets
    .filter((n) => !(form.betIds || []).includes(n.id))
    .filter((n) => (iq ? n.title.toLowerCase().includes(iq) : true));

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{form.title}</h2>
          <button className="modal-close" onClick={closeDetail} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
        {/* In read-only share mode, disable every field at once. The mutating
            buttons (Save/Kill/Delete/vote/add) are separately hidden via the
            `edit-only` class, so viewers can look but not touch. */}
        <fieldset
          disabled={shareMode}
          style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
        >
        {learnMode ? (
          <>
          {/* Simplified, capture-first layout for shipped (Learn-stage) items.
              Foregrounds the hypothesis→result story and the learnings; the full
              planning form is one "Show all fields" click away (below). */}
          <div className="form-section" style={{ borderTop: 0, paddingTop: 0 }}>
            <div
              className="form-section-title"
              style={{ color: STAGE_COLORS.Learn }}
            >
              <GraduationCap size={13} strokeWidth={2.4} /> Close the loop
            </div>
            <div className="helper" style={{ marginTop: 0, marginBottom: 16 }}>
              {form.shippedAt ? `Shipped ${form.shippedAt.slice(0, 10)}. ` : ""}
              Record what actually happened against the goal you set — and what
              you learned.
            </div>

            <div className="field">
              <label>The problem we set out to solve</label>
              <div className="readonly-text" style={{ marginTop: 2 }}>
                {form.problemStatement.trim() ||
                  "No problem statement was recorded."}
              </div>
            </div>

            <div className="field">
              <label>
                Result — update the KR&apos;s current reading
                {form.kr.metric ? ` (${form.kr.metric})` : ""}
              </label>
              <input
                type="number"
                value={form.kr.current ?? ""}
                placeholder="—"
                style={{ maxWidth: 220 }}
                onChange={(e) => setKrNum("current", e.target.value)}
              />
            </div>
            <KrProgress kr={form.kr} />
          </div>

          <div className="form-section">
            <div className="form-section-title">
              <GraduationCap size={13} strokeWidth={2.4} /> What we learned
            </div>
            <div className="field">
              <label>Outcome reading</label>
              <textarea
                value={form.outcomeReading}
                placeholder="What actually happened against the KR above, once shipped."
                style={{ minHeight: 96 }}
                onChange={(e) => set("outcomeReading", e.target.value)}
              />
            </div>
            <div className="field">
              <label>What we learned</label>
              <textarea
                value={form.whatWeLearned}
                placeholder="The insight that generalizes beyond this one number."
                onChange={(e) => set("whatWeLearned", e.target.value)}
              />
            </div>
            <div className="field">
              <label>What we&apos;d do differently</label>
              <textarea
                value={form.whatWeDoDifferently}
                placeholder="Process or decisions you'd change next time."
                onChange={(e) => set("whatWeDoDifferently", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Next bet</label>
              <textarea
                value={form.nextBet}
                placeholder="The follow-on idea or action this outcome points to."
                onChange={(e) => set("nextBet", e.target.value)}
              />
            </div>
          </div>

          {protos.length > 0 && (
            <div className="form-section">
              <div className="form-section-title">
                <FlaskConical size={13} strokeWidth={2.4} /> What each direction
                taught
              </div>
              {protos.map((p) => (
                <div className="field" key={p.id}>
                  <label>
                    {p.title.trim() || "Untitled direction"} · {p.status}
                  </label>
                  {p.approach.trim() && (
                    <div className="helper" style={{ marginTop: 0, marginBottom: 4 }}>
                      {p.approach}
                    </div>
                  )}
                  <div className="readonly-text">
                    {p.outcomeReading.trim() ||
                      "No reading recorded for this direction."}
                  </div>
                </div>
              ))}
            </div>
          )}

          {form.killed && (
            <div className="form-section">
              <div className="form-section-title">
                <GraduationCap size={13} strokeWidth={2.4} /> Kill reason
              </div>
              <div className="field">
                <textarea
                  value={form.killedReason}
                  placeholder="Why this died, and what it cost to find out."
                  onChange={(e) => set("killedReason", e.target.value)}
                />
              </div>
            </div>
          )}
          </>
        ) : (
        <>
        <div className="form-section">
          <div className="form-section-title">
            <FileText size={13} strokeWidth={2.4} /> Overview
          </div>
        <div className="field-row">
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Team</label>
            <select
              value={form.mission}
              onChange={(e) => set("mission", e.target.value)}
            >
              {/* Explicitly selectable: work can legitimately have no team yet
                  (see TEAM_UNASSIGNED), and it must be visible when it does. */}
              <option value={TEAM_UNASSIGNED}>— No team yet —</option>
              {MISSIONS.map((m) => (
                <option key={m} value={m} title={MISSION_INFO[m]}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <select
              value={form.owner || ""}
              onChange={(e) => set("owner", e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ModuleSelect
          value={form.moduleId}
          mission={form.mission}
          onChange={(id) => set("moduleId", id)}
        />

        <div className="field">
          <label>Type</label>
          <select
            value={form.type ?? ""}
            onChange={(e) =>
              set("type", (e.target.value || null) as Item["type"])
            }
          >
            <option value="">— Untyped —</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_INFO[t].label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            The roadmap lens — Modernize / New value / Both — independent of the
            loop stage.
          </p>
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="field">
          <label>Loop stage</label>
          <select
            value={form.stage}
            onChange={(e) => set("stage", e.target.value as Stage)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {stageWarning && <div className="helper">{stageWarning}</div>}
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <Target size={13} strokeWidth={2.4} /> Frame the problem
          </div>
        <div className="field">
          <label>
            Problem statement{" "}
            <span style={{ color: "var(--cm-red)" }}>(required to leave Frame)</span>
          </label>
          <textarea
            value={form.problemStatement}
            placeholder="What is broken, for whom, and why does it matter? Not a feature description."
            onChange={(e) => set("problemStatement", e.target.value)}
          />
          {form.problemStatement.trim() && (
            <div className="ai-inline">
              <SuggestButton
                loading={critiqueAi.loading}
                onClick={runCritique}
                title="Grade this framing and suggest a tighter rewrite"
              >
                Critique framing
              </SuggestButton>
              {critique && (
                <div className="ai-panel">
                  <div className="ai-panel-head">Framing score: {critique.score}/5</div>
                  <ul className="ai-questions">
                    {critique.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                  <div className="ai-rewrite">{critique.rewrite}</div>
                  <button
                    type="button"
                    className="cm-button cm-button--small edit-only"
                    onClick={useRewrite}
                  >
                    Use rewrite
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="field">
          <label>
            Outcome KR — what you&apos;ll measure{" "}
            <span style={{ color: "var(--cm-red)" }}>(required to leave Frame)</span>
          </label>
          <input
            type="text"
            value={form.kr.metric}
            placeholder="The metric this should move, e.g. 'Time-to-complete tax onboarding'"
            onChange={(e) => setKr("metric", e.target.value)}
          />
        </div>
        <div
          className="field"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <div>
            <label>Baseline</label>
            <input
              type="number"
              value={form.kr.baseline ?? ""}
              placeholder="e.g. 9"
              onChange={(e) => setKrNum("baseline", e.target.value)}
            />
          </div>
          <div>
            <label>Target</label>
            <input
              type="number"
              value={form.kr.target ?? ""}
              placeholder="e.g. 3"
              onChange={(e) => setKrNum("target", e.target.value)}
            />
          </div>
          <div>
            <label>Current</label>
            <input
              type="number"
              value={form.kr.current ?? ""}
              placeholder="—"
              onChange={(e) => setKrNum("current", e.target.value)}
            />
          </div>
          <div>
            <label>Unit</label>
            <input
              type="text"
              value={form.kr.unit}
              placeholder="days"
              onChange={(e) => setKr("unit", e.target.value)}
            />
          </div>
        </div>
        <KrProgress kr={form.kr} />
        <div className="field">
          <label>KR statement (optional narrative)</label>
          <textarea
            value={form.kr.statement}
            placeholder="Plain-language framing, e.g. 'Cut time-to-complete tax onboarding from 9 days to under 3.'"
            onChange={(e) => setKr("statement", e.target.value)}
          />
        </div>
        <div className="ai-inline">
          <SuggestButton
            loading={krAi.loading}
            onClick={runKr}
            title="Turn the goal into a measurable metric, baseline, and target"
          >
            Make measurable
          </SuggestButton>
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <BarChart3 size={13} strokeWidth={2.4} /> Prioritization
          </div>
        <div className="field-row">
          <div className="field">
            <label>Votes</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "var(--cm-purple)",
                }}
              >
                {form.votes || 0}
              </span>
              <button
                className="cm-button--small cm-button edit-only"
                type="button"
                onClick={() => set("votes", (form.votes || 0) + 1)}
              >
                +1 vote
              </button>
            </div>
          </div>
          <div className="field">
            <label>Computed rank score</label>
            <div
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--cm-purple)",
              }}
            >
              {rankPreview}
            </div>
          </div>
        </div>

        <div className="ai-inline">
          <SuggestButton
            loading={explainAi.loading}
            onClick={runExplain}
            title="Explain why this item ranks where it does"
          >
            Why this score?
          </SuggestButton>
          {explainText && <div className="ai-panel">{explainText}</div>}
        </div>

        <div className="field">
          <label>Reach, confidence, strategic fit (1–5)</label>
          {(
            [
              ["Reach", "reach"],
              ["Confidence", "confidence"],
              ["Strategic fit", "strategicFit"],
            ] as const
          ).map(([label, key]) => (
            <div className="slider-row" key={key}>
              <span style={{ width: 110, fontSize: "0.78rem" }}>{label}</span>
              <input
                type="range"
                min={0}
                max={5}
                value={form[key] as number}
                onChange={(e) => set(key, +e.target.value)}
              />
              <span className="slider-val">{form[key] as number}</span>
            </div>
          ))}
          <div className="ai-inline">
            <SuggestButton
              loading={riceAi.loading}
              onClick={runRice}
              title="Suggest reach, confidence, and strategic fit from the framing"
            >
              Suggest scores
            </SuggestButton>
            {riceRationale && (
              <div className="ai-panel">
                <div>
                  <b>Reach:</b> {riceRationale.reach}
                </div>
                <div>
                  <b>Confidence:</b> {riceRationale.confidence}
                </div>
                <div>
                  <b>Strategic fit:</b> {riceRationale.strategicFit}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <CalendarRange size={13} strokeWidth={2.4} /> Schedule &amp; sequencing
          </div>
        <div className="field-row">
          <div className="field">
            <label>Target start</label>
            <input
              type="date"
              value={form.targetStart || ""}
              onChange={(e) => set("targetStart", e.target.value || null)}
            />
          </div>
          <div className="field">
            <label>Target end</label>
            <input
              type="date"
              value={form.targetEnd || ""}
              onChange={(e) => set("targetEnd", e.target.value || null)}
            />
            <div className="helper">
              Dates snap to week boundaries on the timeline. Leave blank to keep
              it off the timeline.
            </div>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Horizon</label>
            <select
              value={form.horizon || ""}
              onChange={(e) =>
                set(
                  "horizon",
                  (e.target.value || null) as Item["horizon"],
                )
              }
            >
              <option value="">Unassigned</option>
              <option value="now">Now</option>
              <option value="next">Next</option>
              <option value="later">Later</option>
            </select>
            {mm && (
              <div className="helper">
                Heads up: target dates suggest this belongs in{" "}
                {mm.charAt(0).toUpperCase() + mm.slice(1)}.
              </div>
            )}
          </div>
          <div className="field">
            <label>Depends on</label>
            {selectedDeps.length > 0 ? (
              <div className="dep-chips">
                {selectedDeps.map((d) => (
                  <span
                    key={d.id}
                    className="dep-chip"
                    style={{ ["--dep-color" as string]: STAGE_COLORS[d.stage] }}
                  >
                    <span className="dep-chip-title">
                      {d.title}
                      {d.killed ? " (killed)" : ""}
                    </span>
                    <span className="dep-chip-stage">
                      {d.killed ? "Killed" : d.stage}
                    </span>
                    <button
                      type="button"
                      className="dep-chip-remove"
                      aria-label={`Remove dependency on ${d.title}`}
                      onClick={() => toggleDep(d.id, false)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="dep-empty">Not blocked by anything.</div>
            )}
            {others.length === 0 ? (
              <div className="helper">No other items to depend on.</div>
            ) : (
              <div className="dep-search">
                <input
                  type="text"
                  className="dep-search-input"
                  placeholder="Search an item this is sequenced behind…"
                  value={depQuery}
                  onChange={(e) => setDepQuery(e.target.value)}
                  onFocus={() => setDepOpen(true)}
                  onBlur={() => setDepOpen(false)}
                />
                {depOpen && (
                  <div className="dep-search-results">
                    {depMatches.length === 0 ? (
                      <div className="dep-search-empty">
                        {q ? "No matching items." : "Nothing left to add."}
                      </div>
                    ) : (
                      depMatches.slice(0, 8).map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className="dep-search-option"
                          style={{
                            ["--dep-color" as string]: STAGE_COLORS[o.stage],
                          }}
                          // onMouseDown (not onClick) fires before the input's
                          // onBlur, so the pick registers before the dropdown
                          // closes.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            toggleDep(o.id, true);
                            setDepQuery("");
                          }}
                        >
                          <span>
                            {o.title}
                            {o.killed ? " (killed)" : ""}
                          </span>
                          <span className="dep-stage">
                            {o.killed ? "Killed" : o.stage}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="helper">
              Only for sequenced work — add a dependency when this can&apos;t
              start until another item finishes. Dependencies warn, they never
              hard-block.
            </div>
          </div>
          <div className="field">
            <label>Bets</label>
            {selectedInits.length > 0 ? (
              <div className="dep-chips">
                {selectedInits.map((n) => (
                  <span
                    key={n.id}
                    className="dep-chip"
                    style={{ ["--dep-color" as string]: n.color }}
                  >
                    <span className="dep-chip-title">{n.title}</span>
                    <button
                      type="button"
                      className="dep-chip-remove"
                      aria-label={`Remove from ${n.title}`}
                      onClick={() => toggleBet(n.id, false)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="dep-empty">Not part of any bet.</div>
            )}
            {bets.length === 0 ? (
              <div className="helper">
                No bets yet — create one from the timeline.
              </div>
            ) : (
              <div className="dep-search">
                <input
                  type="text"
                  className="dep-search-input"
                  placeholder="Search an bet to add this to…"
                  value={initQuery}
                  onChange={(e) => setInitQuery(e.target.value)}
                  onFocus={() => setInitOpen(true)}
                  onBlur={() => setInitOpen(false)}
                />
                {initOpen && (
                  <div className="dep-search-results">
                    {initMatches.length === 0 ? (
                      <div className="dep-search-empty">
                        {iq ? "No matching bets." : "Nothing left to add."}
                      </div>
                    ) : (
                      initMatches.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className="dep-search-option"
                          style={{ ["--dep-color" as string]: n.color }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            toggleBet(n.id, true);
                            setInitQuery("");
                          }}
                        >
                          <span>{n.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="helper">
              Link this item to the cross-team bets it&apos;s part of. An
              bet&apos;s teams and dates are derived from its items.
            </div>
          </div>
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <Link2 size={13} strokeWidth={2.4} /> References
          </div>
        {/* The link-out, not just the field. Notion owns the narrative — the
            product brief and launch control live there — so once an item records
            a URL, going to read it should be one click from here rather than a
            copy-paste out of a text input. Same for the ADO work item below. */}
        {(form.notionUrl || form.adoUrl) && (
          <div className="ref-links">
            {form.notionUrl && (
              <a
                className="ref-link primary"
                href={form.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={13} strokeWidth={2.4} aria-hidden />
                {form.notionTitle
                  ? `Open in Notion: ${form.notionTitle}`
                  : "Open product brief in Notion"}
                <span aria-hidden>↗</span>
              </a>
            )}
            {form.adoUrl && (
              <a
                className="ref-link"
                href={form.adoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ListTree size={13} strokeWidth={2.4} aria-hidden />
                Open work item in ADO
                <span aria-hidden>↗</span>
              </a>
            )}
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label>Notion reference (link)</label>
            <input
              type="url"
              value={form.notionUrl}
              placeholder="https://notion.so/..."
              onChange={(e) => set("notionUrl", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Notion page title</label>
            <input
              type="text"
              value={form.notionTitle}
              placeholder="e.g. Essentials strategy doc"
              onChange={(e) => set("notionTitle", e.target.value)}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>ADO work item (link)</label>
            <input
              type="url"
              value={form.adoUrl}
              placeholder="https://dev.azure.com/..."
              onChange={(e) => set("adoUrl", e.target.value)}
            />
          </div>
          <div className="field">
            <label>ADO status (manual)</label>
            <input
              type="text"
              value={form.adoStatus}
              placeholder="e.g. In sprint planning"
              onChange={(e) => set("adoStatus", e.target.value)}
            />
          </div>
        </div>

        {(form.ahaUrl || form.ahaReference) && (
          <div className="field-row">
            <div className="field">
              {/* Read-only: Aha! owns the idea, so the backlink and reference are
                  set by the ingest webhook, never hand-edited here. */}
              <label>Aha! idea (captured from)</label>
              {form.ahaUrl ? (
                <a href={form.ahaUrl} target="_blank" rel="noopener noreferrer">
                  {form.ahaReference || form.ahaUrl}
                </a>
              ) : (
                <span>{form.ahaReference}</span>
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label>Shipped on</label>
          <input
            type="date"
            value={form.shippedAt ? toISODate(form.shippedAt) : ""}
            onChange={(e) =>
              set(
                "shippedAt",
                e.target.value ? parseDate(e.target.value).toISOString() : null,
              )
            }
          />
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <FlaskConical size={13} strokeWidth={2.4} /> Prototypes
            <span
              style={{
                color: "var(--cm-muted-fg)",
                fontWeight: 500,
                textTransform: "none",
                letterSpacing: 0,
                marginLeft: 6,
              }}
            >
              {liveProtos.length > 1
                ? `(${liveProtos.length} directions in play)`
                : liveProtos.length === 1
                  ? "(1 direction)"
                  : "(none yet)"}
            </span>
          </div>
          <div className="field">
            <div className="helper" style={{ marginTop: 0, marginBottom: 8 }}>
              Divergent prototyping: for one framed problem, spin up several
              distinct directions — a human or an agent can add each — evaluate
              them against the KR above, then mark one <strong>Chosen</strong> to
              converge. The evidence gate into Deliver needs at least one linked
              prototype.
            </div>
            {chosen ? (
              <div className="proto-banner proto-banner--converged">
                Converged on <strong>{chosen.title || "an untitled direction"}</strong>.
              </div>
            ) : diverged ? (
              <div className="proto-banner proto-banner--diverged">
                {liveProtos.length} directions in play, none chosen yet — mark one
                Chosen to converge before Deliver.
              </div>
            ) : null}
            <div className="proto-list">
              {protos.map((p) => (
                <div
                  key={p.id}
                  className={"proto-row proto-row--" + p.status}
                >
                  <div className="proto-row-head">
                    <select
                      className="proto-status"
                      value={p.status}
                      onChange={(e) =>
                        setProtoStatus(p.id, e.target.value as PrototypeStatus)
                      }
                      title="Direction status"
                    >
                      <option value="exploring">Exploring</option>
                      <option value="chosen">Chosen</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <input
                      type="text"
                      className="proto-title"
                      placeholder="Direction, e.g. 'Inline AI summary'"
                      value={p.title}
                      onChange={(e) =>
                        updateProto(p.id, { title: e.target.value })
                      }
                    />
                    <select
                      className="proto-author"
                      value={p.createdBy.type}
                      onChange={(e) =>
                        setProtoAuthor(p.id, e.target.value as "human" | "agent")
                      }
                      title="Who built this direction"
                    >
                      <option value="human">Human</option>
                      <option value="agent">Agent</option>
                    </select>
                    <button
                      type="button"
                      className="proto-del edit-only"
                      title="Remove direction"
                      onClick={() => removeProto(p.id)}
                    >
                      ×
                    </button>
                  </div>
                  <input
                    type="url"
                    className="proto-url"
                    placeholder="Link to the artifact — https://figma.com/…, a Vercel preview, a Loom…"
                    value={p.url}
                    onChange={(e) => updateProto(p.id, { url: e.target.value })}
                  />
                  <input
                    type="text"
                    className="proto-approach"
                    placeholder="What's different about this direction / the hypothesis it tests"
                    value={p.approach}
                    onChange={(e) =>
                      updateProto(p.id, { approach: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className="proto-outcome"
                    placeholder="How it read against the KR (fill in after evaluating)"
                    value={p.outcomeReading}
                    onChange={(e) =>
                      updateProto(p.id, { outcomeReading: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              className="cm-button--ghost cm-button cm-button--small edit-only"
              type="button"
              style={{ marginTop: 8 }}
              onClick={addProto}
            >
              + Add prototype direction
            </button>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <ListTree size={13} strokeWidth={2.4} /> Breakdown
          </div>
        <div className="field">
          <label>
            Sub-items{" "}
            <span
              style={{
                color: "var(--cm-muted-fg)",
                fontWeight: 500,
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              {prog ? `(${prog.done}/${prog.total} done)` : "(none yet)"}
            </span>
          </label>
          <div className="sub-rows">
            {subs.map((s) => (
              <div key={s.id} className="sub-item">
                <div className={"sub-row" + (s.done ? " done" : "")}>
                  <input
                    type="checkbox"
                    className="sub-done"
                    checked={s.done}
                    title="Done"
                    onChange={(e) => updateSub(s.id, { done: e.target.checked })}
                  />
                  <input
                    type="text"
                    className="sub-title"
                    placeholder="Sub-item title"
                    value={s.title}
                    onChange={(e) => updateSub(s.id, { title: e.target.value })}
                  />
                  <input
                    type="date"
                    className="sub-start"
                    value={s.targetStart || ""}
                    onChange={(e) =>
                      updateSub(s.id, { targetStart: e.target.value || null })
                    }
                  />
                  <input
                    type="date"
                    className="sub-end"
                    value={s.targetEnd || ""}
                    onChange={(e) =>
                      updateSub(s.id, { targetEnd: e.target.value || null })
                    }
                  />
                  <button
                    type="button"
                    className="sub-del edit-only"
                    title="Remove sub-item"
                    onClick={() => removeSub(s.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="sub-ado">
                  <Link2 size={12} strokeWidth={2.2} className="sub-ado-icon" />
                  <input
                    type="url"
                    className="sub-ado-url"
                    placeholder="ADO work item link — https://dev.azure.com/…"
                    value={s.adoUrl}
                    onChange={(e) => updateSub(s.id, { adoUrl: e.target.value })}
                  />
                  {s.adoStatus && (
                    <span
                      className="sub-ado-status"
                      title="Pulled from Azure DevOps by Sync ADO"
                    >
                      {s.adoStatus}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            className="cm-button--ghost cm-button cm-button--small edit-only"
            type="button"
            style={{ marginTop: 8 }}
            onClick={addSub}
          >
            + Add sub-item
          </button>
          <div className="helper">
            The breakdown under this idea: milestones or workstreams. Dated
            sub-items appear as slim bars under the parent on the timeline.
            Sub-items don&apos;t enter the loop pipeline. Link each to its ADO
            work item and <strong>Sync ADO</strong> pulls its status and checks
            it off when the work item closes — so the {prog ? `${prog.done}/${prog.total} done` : "done"} rollup
            reflects real delivery.
          </div>
        </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <GraduationCap size={13} strokeWidth={2.4} /> Learn
          </div>
        <div className="field">
          <label>Outcome reading (Learn stage)</label>
          <textarea
            value={form.outcomeReading}
            placeholder="What actually happened against the KR above, once shipped. Update the KR's current value to record the reading."
            onChange={(e) => set("outcomeReading", e.target.value)}
          />
        </div>

        {form.killed && (
          <div className="field">
            <label>Kill reason</label>
            <textarea
              value={form.killedReason}
              placeholder="Why this died, and what it cost to find out."
              onChange={(e) => set("killedReason", e.target.value)}
            />
          </div>
        )}
        </div>

        <div className="form-section">
          <div className="form-section-title">
            <History size={13} strokeWidth={2.4} /> Activity
          </div>
        <div className="activity-log">
          {(form.activity || []).length ? (
            form.activity.map((a, i) => <div key={i}>{a}</div>)
          ) : (
            <div>
              <span>No activity logged yet.</span>
            </div>
          )}
        </div>
        </div>
        </>
        )}
        </fieldset>
        {item.stage === "Learn" && (
          <button
            type="button"
            className="cm-button cm-button--ghost cm-button--small"
            style={{ marginTop: 16 }}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "◂ Back to capture view" : "Show all fields ▸"}
          </button>
        )}
        </div>

        <div className="modal-actions">
          <div className="left-actions edit-only">
            <button
              className="cm-button--ghost cm-button cm-button--small"
              type="button"
              onClick={toggleKill}
            >
              {form.killed ? "Un-kill this idea" : "Kill this idea"}
            </button>
            <button
              className="cm-button--ghost cm-button cm-button--small"
              type="button"
              style={{
                color: "var(--cm-red)",
                boxShadow: "inset 0 0 0 1.5px var(--cm-red)",
              }}
              onClick={del}
            >
              Delete
            </button>
          </div>
          <button className="cm-button edit-only" onClick={save}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// Live read-out of KR progress inside the editor. Shows nothing until enough
// numbers are filled in for krProgress to compute a value.
function KrProgress({ kr }: { kr: Item["kr"] }) {
  const pct = krProgress(kr);
  if (pct === null) {
    return (
      <div className="helper" style={{ marginBottom: 12 }}>
        Enter a baseline, target, and current reading to track progress.
      </div>
    );
  }
  const status = krStatus(kr);
  const label =
    status === "achieved" ? "Achieved" : "In progress";
  const color =
    status === "achieved" ? "var(--cm-green)" : "var(--cm-purple)";
  const unit = kr.unit ? " " + kr.unit : "";
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.78rem",
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, color }}>
          {label} · {pct}%
        </span>
        <span style={{ color: "var(--cm-muted-fg)" }}>
          {kr.current}
          {unit} of {kr.target}
          {unit} (from {kr.baseline}
          {unit})
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--cm-border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: pct + "%",
            height: "100%",
            background: color,
            borderRadius: 999,
            transition: "width 120ms ease",
          }}
        />
      </div>
    </div>
  );
}
