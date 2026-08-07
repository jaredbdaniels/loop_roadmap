import { z } from "zod";

// RICE score suggester. Given an item's framing, proposes the three scored
// axes Loop ranks on — reach, confidence, strategic fit — each on the app's
// 1–5 scale, with a one-sentence rationale.

export const riceBody = z.object({
  title: z.string().min(1),
  problemStatement: z.string().default(""),
  mission: z.string().default(""),
  description: z.string().default(""),
});
export type RiceInput = z.infer<typeof riceBody>;

const axis = z.number().int().min(1).max(5);

export const riceOut = z.object({
  reach: axis,
  confidence: axis,
  strategicFit: axis,
  rationale: z.object({
    reach: z.string(),
    confidence: z.string(),
    strategicFit: z.string(),
  }),
});
export type RiceOutput = z.infer<typeof riceOut>;

export const riceSystem = [
  "You score product roadmap items for Campminder's prioritization tool, Loop.",
  "Score three axes, each an integer from 1 (lowest) to 5 (highest):",
  "- reach: how many users/customers this affects.",
  "- confidence: how sure we are it will land and move the metric.",
  "- strategicFit: how well it serves the current company strategy.",
  "Base every score only on the framing you are given; when the framing is thin,",
  "prefer a middle score (3) and say so. Give a single crisp sentence of",
  "rationale per axis. Do not invent facts.",
].join("\n");

export function buildRicePrompt(i: RiceInput): string {
  return [
    `Title: ${i.title}`,
    i.mission ? `Team / domain: ${i.mission}` : null,
    i.description ? `Description: ${i.description}` : null,
    i.problemStatement ? `Problem statement: ${i.problemStatement}` : null,
    "",
    "Score reach, confidence, and strategic fit (1–5) with a one-sentence rationale each.",
  ]
    .filter(Boolean)
    .join("\n");
}
