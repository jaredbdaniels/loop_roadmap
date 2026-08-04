import { aiTextRoute } from "@/lib/ai/handler";
import {
  buildExplainPrompt,
  explainBody,
  explainSystem,
} from "@/lib/ai/features/explain-rank";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiTextRoute({
  bodySchema: explainBody,
  system: explainSystem,
  buildPrompt: buildExplainPrompt,
});
