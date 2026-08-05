import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Provider-agnostic model factory. The rest of the app asks for a *role*
// ("fast" | "reasoning"), never a concrete model or provider, so the whole
// integration swaps providers by editing THIS FILE only (plus an env var and,
// for a new provider, installing its adapter). Nothing downstream — routes,
// prompts, UI — knows or cares which model answered.
export type ModelRole = "fast" | "reasoning";

type Provider = "openai" | "anthropic";

function activeProvider(): Provider {
  return (process.env.AI_PROVIDER as Provider) ?? "openai";
}

export function model(role: ModelRole = "fast"): LanguageModel {
  switch (activeProvider()) {
    case "openai": {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      // "reasoning" gets the larger model; interactive suggestions use "fast".
      return openai(role === "reasoning" ? "gpt-5" : "gpt-5-mini");
    }
    case "anthropic": {
      // To enable: `npm i @ai-sdk/anthropic`, set ANTHROPIC_API_KEY, then
      // replace this throw with the two commented lines below.
      // const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      // return anthropic(role === "reasoning" ? "claude-opus-4-8" : "claude-haiku-4-5");
      throw new Error(
        "AI_PROVIDER=anthropic needs the @ai-sdk/anthropic adapter installed — see docs/phase-1-ai-plan.md.",
      );
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${activeProvider()}`);
  }
}

// The master flag. AI features render nothing and every /api/ai route 503s
// unless this is set — the staged-rollout switch.
export function aiFeaturesEnabled(): boolean {
  return process.env.AI_FEATURES === "1";
}

// True only when the feature flag is on AND the active provider has a key. This
// is the single check both the routes and (via /api/ai/status) the UI use, so a
// missing key degrades to "feature hidden" instead of a 500 at call time.
export function aiEnabled(): boolean {
  if (!aiFeaturesEnabled()) return false;
  switch (activeProvider()) {
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    default:
      return false;
  }
}
