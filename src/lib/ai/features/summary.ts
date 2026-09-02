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

// `scope` narrows what's being narrated without changing the item shape:
//   "roadmap"  — the whole board (original behavior, still the default so the
//                whole-roadmap summary in ShareModal needs no changes).
//   "quarter"  — everything targeted for one fiscal quarter (a Horizon "by
//                quarter" column), already team-filtered by the caller.
//   "timeline" — whatever's currently visible on the Timeline after filters.
// Both narrower scopes carry a `scopeLabel` (a quarter name, or a description
// of the active filters) so the model can name what it's looking at instead of
// implying it saw the whole roadmap.
export const summaryBody = z.object({
  items: z.array(summaryItem).min(1),
  audience: z.enum(["exec", "team"]).default("exec"),
  scope: z.enum(["roadmap", "quarter", "timeline"]).default("roadmap"),
  scopeLabel: z.string().optional(),
});
export type SummaryInput = z.infer<typeof summaryBody>;

const roadmapSystem = [
  "Group by horizon: what's shipping Now, what's Next, what's Later. Lead with",
  "outcomes (the KRs), not activity.",
].join("\n");

const quarterSystem = [
  "Every item below is already scoped to one fiscal quarter, so do not group by",
  "horizon — instead write across teams, calling out cross-team themes, notable",
  "initiatives, and how they relate.",
].join("\n");

const timelineSystem = [
  "Every item below is whatever's currently visible on the timeline after the",
  "reader's filters, so do not assume it's the whole roadmap — write about",
  "sequencing and dependencies across teams and what's coming up next.",
].join("\n");

export const summarySystem = [
  "You write a concise roadmap update for Campminder's tool, Loop.",
  "Lead with outcomes (the KRs), not activity. Call out notable risks or gaps",
  "you can see in the data. Keep it to a few short paragraphs of plain prose —",
  "no headings longer than a line, no invented status. Write for the given",
  "audience. Follow the scope-specific instructions in the prompt.",
].join("\n");

const SCOPE_SYSTEM: Record<SummaryInput["scope"], string> = {
  roadmap: roadmapSystem,
  quarter: quarterSystem,
  timeline: timelineSystem,
};

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
  return [
    `Audience: ${i.audience}`,
    `Scope: ${i.scope}${i.scopeLabel ? ` — ${i.scopeLabel}` : ""}`,
    SCOPE_SYSTEM[i.scope],
    "Snapshot:",
    lines,
  ].join("\n");
}
