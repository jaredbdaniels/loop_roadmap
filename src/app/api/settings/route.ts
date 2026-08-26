import { NextResponse } from "next/server";
import { getReadSession, getSession } from "@/lib/require-session";
import { getWeights, setWeights } from "@/lib/loop/store";
import type { Weights } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/settings — ranking weights. Readable with a session or the Loop
// MCP server's API key (see src/lib/mcp/auth.ts).
export async function GET(req: Request) {
  const sess = await getReadSession(req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ weights: await getWeights() });
}

// PUT /api/settings — save ranking weights.
export async function PUT(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { weights } = (await req.json()) as { weights: Weights };
  await setWeights(weights);
  return NextResponse.json({ ok: true, weights });
}
