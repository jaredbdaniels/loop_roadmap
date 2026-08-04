import { aiObjectRoute } from "@/lib/ai/handler";
import {
  buildRicePrompt,
  riceBody,
  riceOut,
  riceSystem,
} from "@/lib/ai/features/rice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiObjectRoute({
  bodySchema: riceBody,
  outSchema: riceOut,
  system: riceSystem,
  buildPrompt: buildRicePrompt,
});
