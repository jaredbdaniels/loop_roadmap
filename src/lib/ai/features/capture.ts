import { z } from "zod";
import { TEAMS, TEAM_IDS } from "@/lib/loop/taxonomy";
import { krShape } from "./kr";

// Idea intake copilot. Extracts a draft roadmap item from free text (a pasted
// Slack thread, a sentence, a ticket). The draft is human-reviewed in
// CaptureModal before anything is created; on acceptance the item's submitter is
// stamped as an agent.

// `mission` is an enum of team *ids*, not display labels. Team labels contain an
// em dash ("Platform — Payments"); a model asked to reproduce one exactly will
// sometimes emit a hyphen or en dash instead, which fails schema validation and
// errors the whole capture. Ids are lowercase ASCII, so there is nothing to get
// subtly wrong. CaptureModal maps the id back to a label with teamLabel().
//
// z.enum needs a literal tuple; TEAM_IDS is a string[] derived from the taxonomy.
// The cast keeps the runtime values (all team ids) while satisfying the signature.
const missionEnum = z.enum(TEAM_IDS as unknown as [string, ...string[]]);

export const captureBody = z.object({
  text: z.string().min(1),
});
export type CaptureInput = z.infer<typeof captureBody>;

export const captureOut = z.object({
  title: z.string(),
  description: z.string(),
  problemStatement: z.string(),
  mission: missionEnum,
  kr: krShape.nullable(),
});
export type CaptureOutput = z.infer<typeof captureOut>;

export const captureSystem = [
  "You extract a draft roadmap item from raw text for Campminder's tool, Loop.",
  "Pick the single best-fit team and return its id (the value before the dash),",
  `choosing from: ${TEAMS.map((t) => `${t.id} = ${t.label}`).join("; ")}.`,
  "Produce a short title, a one/two-sentence description, and a problem",
  "statement (who/what/why). If the text implies something measurable, draft a",
  "KR; otherwise return kr as null. Use only what the text supports — do not",
  "invent scope. The draft is reviewed by a human before anything is saved.",
].join("\n");

export function buildCapturePrompt(i: CaptureInput): string {
  return `Raw text to turn into a roadmap item:\n\n${i.text}`;
}
