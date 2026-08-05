import { z } from "zod";

// Explain this ranking. The rank number is computed server-side by
// `computeRank` (votes·w + reach·w + confidence·w + strategicFit·w); the model
// only narrates WHY the item sits where it does relative to its neighbours. It
// does no arithmetic and invents no scores.

const scores = z.object({
  votes: z.number(),
  reach: z.number(),
  confidence: z.number(),
  strategicFit: z.number(),
});

export const explainBody = z.object({
  title: z.string().min(1),
  scores,
  weights: scores,
  rank: z.number(),
  neighbors: z
    .array(
      z.object({
        title: z.string(),
        rank: z.number(),
        dir: z.enum(["above", "below"]),
      }),
    )
    .default([]),
});
export type ExplainInput = z.infer<typeof explainBody>;

export const explainSystem = [
  "You explain roadmap rankings in Campminder's tool, Loop.",
  "The rank score is already computed as a weighted sum:",
  "votes·w_votes + reach·w_reach + confidence·w_confidence + strategicFit·w_fit.",
  "In 2–3 plain sentences, say which weighted factors drive this item's position,",
  "and — if neighbours are given — what separates it from the one just above or",
  "below. Do not recompute the number, restate the raw inputs as a list, or",
  "recommend changes. Be concrete about which factor dominates.",
].join("\n");

export function buildExplainPrompt(i: ExplainInput): string {
  const contrib = (
    ["votes", "reach", "confidence", "strategicFit"] as const
  )
    .map(
      (k) => `${k}: ${i.scores[k]} × weight ${i.weights[k]} = ${i.scores[k] * i.weights[k]}`,
    )
    .join("\n");
  const neighbors = i.neighbors.length
    ? i.neighbors
        .map((n) => `- ${n.dir}: "${n.title}" (rank ${n.rank})`)
        .join("\n")
    : "(no neighbours provided)";
  return [
    `Item: ${i.title}`,
    `Computed rank score: ${i.rank}`,
    "Weighted contributions:",
    contrib,
    "Neighbours in the lane:",
    neighbors,
  ].join("\n");
}
