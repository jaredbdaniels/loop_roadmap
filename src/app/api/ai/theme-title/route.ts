import { aiObjectRoute } from "@/lib/ai/handler";
import {
  buildThemeTitlePrompt,
  themeTitleBody,
  themeTitleOut,
  themeTitleSystem,
} from "@/lib/ai/features/theme-title";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiObjectRoute({
  bodySchema: themeTitleBody,
  outSchema: themeTitleOut,
  system: themeTitleSystem,
  buildPrompt: buildThemeTitlePrompt,
});
