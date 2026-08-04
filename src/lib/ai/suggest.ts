import "server-only";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { model, type ModelRole } from "./model";

// Structured suggestion: the model must return an object matching `schema`.
// The AI SDK re-prompts on a schema miss, so callers get a validated `T` back
// (or this throws, which routes translate to a 502). This is the workhorse for
// every "draft some fields for the human to accept" feature.
export async function suggest<T>(opts: {
  role?: ModelRole;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
}): Promise<T> {
  const { object } = await generateObject({
    model: model(opts.role ?? "fast"),
    schema: opts.schema,
    system: opts.system,
    prompt: opts.prompt,
  });
  return object;
}

// Prose suggestion, for the two features whose output is narrative rather than
// structured (explain-ranking, roadmap summary).
export async function suggestText(opts: {
  role?: ModelRole;
  system: string;
  prompt: string;
}): Promise<string> {
  const { text } = await generateText({
    model: model(opts.role ?? "fast"),
    system: opts.system,
    prompt: opts.prompt,
  });
  return text.trim();
}
