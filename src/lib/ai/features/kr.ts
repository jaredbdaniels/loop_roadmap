import { z } from "zod";

// KR sharpener. Turns a vague goal into a structured, measurable Key Result
// matching Loop's KeyResult shape. Leaves `current` null unless the input
// states a reading; `baseline`/`target` are proposed but always human-editable.

// Mirrors the KeyResult interface in src/lib/loop/types.ts.
export const krShape = z.object({
  statement: z.string(),
  metric: z.string(),
  unit: z.string(),
  baseline: z.number().nullable(),
  target: z.number().nullable(),
  current: z.number().nullable(),
});
export type KrShape = z.infer<typeof krShape>;

export const krBody = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  goal: z.string().min(1), // free-text goal or existing KR statement
});
export type KrInput = z.infer<typeof krBody>;

export const krOut = krShape;
export type KrOutput = KrShape;

export const krSystem = [
  "You turn vague goals into measurable Key Results for Campminder's tool, Loop.",
  "Produce one KR with: a single quantitative metric; its unit; a numeric",
  "baseline (today's value) and target (the goal); and current (null unless the",
  "input states it). `statement` is a plain sentence like",
  "'Cut X from <baseline> to <target> <unit>.' Choose a defensible target; if the",
  "input gives no numbers, propose reasonable ones and reflect that in the",
  "statement. Never fabricate a `current` reading.",
].join("\n");

export function buildKrPrompt(i: KrInput): string {
  return [
    i.title ? `Title: ${i.title}` : null,
    i.description ? `Description: ${i.description}` : null,
    `Goal: ${i.goal}`,
  ]
    .filter(Boolean)
    .join("\n");
}
