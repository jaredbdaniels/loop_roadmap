"use client";

import { useEffect, useRef, type RefObject } from "react";

// Shared "close this popover" behavior: an outside pointerdown or an Escape
// keypress while it's open. Originally written inline (and slightly
// differently) in both TeamFilter's team picker and IdeaSearch's results
// panel; centralized here so a future fix — touch support, a different
// dismiss trigger — only has to happen once.
//
// `onDismiss` is read through a ref rather than added to the effect's
// dependency array, so passing a fresh inline closure each render (the normal
// way call sites use this) doesn't tear down and re-attach the listeners.
export function useOutsideDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismissRef.current();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref]);
}
