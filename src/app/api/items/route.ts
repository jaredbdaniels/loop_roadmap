import { NextResponse } from "next/server";
import { getReadSession, getSession } from "@/lib/require-session";
import { getState, upsertItem } from "@/lib/loop/store";
import type { Item } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/items — full shared state (items + weights). Seeds on first call.
// Readable with a session or the Loop MCP server's API key (see
// src/lib/mcp/auth.ts) — this is the read-only surface, not a write bypass.
export async function GET(req: Request) {
  const sess = await getReadSession(req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = await getState();
  return NextResponse.json(state);
}

// POST /api/items — create a new item.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const item = (await req.json()) as Item;
  if (!item?.id || !item?.title) {
    return NextResponse.json({ error: "id and title required" }, { status: 400 });
  }
  await upsertItem(item);
  return NextResponse.json({ ok: true, item });
}
