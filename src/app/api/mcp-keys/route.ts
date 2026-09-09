import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { createMcpApiKey, listMcpApiKeys } from "@/lib/mcp/keys";

export const dynamic = "force-dynamic";

// GET /api/mcp-keys — the signed-in user's own personal MCP keys (never the
// hash or plaintext — just enough to manage them: label, prefix, timestamps).
// Deliberately gated with getSession(), not getReadSession(): managing keys
// is not itself something an MCP client should be able to do with a key.
export async function GET() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const keys = await listMcpApiKeys(sess.user.id);
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    })),
  });
}

// POST /api/mcp-keys — mint a new personal key for the signed-in user.
// Returns the plaintext once; it can never be recovered afterward.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const { id, key } = await createMcpApiKey(sess.user.id, body?.name);
  return NextResponse.json({ id, key });
}
