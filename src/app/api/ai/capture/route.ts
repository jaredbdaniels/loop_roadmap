import { aiObjectRoute } from "@/lib/ai/handler";
import {
  buildCapturePrompt,
  captureBody,
  captureOut,
  captureSystem,
} from "@/lib/ai/features/capture";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = aiObjectRoute({
  bodySchema: captureBody,
  outSchema: captureOut,
  system: captureSystem,
  buildPrompt: buildCapturePrompt,
});
