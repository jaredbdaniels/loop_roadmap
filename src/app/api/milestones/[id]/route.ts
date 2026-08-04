import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { deleteMilestone, upsertMilestone } from "@/lib/loop/store";
import type { Milestone } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// PATCH /api/milestones/:id — replace the milestone with the posted object.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const milestone = (await req.json()) as Milestone;
  if (milestone.id !== id) {
    return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  }
  await upsertMilestone(milestone);
  return NextResponse.json({ ok: true, milestone });
}

// DELETE /api/milestones/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteMilestone(id);
  return NextResponse.json({ ok: true });
}
