"use client";

import { FileText } from "lucide-react";

/**
 * A link out to an item's product brief in Notion.
 *
 * Loop references Notion, it never mirrors it (Loop/INTEGRATIONS.md: "Notion
 * owns narrative"). Every card and bar in the app opens Loop's own detail modal
 * on click, which is the fast path for KRs, dates and dependencies — so this is
 * an additional affordance beside that, not a replacement for it. Click the tile
 * to stay in Loop; click this to go read the brief.
 *
 * Extracted rather than inlined at each call site because all four surfaces
 * (timeline bar, board card, team row, horizon card) sit inside a parent whose
 * own click opens the modal, and the timeline bar's parent additionally starts a
 * drag on pointerdown. Every one of them needs the same stopPropagation pair,
 * and getting it wrong means clicking the link silently reschedules the work.
 */
export function NotionLink({
  url,
  title,
  variant,
}: {
  url: string;
  // The Notion page title, when the item records one. Used for the tooltip only.
  title?: string;
  // `pill` sits in a card's pill row; `glyph` is the compact icon on a
  // timeline bar, where there's no room for a label.
  variant: "pill" | "glyph";
}) {
  if (!url) return null;
  const label = title ? `Open in Notion: ${title}` : "Open the product brief in Notion";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <a
      className={variant === "pill" ? "pill pill-notion" : "tl-notion-glyph"}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
    >
      <FileText size={variant === "pill" ? 11 : 10} strokeWidth={2.6} aria-hidden />
      {variant === "pill" && <span>Brief</span>}
    </a>
  );
}
