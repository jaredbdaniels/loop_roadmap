import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { deleteItem, upsertItem } from "@/lib/loop/store";
import type { Item } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// PATCH /api/items/:id — replace the item with the posted full object.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = (await req.json()) as Item;
  if (item.id !== id) {
    return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  }
  await upsertItem(item);
  return NextResponse.json({ ok: true, item });
}

// DELETE /api/items/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteItem(id);
  return NextResponse.json({ ok: true });
}
