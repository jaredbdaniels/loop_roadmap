import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { getAllMilestones, upsertMilestone } from "@/lib/loop/store";
import type { Milestone } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/milestones — all timeline milestones.
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const milestones = await getAllMilestones();
  return NextResponse.json({ milestones });
}

// POST /api/milestones — create a new milestone.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const milestone = (await req.json()) as Milestone;
  if (!milestone?.id || !milestone?.title) {
    return NextResponse.json({ error: "id and title required" }, { status: 400 });
  }
  await upsertMilestone(milestone);
  return NextResponse.json({ ok: true, milestone });
}
