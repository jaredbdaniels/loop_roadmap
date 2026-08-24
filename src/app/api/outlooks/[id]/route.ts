import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { outlookId } from "@/lib/loop/logic";
import { upsertOutlook } from "@/lib/loop/store";
import type { DeliveryOutlook } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// PATCH /api/outlooks/:id — replace the outlook with the posted full object.
// No DELETE: an outlook with nothing stated is the same as no row (the UI
// reads a missing id as `level: null`), so there's nothing worth deleting.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const outlook = (await req.json()) as DeliveryOutlook;
  if (outlook.id !== id) {
    return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  }
  if (!outlook.mission || !outlook.month) {
    return NextResponse.json(
      { error: "mission and month required" },
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
