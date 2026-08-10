"use client";

import { useEffect, useState } from "react";
import { MISSIONS, MISSION_INFO, OWNERS } from "@/lib/loop/constants";
import { teamLabel } from "@/lib/loop/taxonomy";
import { fmtRange, genId } from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import { useLoop } from "./store";
import { ModuleSelect } from "./ModuleSelect";
import { SuggestButton } from "./SuggestButton";
import { useAiSuggestion } from "./useAi";
import type { CaptureOutput } from "@/lib/ai/features/capture";

const EMPTY_KR: Item["kr"] = {
  statement: "",
  metric: "",
  unit: "",
  baseline: null,
  target: null,
  current: null,
};

export function CaptureModal() {
  const { captureOpen, setCaptureOpen, capturePrefill, createItem, toast } =
    useLoop();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState<string>(MISSIONS[0]);
  const [owner, setOwner] = useState<string>("");
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [submitterType, setSubmitterType] = useState<"human" | "agent">("human");
  const [name, setName] = useState("");
  // Filled only by the idea-intake draft; carried into the created item so a
  // drafted problem statement / KR isn't silently dropped.
  const [problemStatement, setProblemStatement] = useState("");
  const [kr, setKr] = useState<Item["kr"] | null>(null);
  const [raw, setRaw] = useState("");
  const captureAi = useAiSuggestion<CaptureOutput>("capture");

  // When opened from the timeline the prefill carries a team (and a date range).
  // Seed the team select from it each time the modal opens. The dates aren't
  // editable here — they're applied at submit — so we just read them below.
  useEffect(() => {
    if (captureOpen) setMission(capturePrefill?.mission ?? MISSIONS[0]);
  }, [captureOpen, capturePrefill]);

  if (!captureOpen) return null;

  const scheduled = !!(
    capturePrefill?.targetStart && capturePrefill?.targetEnd
  );

  const close = () => {
    setCaptureOpen(false);
    setTitle("");
    setDescription("");
    setMission(MISSIONS[0]);
    setOwner("");
    setModuleId(null);
    setSubmitterType("human");
    setName("");
    setProblemStatement("");
    setKr(null);
    setRaw("");
  };

  const runDraft = async () => {
    if (!raw.trim()) return toast("Paste some text to draft from first.", true);
    const { data, error } = await captureAi.run({ text: raw });
    if (!data) return toast(error ?? "Couldn't draft from that text.", true);
    setTitle(data.title);
    setDescription(data.description);
    // The AI returns a team id (see capture.ts); the form stores the label.
    setMission(teamLabel(data.mission) || MISSIONS[0]);
    setProblemStatement(data.problemStatement);
    setKr(data.kr);
    setSubmitterType("agent");
    setName((n) => n || "Intake");
    toast("Drafted — review every field before adding.");
  };

  const submit = () => {
    const t = title.trim();
    if (!t) {
      toast("Give the idea a title first.", true);
      return;
    }
    const nowIso = new Date().toISOString();
    const item: Item = {
      id: genId(),
      title: t,
      description,
      mission,
      owner,
      moduleId,
      type: null,
      stage: "Intake",
      order: null,
      submitter: {
        type: submitterType,
        name: name || (submitterType === "agent" ? "Agent" : "Unknown"),
      },
      problemStatement,
      kr: kr ?? EMPTY_KR,
      horizon: null,
      targetStart: scheduled ? capturePrefill!.targetStart! : null,
      targetEnd: scheduled ? capturePrefill!.targetEnd! : null,
      dependsOn: [],
      betIds: [],
      fundedBetId: null,
      subItems: [],
      votes: 0,
      reach: 0,
      confidence: 0,
      strategicFit: 0,
      notionUrl: "",
      notionTitle: "",
      adoUrl: "",
      adoStatus: "",
      ahaUrl: "",
      ahaReference: "",
      ahaEndorsements: 0,
      prototypeUrl: "",
      prototypes: [],
      outcomeReading: "",
      whatWeLearned: "",
      whatWeDoDifferently: "",
      nextBet: "",
      killed: false,
      killedAt: null,
      killedReason: "",
      committedAt: null,
      shippedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      activity: scheduled
        ? [
            "Captured and placed on the timeline (" +
              fmtRange({
                targetStart: capturePrefill!.targetStart!,
                targetEnd: capturePrefill!.targetEnd!,
              }) +
              ").",
          ]
        : ["Captured."],
    };
    createItem(item);
    close();
    toast(scheduled ? "Added to the timeline." : "Added to Intake.");
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>
            Capture an idea
            {scheduled && (
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: "var(--cm-faint-fg)",
                }}
              >
                {" "}
                — lands on the timeline at{" "}
                {fmtRange({
                  targetStart: capturePrefill!.targetStart!,
                  targetEnd: capturePrefill!.targetEnd!,
                })}
              </span>
            )}
          </h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
        <div className="field ai-draft">
          <label>Draft from text (optional)</label>
          <textarea
            placeholder="Paste a Slack message, a ticket, or a sentence — the assistant drafts the fields below for you to review."
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="ai-inline">
            <SuggestButton
              loading={captureAi.loading}
              onClick={runDraft}
              title="Draft a roadmap item from the pasted text"
            >
              Draft item
            </SuggestButton>
          </div>
        </div>
        <div className="field">
          <label>Title</label>
          <input
            type="text"
            placeholder="Short, plain description of the idea"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            placeholder="A sentence or two of context. Not a problem statement yet, that comes at Solutioning."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Team</label>
            <select value={mission} onChange={(e) => setMission(e.target.value)}>
              {MISSIONS.map((m) => (
                <option key={m} value={m} title={MISSION_INFO[m]}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">— Unassigned —</option>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Submitted by</label>
            <div className="radio-group" style={{ marginTop: 10 }}>
              <label>
                <input
                  type="radio"
                  name="cap-submitter"
                  checked={submitterType === "human"}
                  onChange={() => setSubmitterType("human")}
                />{" "}
                Human
              </label>
              <label>
                <input
                  type="radio"
                  name="cap-submitter"
                  checked={submitterType === "agent"}
                  onChange={() => setSubmitterType("agent")}
                />{" "}
                Agent
              </label>
            </div>
          </div>
        </div>
        <ModuleSelect
          value={moduleId}
          mission={mission}
          onChange={setModuleId}
        />
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        </div>
        <div className="modal-actions">
          <span className="helper">
            New items land in Intake — parked, not yet worked, and not counted
            as portfolio capacity. Moving one to Discovery is the decision to
            spend time on it. Nothing reaches Building until the problem
            statement and KR are filled in and a prototype or evidence link is
            attached.
            {scheduled &&
              " Dates come from where you drew it on the timeline — you can drag to adjust later."}
          </span>
          <button className="cm-button" onClick={submit}>
            {scheduled ? "Add to timeline" : "Add to Intake"}
          </button>
        </div>
      </div>
    </div>
  );
}
