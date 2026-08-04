import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { createScenario, listScenarios } from "@/lib/loop/store";

export const dynamic = "force-dynamic";

// GET /api/scenarios — the current user's scenarios (metadata only, no state).
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scenarios = await listScenarios(sess.user.email);
  return NextResponse.json({ scenarios });
}

// POST /api/scenarios — fork the live roadmap into a new named scenario.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name } = (await req.json()) as { name?: string };
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const scenario = await createScenario(trimmed, sess.user.email);
  return NextResponse.json({ scenario });
}
