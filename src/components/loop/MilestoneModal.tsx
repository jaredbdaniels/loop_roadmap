"use client";

import { useState } from "react";
import { BET_COLORS } from "@/lib/loop/constants";
import { genId } from "@/lib/loop/logic";
import type { Milestone } from "@/lib/loop/types";
import { useLoop } from "./store";

// Create or edit a point-in-time milestone: title, date, color, and an optional
// description. `milestoneEdit` is "new" to create, or an existing milestone id.
export function MilestoneModal() {
  const {
    milestoneEdit,
    closeMilestone,
    milestones,
    createMilestone,
    updateMilestone,
    removeMilestone,
    toast,
    readOnly,
  } = useLoop();

  const existing =
    milestoneEdit && milestoneEdit !== "new"
      ? milestones.find((m) => m.id === milestoneEdit) ?? null
      : null;
  const isNew = milestoneEdit === "new";

  // Keyed by the target milestone so switching which one is open resets the form.
  return milestoneEdit ? (
    <MilestoneForm
      key={milestoneEdit}
      existing={existing}
      isNew={isNew}
      readOnly={readOnly}
      onClose={closeMilestone}
      onCreate={createMilestone}
      onUpdate={updateMilestone}
      onDelete={removeMilestone}
      toast={toast}
    />
  ) : null;
}

function MilestoneForm({
  existing,
  isNew,
  readOnly,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  toast,
}: {
  existing: Milestone | null;
  isNew: boolean;
  readOnly: boolean;
  onClose: () => void;
  onCreate: (m: Milestone) => void;
  onUpdate: (m: Milestone) => void;
  onDelete: (id: string) => void;
  toast: (msg: string, warn?: boolean) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [color, setColor] = useState(existing?.color ?? BET_COLORS[0]);

  const save = () => {
    const t = title.trim();
    if (!t) {
      toast("Give the milestone a title first.", true);
      return;
    }
    if (!date) {
      toast("Pick a date for the milestone.", true);
      return;
    }
    const nowIso = new Date().toISOString();
    const milestone: Milestone = {
      id: existing?.id ?? genId(),
      title: t,
      date,
      color,
      description,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    if (isNew) {
      onCreate(milestone);
      toast("Milestone created.");
    } else {
      onUpdate(milestone);
      toast("Milestone saved.");
    }
    onClose();
  };

  const del = () => {
    if (!existing) return;
    onDelete(existing.id);
    toast("Milestone deleted.");
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h2>{isNew ? "New milestone" : "Edit milestone"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          {/* Read-only share view: fields are disabled and the action buttons
              below are hidden, so viewers can read but not edit. */}
          <fieldset
            disabled={readOnly}
            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              placeholder="e.g. Beta launch"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              placeholder="What this milestone marks and why it matters."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Color</label>
            <div className="init-swatches">
              {BET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"init-swatch" + (c === color ? " active" : "")}
                  style={{ background: c }}
                  aria-label={"Use color " + c}
                  aria-pressed={c === color}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          </fieldset>
        </div>
        <div className="modal-actions">
          {!isNew && existing && !readOnly ? (
            <button className="link-button danger" onClick={del}>
              Delete milestone
            </button>
          ) : (
            <span className="helper">
              A milestone is a single date, pinned as a flag across the top of the
              timeline. Drag the flag later to reschedule it.
            </span>
          )}
          {!readOnly && (
            <button className="cm-button" onClick={save}>
              {isNew ? "Create milestone" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
