"use client";

import type { ReactNode } from "react";
import type { QuarterlyTheme } from "@/lib/loop/types";

// The clickable quarter-theme label shown on both the Timeline's quarter
// ruler and the Horizon quarter board: a title in share mode is a plain
// span, a title in edit mode is a button that opens the editor, and no
// title in edit mode is an "add a theme" button (nothing renders in share
// mode). Each surface keeps its own classNames, empty-state copy and
// tooltip placement — see TimelineView.tsx / HorizonView.tsx.
export function QuarterThemeAffordance({
  theme,
  shareMode,
  onOpen,
  className,
  emptyClassName,
  filledTitle,
  emptyTitle,
  emptyContent,
}: {
  theme: QuarterlyTheme | undefined;
  shareMode: boolean;
  onOpen: () => void;
  className: string;
  emptyClassName: string;
  filledTitle?: string;
  emptyTitle?: string;
  emptyContent: ReactNode;
}) {
  if (theme?.title) {
    return shareMode ? (
      <span className={className} title={filledTitle}>
        {theme.title}
      </span>
    ) : (
      <button
        type="button"
        className={className}
        title={filledTitle}
        onClick={onOpen}
      >
        {theme.title}
      </button>
    );
  }
  if (shareMode) return null;
  return (
    <button
      type="button"
      className={`${className} ${emptyClassName}`}
      title={emptyTitle}
      onClick={onOpen}
    >
      {emptyContent}
    </button>
  );
}
