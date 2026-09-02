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
});
export type ThemeSummaryInput = z.infer<typeof themeSummaryBody>;

export const themeSummarySystem = [
  "You write a concise portfolio narrative for one annual theme in Campminder's",
  "tool, Loop. Describe how the bets under this theme fit together: the shared",
  "thesis, notable bets and their status, and any risk or gaps you can see in",
  "the data (e.g. a bet with no thesis, no declared value, or stalled status).",
  "Keep it to a few short paragraphs of plain prose — no headings longer than a",
  "line, no invented status. Write for the given audience.",
].join("\n");

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
  return [`Audience: ${i.audience}`, `Theme: ${i.theme}`, "Bets:", lines].join("\n");
}
