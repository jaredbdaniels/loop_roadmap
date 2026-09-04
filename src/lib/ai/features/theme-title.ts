import { z } from "zod";

// Turns a pasted quarter narrative (QuarterThemeModal's "why this quarter"
// paragraph) into a short, outcome-based headline — the QuarterlyTheme.title
// shown on the Timeline/Horizon quarter board. The draft is reviewed by a
// human before saving, same contract as every other AI suggestion.

export const themeTitleBody = z.object({
  narrative: z.string().min(1),
});
export type ThemeTitleInput = z.infer<typeof themeTitleBody>;

export const themeTitleOut = z.object({
  title: z.string(),
});
export type ThemeTitleOutput = z.infer<typeof themeTitleOut>;

export const themeTitleSystem = [
  "You write a short headline for one fiscal quarter's theme in Campminder's",
  "tool, Loop, from a narrative describing why the quarter matters.",
  "Name the outcome, not the activity: state the business value the quarter",
  "delivers so anyone in the organization understands it at a glance, rather",
  "than describing the work being done. For example prefer \"Camps get paid",
  "faster\" over \"Build payment processing improvements\". Use only what the",
  "narrative supports — do not invent scope. Six words or fewer where",
  "possible, no trailing period, no quotes around the title.",
].join("\n");

export function buildThemeTitlePrompt(i: ThemeTitleInput): string {
  return `Quarter narrative:\n\n${i.narrative}`;
}
