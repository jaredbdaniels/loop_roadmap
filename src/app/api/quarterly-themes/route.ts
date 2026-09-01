import { NextResponse } from "next/server";
import { getReadSession, getSession } from "@/lib/require-session";
import { quarterThemeId } from "@/lib/loop/logic";
import { getAllQuarterlyThemes, upsertQuarterlyTheme } from "@/lib/loop/store";
import type { QuarterlyTheme } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/quarterly-themes — every fiscal quarter's narrative theme.
// Readable with a session or the Loop MCP server's API key (see
// src/lib/mcp/auth.ts).
export async function GET(req: Request) {
  const sess = await getReadSession(req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ quarterlyThemes: await getAllQuarterlyThemes() });
}

// POST /api/quarterly-themes — save one quarter's theme. Always an upsert:
// `id` is the deterministic `quarter:<quarterIndex>` key, so there's no
// separate create vs. update distinction the way items/bets/milestones have.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const theme = (await req.json()) as QuarterlyTheme;
  if (!theme?.id || typeof theme.quarterIndex !== "number") {
    return NextResponse.json(
      { error: "id and quarterIndex required" },
      { status: 400 },
    );
  }
  if (theme.id !== quarterThemeId(theme.quarterIndex)) {
    return NextResponse.json(
      { error: "id must be `quarter:<quarterIndex>`" },
      { status: 400 },
    );
  }
  await upsertQuarterlyTheme(theme);
  return NextResponse.json({ ok: true, quarterlyTheme: theme });
}
