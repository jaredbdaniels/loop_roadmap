import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import {
  createShareLink,
  getActiveShareLink,
  revokeShareLink,
} from "@/lib/loop/share";

export const dynamic = "force-dynamic";

// GET /api/share — the current active read-only link, or null.
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const link = await getActiveShareLink();
  return NextResponse.json({
    link: link
      ? {
          token: link.token,
          createdBy: link.createdBy,
          createdAt: link.createdAt,
        }
      : null,
  });
}

// POST /api/share — generate or regenerate the active link (rotates the secret).
export async function POST() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = await createShareLink(sess.user.email);
  return NextResponse.json({ token });
}

// DELETE /api/share — revoke the active link.
export async function DELETE() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const link = await getActiveShareLink();
  if (link) await revokeShareLink(link.token);
  return NextResponse.json({ ok: true });
}
