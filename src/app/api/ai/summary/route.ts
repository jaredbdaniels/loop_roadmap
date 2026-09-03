import { aiTextRoute } from "@/lib/ai/handler";
import {
  buildSummaryPrompt,
  summaryBody,
  summarySystem,
} from "@/lib/ai/features/summary";

export const dynamic = "force-dynamic";
// Whole-board synthesis on the "reasoning" model runs long enough to blow the
// generic 30s AI-route budget (see runtime logs: 8 timeouts/day on this
// route). vercel.json already budgets 60s for API routes in general; make
// this route actually use it instead of the smaller per-route override.
export const maxDuration = 60;

export const POST = aiTextRoute({
  bodySchema: summaryBody,
  system: summarySystem,
  buildPrompt: buildSummaryPrompt,
  role: "reasoning", // whole-board synthesis benefits from the larger model
});
