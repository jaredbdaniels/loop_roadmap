import { aiObjectRoute } from "@/lib/ai/handler";
import {
  buildCritiquePrompt,
  critiqueBody,
  critiqueOut,
  critiqueSystem,
} from "@/lib/ai/features/critique";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiObjectRoute({
  bodySchema: critiqueBody,
  outSchema: critiqueOut,
  system: critiqueSystem,
  buildPrompt: buildCritiquePrompt,
});
