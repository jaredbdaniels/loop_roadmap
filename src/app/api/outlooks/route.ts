import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { outlookId } from "@/lib/loop/logic";
import { getAllOutlooks, upsertOutlook } from "@/lib/loop/store";
import type { DeliveryOutlook } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/outlooks — every team's delivery outlook rows.
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ outlooks: await getAllOutlooks() });
}

// POST /api/outlooks — save one team-month outlook. Always an upsert: `id` is
// the deterministic `${mission}:${month}` key, so there's no separate create
// vs. update distinction the way items/bets/milestones have.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const outlook = (await req.json()) as DeliveryOutlook;
  if (!outlook?.id || !outlook?.mission || !outlook?.month) {
    return NextResponse.json(
      { error: "id, mission and month required" },
      { status: 400 },
    );
  }
  if (outlook.id !== outlookId(outlook.mission, outlook.month)) {
    return NextResponse.json(
      { error: "id must be `${mission}:${month}`" },
      { status: 400 },
    );
  }
  await upsertOutlook(outlook);
  return NextResponse.json({ ok: true, outlook });
}
