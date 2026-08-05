import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { deleteScenario, getScenario, saveScenario } from "@/lib/loop/store";
import type { LoopState } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/scenarios/:id — one scenario with its full state (owner only).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const scenario = await getScenario(id, sess.user.email);
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ scenario });
}

// PUT /api/scenarios/:id — replace the scenario's working state (owner only).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as { state?: LoopState };
  if (!body?.state || !Array.isArray(body.state.items)) {
    return NextResponse.json({ error: "state.items required" }, { status: 400 });
  }
  const ok = await saveScenario(id, sess.user.email, body.state);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/scenarios/:id — discard the scenario (owner only).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteScenario(id, sess.user.email);
  return NextResponse.json({ ok: true });
}
