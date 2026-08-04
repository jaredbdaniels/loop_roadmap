import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/require-session";
import { aiEnabled, type ModelRole } from "./model";
import { suggest, suggestText } from "./suggest";

// The one place every /api/ai/<feature> route's ceremony lives, so a feature is
// just a schema + a prompt. Order of the gates matters:
//   401 unauthorized  — same session gate as every other mutating route
//   503 ai_disabled   — feature flag off or no provider key (UI already hides
//                        the button; this is defense in depth)
//   400 bad_input     — body failed its Zod schema
//   502 ai_unavailable— the model call itself threw (timeout, provider down)
// A 502 is deliberately distinct from 503 so the client can tell "turned off"
// from "tried and failed" and message accordingly.

async function guard(): Promise<NextResponse | null> {
  if (!(await getSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ai_disabled" }, { status: 503 });
  }
  return null;
}

async function parseBody<In>(
  req: Request,
  schema: z.ZodType<In>,
): Promise<{ ok: true; data: In } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "bad_input" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "bad_input", issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export interface ObjectFeature<In, Out> {
  bodySchema: z.ZodType<In>;
  outSchema: z.ZodType<Out>;
  system: string;
  buildPrompt: (input: In) => string;
  role?: ModelRole;
}

// Build a POST handler that returns a Zod-validated object suggestion.
export function aiObjectRoute<In, Out>(feature: ObjectFeature<In, Out>) {
  return async function POST(req: Request): Promise<NextResponse> {
    const blocked = await guard();
    if (blocked) return blocked;

    const body = await parseBody(req, feature.bodySchema);
    if (!body.ok) return body.res;

    try {
      const out = await suggest({
        role: feature.role,
        system: feature.system,
        prompt: feature.buildPrompt(body.data),
        schema: feature.outSchema,
      });
      return NextResponse.json(out);
    } catch (err) {
      console.error("[ai] object generation failed", err);
      return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
    }
  };
}

export interface TextFeature<In> {
  bodySchema: z.ZodType<In>;
  system: string;
  buildPrompt: (input: In) => string;
  role?: ModelRole;
}

// Build a POST handler that returns { text } prose.
export function aiTextRoute<In>(feature: TextFeature<In>) {
  return async function POST(req: Request): Promise<NextResponse> {
    const blocked = await guard();
    if (blocked) return blocked;

    const body = await parseBody(req, feature.bodySchema);
    if (!body.ok) return body.res;

    try {
      const text = await suggestText({
        role: feature.role,
        system: feature.system,
        prompt: feature.buildPrompt(body.data),
      });
      return NextResponse.json({ text });
    } catch (err) {
      console.error("[ai] text generation failed", err);
      return NextResponse.json({ error: "ai_unavailable" }, { status: 502 });
    }
  };
}
