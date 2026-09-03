// Shared length/format vocabulary for the "summary" and "theme-summary" AI
// features — kept in one place so the two features' instruction wording
// can't silently drift apart (see their own file comments: theme-summary is
// explicitly "same shape and intent" as summary).

export const SUMMARY_LENGTHS = ["short", "medium", "long"] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

export const SUMMARY_FORMATS = ["prose", "bullets"] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number];

export const LENGTH_SYSTEM: Record<SummaryLength, string> = {
  short:
    "Be brief — one to two sentences (or two to three bullets, if using bullets). State only the single most important point.",
  medium:
    "Use a moderate level of detail — a few short paragraphs (or five to eight bullets, if using bullets).",
  long: [
    "Go deeper than the default: add supporting context, secondary risks, and",
    "notable detail, while staying readable and avoiding padding.",
  ].join("\n"),
};

export const FORMAT_SYSTEM: Record<SummaryFormat, string> = {
  prose: "Write in plain prose paragraphs, not bullet points.",
  bullets:
    "Write as a bullet list — one bullet per point, no nested sub-bullets, no preamble sentence before the list.",
};
