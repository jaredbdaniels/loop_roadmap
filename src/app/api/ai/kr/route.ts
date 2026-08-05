import { aiObjectRoute } from "@/lib/ai/handler";
import { buildKrPrompt, krBody, krOut, krSystem } from "@/lib/ai/features/kr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiObjectRoute({
  bodySchema: krBody,
  outSchema: krOut,
  system: krSystem,
  buildPrompt: buildKrPrompt,
});
