import { z } from "zod";

// Roadmap narrative / exec summary. Turns a trimmed snapshot of the board into
// stakeholder-facing prose. The caller sends only non-sensitive fields (no
// killed items, no activity log) — see the trimming in the summary route.

const summaryItem = z.object({
  title: z.string(),
  mission: z.string(),
  stage: z.string(),
  horizon: z.string().nullable(),
  kr: z.string().default(""), // pre-rendered KR reading, e.g. "9 → 3 days (now 6)"
  window: z.string().default(""), // pre-rendered date range, e.g. "Aug–Oct 2026"
});

export const summaryBody = z.object({
  items: z.array(summaryItem).min(1),
  audience: z.enum(["exec", "team"]).default("exec"),
});
export type SummaryInput = z.infer<typeof summaryBody>;

export const summarySystem = [
  "You write a concise roadmap update for Campminder's tool, Loop.",
  "Group by horizon: what's shipping Now, what's Next, what's Later. Lead with",
  "outcomes (the KRs), not activity. Call out notable risks or gaps you can see",
  "in the data. Keep it to a few short paragraphs of plain prose — no headings",
  "longer than a line, no invented status. Write for the given audience.",
].join("\n");

export function buildSummaryPrompt(i: SummaryInput): string {
  const lines = i.items
    .map((it) => {
      const bits = [
        `- [${it.stage}${it.horizon ? `/${it.horizon}` : ""}] ${it.title} (${it.mission})`,
        it.kr ? ` — KR: ${it.kr}` : "",
        it.window ? ` — ${it.window}` : "",
      ];
      return bits.join("");
    })
    .join("\n");
  return [`Audience: ${i.audience}`, "Board snapshot:", lines].join("\n");
}
