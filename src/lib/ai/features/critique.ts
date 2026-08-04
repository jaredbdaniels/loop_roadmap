import { z } from "zod";

// Problem-statement critique. Grades framing quality, returns the 2–3
// sharpening questions worth answering, and a tighter rewrite the human can
// accept into the field.

export const critiqueBody = z.object({
  title: z.string().default(""),
  problemStatement: z.string().min(1),
});
export type CritiqueInput = z.infer<typeof critiqueBody>;

export const critiqueOut = z.object({
  score: z.number().int().min(1).max(5),
  questions: z.array(z.string()).min(2).max(3),
  rewrite: z.string(),
});
export type CritiqueOutput = z.infer<typeof critiqueOut>;

export const critiqueSystem = [
  "You critique problem statements for Campminder's roadmap tool, Loop.",
  "A strong problem statement names WHO has the problem, WHAT is broken, and WHY",
  "it matters — and is not a disguised feature description.",
  "Return: a score 1 (vague) to 5 (sharp); 2–3 specific sharpening questions the",
  "author should answer; and a tighter rewrite that keeps only what's supported",
  "by the input (no invented facts). If the input is already sharp, the rewrite",
  "may be a light edit.",
].join("\n");

export function buildCritiquePrompt(i: CritiqueInput): string {
  return [
    i.title ? `Title: ${i.title}` : null,
    `Problem statement:\n${i.problemStatement}`,
  ]
    .filter(Boolean)
    .join("\n");
}
