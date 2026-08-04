"use client";

import { useLoop } from "./store";

export function Toasts() {
  const { toasts } = useLoop();
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.warn ? " warn" : "")}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
