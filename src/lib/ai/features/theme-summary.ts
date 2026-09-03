import { z } from "zod";

// Portfolio narrative for one of Loop's cross-functional bet themes (Protect,
// Grow, New logos — see BET_THEME_LABELS). Same shape and intent as the
// roadmap `summary` feature (features/summary.ts), but over Bets rather than
// Items, since a bet's thesis/tier/value have no Item equivalent.

const themeBetItem = z.object({
  title: z.string(),
  thesis: z.string().default(""),
  tier: z.string(),
  goalArea: z.string(),
  status: z.string(),
  horizon: z.string().nullable(),
  value: z.string().default(""), // pre-rendered value reading, e.g. "$1.2M in new revenue (modeled)"
});

export const themeSummaryBody = z.object({
  theme: z.string(), // display label, e.g. "Grow"
  bets: z.array(themeBetItem).min(1),
  audience: z.enum(["exec", "team"]).default("exec"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  format: z.enum(["prose", "bullets"]).default("prose"),
});
export type ThemeSummaryInput = z.infer<typeof themeSummaryBody>;

export const themeSummarySystem = [
  "You write a concise portfolio narrative for one annual theme in Campminder's",
  "tool, Loop. Describe how the bets under this theme fit together: the shared",
  "thesis, notable bets and their status, and any risk or gaps you can see in",
  "the data (e.g. a bet with no thesis, no declared value, or stalled status).",
  "No headings longer than a line, no invented status. Write for the given",
  "audience. Follow the length and format instructions in the prompt.",
].join("\n");

const LENGTH_SYSTEM: Record<ThemeSummaryInput["length"], string> = {
  short:
    "Be brief — one to two sentences (or two to three bullets, if using bullets). State only the single most important point.",
  medium:
    "Use a moderate level of detail — a few short paragraphs (or five to eight bullets, if using bullets).",
  long: [
    "Go deeper than the default: add supporting context, secondary risks, and",
    "notable detail, while staying readable and avoiding padding.",
  ].join("\n"),
};

const FORMAT_SYSTEM: Record<ThemeSummaryInput["format"], string> = {
  prose: "Write in plain prose paragraphs, not bullet points.",
  bullets:
    "Write as a bullet list — one bullet per point, no nested sub-bullets, no preamble sentence before the list.",
};

export function buildThemeSummaryPrompt(i: ThemeSummaryInput): string {
  const lines = i.bets
    .map((b) => {
      const bits = [
        `- [${b.status}/${b.tier}] ${b.title} (${b.goalArea})`,
        b.horizon ? ` — ${b.horizon}` : "",
        b.thesis ? ` — thesis: ${b.thesis}` : "",
        b.value ? ` — worth ${b.value}` : "",
      ];
      return bits.join("");
    })
    .join("\n");
  return [
    `Audience: ${i.audience}`,
    `Theme: ${i.theme}`,
    `Length: ${i.length}`,
    LENGTH_SYSTEM[i.length],
    `Format: ${i.format}`,
    FORMAT_SYSTEM[i.format],
    "Bets:",
    lines,
  ].join("\n");
}
