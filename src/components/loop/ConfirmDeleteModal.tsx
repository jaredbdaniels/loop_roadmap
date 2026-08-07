"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// A dedicated confirmation screen for permanent deletes, layered on top of
// whatever modal triggered it. The warning icon shakes once on open to draw
// the eye, and confirming plays a short "poof" exit before the caller actually
// removes the record — so the animation always finishes before the item is
// gone, not after.
export function ConfirmDeleteModal({
  open,
  deleting,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  deleting: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, deleting, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay confirm-delete-overlay"
      onClick={(e) => e.target === e.currentTarget && !deleting && onCancel()}
    >
      <div className={"confirm-delete-modal" + (deleting ? " is-deleting" : "")}>
        <div className="confirm-delete-icon" aria-hidden>
          <AlertTriangle size={26} strokeWidth={2.2} />
        </div>
        <h3 className="confirm-delete-title">{title}</h3>
        <p className="confirm-delete-message">{message}</p>
        <div className="confirm-delete-actions">
          <button
            type="button"
            className="cm-button cm-button--ghost cm-button--small"
            onClick={onCancel}
            disabled={deleting}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="cm-button cm-button--danger cm-button--small"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
