"use client";

import { FileText, Lightbulb, Link2, ListChecks, PenTool } from "lucide-react";
import { itemLink, type ItemLinkKind } from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";

/**
 * The one link out to an item's artifact — brief, design, or ADO work item.
 *
 * Which artifact depends on the item's stage, resolved by `itemLink` (logic.ts).
 * Replaces the old fixed Notion-only link: an item in Deliver wants its work
 * item, not the brief it was framed from.
 *
 * One affordance per surface, deliberately. This used to be a `Brief` pill in
 * the card's pill row *and* a `+1 vote` button in its footer, which meant the
 * same URL appeared twice on the cards that had one and the footer's slot went
 * to an action nobody used. Now the footer carries the link and vote shrinks to
 * its count (see `VoteButton`).
 *
 * Two variants, because the pill row is no longer a call site: cards use the
 * labelled `action` button, and the surfaces with no room for a label (timeline
 * bar, team row) use `glyph`.
 *
 * Every call site sits inside a parent whose own click opens the detail modal,
 * and the timeline bar's parent additionally starts a drag on pointerdown. So
 * all three handlers have to be stopped: getting it wrong means clicking the
 * link silently reschedules the work.
 */

const ICONS: Record<ItemLinkKind, typeof FileText> = {
  brief: FileText,
  design: PenTool,
  ado: ListChecks,
  idea: Lightbulb,
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function ItemLink({
  item,
  variant,
  onRequestLink,
}: {
  item: Item;
  // `action` is the labelled button in a card footer; `glyph` is the compact
  // icon on a timeline bar or team row, where there's no room for a label.
  variant: "action" | "glyph";
  // Only the `action` variant renders an empty state, and only when given this:
  // "Link a doc", which opens the detail modal where the URL fields live. That
  // turns a dead button into the request it should be making. Omitted in share
  // mode, which has no modal to open and nothing to edit — a read-only viewer
  // gets no button rather than a dead one.
  onRequestLink?: () => void;
}) {
  const link = itemLink(item);

  if (!link) {
    if (variant !== "action" || !onRequestLink) return null;
    return (
      <button
        className="doc-link doc-link-empty"
        title="No brief, design or work item linked yet — add one"
        onClick={(e) => {
          stop(e);
          onRequestLink();
        }}
      >
        <Link2 size={12} strokeWidth={2.4} aria-hidden />
        Link a doc
      </button>
    );
  }

  const Icon = ICONS[link.kind];
  const title = link.detail ? `${link.label}: ${link.detail}` : link.label;

  return (
    <a
      className={variant === "action" ? "doc-link" : "tl-doc-glyph"}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
    >
      <Icon size={variant === "action" ? 12 : 10} strokeWidth={2.6} aria-hidden />
      {variant === "action" && <span>{link.label}</span>}
    </a>
  );
}

/**
 * The compact vote affordance that shares a card footer with `ItemLink`.
 *
 * Votes feed `computeRank`, which drives the Rank pill on the same card, so the
 * board keeps a one-click way to add one — it just no longer needs the footer's
 * labelled slot to do it. The count doubles as the label.
 */
export function VoteButton({
  votes,
  onVote,
}: {
  votes: number;
  onVote: () => void;
}) {
  return (
    <button
      className="vote-link vote-mini"
      title="Add a vote — votes feed the rank score"
      aria-label={`Add a vote (currently ${votes})`}
      onClick={(e) => {
        stop(e);
        onVote();
      }}
    >
      <span aria-hidden>▲</span>
      {votes || 0}
    </button>
  );
}
