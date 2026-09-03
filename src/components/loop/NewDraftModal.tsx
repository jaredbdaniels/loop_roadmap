"use client";

import { useEffect, useState } from "react";
import { Copy, FilePlus2 } from "lucide-react";

export type NewDraftMode = "clone" | "blank";

// Asks for a name and how the new draft should start: a full copy of the
// live roadmap (the old flow's only option — see LoopApp's onScenarioChange,
// which used to go straight to window.prompt), or a blank board for someone
// planning a reorg or a new initiative from scratch rather than pruning
// dozens of existing cards first.
export function NewDraftModal({
  open,
  creating,
  onCreate,
  onCancel,
}: {
  open: boolean;
  creating: boolean;
  onCreate: (name: string, mode: NewDraftMode) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<NewDraftMode>("clone");

  // Reset to the defaults each time the modal is (re)opened, so a previous
  // draft's name/choice never leaks into the next one.
  useEffect(() => {
    if (open) {
      setName("");
      setMode("clone");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !creating) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, creating, onCancel]);

  if (!open) return null;

  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || creating) return;
    onCreate(trimmed, mode);
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !creating && onCancel()}
    >
      <div className="modal modal--narrow">
        <div className="modal-header">
          <h2>New scenario</h2>
          <button
            className="modal-close"
            onClick={onCancel}
            aria-label="Close"
            disabled={creating}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              placeholder='e.g. "Q3 reshuffle"'
              value={name}
              autoFocus
              disabled={creating}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="field">
            <label>Start from</label>
            <div className="new-draft-options" role="radiogroup" aria-label="Start from">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "clone"}
                className={"new-draft-option" + (mode === "clone" ? " active" : "")}
                disabled={creating}
                onClick={() => setMode("clone")}
              >
                <span className="new-draft-option-title">
                  <Copy size={14} strokeWidth={2.2} />
                  Clone the live roadmap
                </span>
                <span className="new-draft-option-desc">
                  A full copy of every item, bet, and milestone as they stand today.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "blank"}
                className={"new-draft-option" + (mode === "blank" ? " active" : "")}
                disabled={creating}
                onClick={() => setMode("blank")}
              >
                <span className="new-draft-option-title">
                  <FilePlus2 size={14} strokeWidth={2.2} />
                  Start blank
                </span>
                <span className="new-draft-option-desc">
                  An empty board — nothing carried over from the live roadmap.
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="link-button" onClick={onCancel} disabled={creating}>
            Cancel
          </button>
          <button className="cm-button" onClick={submit} disabled={creating || !trimmed}>
            {creating ? "Creating…" : "Create scenario"}
          </button>
        </div>
      </div>
    </div>
  );
}
