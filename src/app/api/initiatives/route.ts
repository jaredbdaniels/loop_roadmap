import { NextResponse } from "next/server";
import { getReadSession, getSession } from "@/lib/require-session";
import { getAllBets, upsertBet } from "@/lib/loop/store";
import type { Bet } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/initiatives — all cross-team bets. Readable with a session or the
// Loop MCP server's API key (see src/lib/mcp/auth.ts).
export async function GET(req: Request) {
  const sess = await getReadSession(req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bets = await getAllBets();
  return NextResponse.json({ bets });
}

// POST /api/initiatives — create a new bet.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const init = (await req.json()) as Bet;
  if (!init?.id || !init?.title) {
    return NextResponse.json({ error: "id and title required" }, { status: 400 });
  }
  await upsertBet(init);
  return NextResponse.json({ ok: true, bet: init });
}
