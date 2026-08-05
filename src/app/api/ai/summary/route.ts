import { aiTextRoute } from "@/lib/ai/handler";
import {
  buildSummaryPrompt,
  summaryBody,
  summarySystem,
} from "@/lib/ai/features/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiTextRoute({
  bodySchema: summaryBody,
  system: summarySystem,
  buildPrompt: buildSummaryPrompt,
  role: "reasoning", // whole-board synthesis benefits from the larger model
});
