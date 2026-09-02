import { aiTextRoute } from "@/lib/ai/handler";
import {
  buildThemeSummaryPrompt,
  themeSummaryBody,
  themeSummarySystem,
} from "@/lib/ai/features/theme-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiTextRoute({
  bodySchema: themeSummaryBody,
  system: themeSummarySystem,
  buildPrompt: buildThemeSummaryPrompt,
  role: "reasoning", // cross-bet synthesis benefits from the larger model
});
