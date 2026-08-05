import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { deleteBet, upsertBet } from "@/lib/loop/store";
import type { Bet } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// PATCH /api/initiatives/:id — replace the bet with the posted object.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const init = (await req.json()) as Bet;
  if (init.id !== id) {
    return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  }
  await upsertBet(init);
  return NextResponse.json({ ok: true, bet: init });
}

// DELETE /api/initiatives/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteBet(id);
  return NextResponse.json({ ok: true });
}
