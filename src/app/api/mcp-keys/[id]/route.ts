import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { revokeMcpApiKey } from "@/lib/mcp/keys";

export const dynamic = "force-dynamic";

// DELETE /api/mcp-keys/:id — revoke one of the signed-in user's own keys.
// Scoped to the caller in revokeMcpApiKey itself, so this can never revoke
// someone else's key even given their id.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await revokeMcpApiKey(sess.user.id, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
