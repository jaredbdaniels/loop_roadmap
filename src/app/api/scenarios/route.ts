import { NextResponse } from "next/server";
import { getReadSession, getSession, isMcpSession } from "@/lib/require-session";
import { MCP_SERVICE_EMAIL } from "@/lib/mcp/auth";
import { createScenario, listScenarios } from "@/lib/loop/store";
import type { ScenarioKind } from "@/lib/loop/types";

export const dynamic = "force-dynamic";

// GET /api/scenarios — the current user's scenarios (metadata only, no
// state). Readable with a session or the Loop MCP server's API key; the
// service identity owns nothing, so a key only ever sees the locked
// Headlights archives (see MCP_SERVICE_EMAIL in src/lib/mcp/auth.ts), never a
// human's private what-if drafts.
export async function GET(req: Request) {
  const sess = await getReadSession(req);
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scenarios = await listScenarios(sess.user.email);
  // The MCP key has no personal identity of its own; don't leak the real
  // human email that forked a shared Headlights archive to whatever agent
  // holds the shared key.
  const visible = isMcpSession(sess)
    ? scenarios.map((s) => ({ ...s, createdBy: MCP_SERVICE_EMAIL }))
    : scenarios;
  return NextResponse.json({ scenarios: visible });
}

// POST /api/scenarios — fork the live roadmap into a new named scenario.
// `kind` defaults to "whatif"; "headlights-archive" forks a locked snapshot
// (see ScenarioKind in types.ts). `mode` defaults to "clone" (copy the live
// roadmap's content); "blank" starts the draft with nothing in it — see
// createScenario in store.ts.
export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name, kind: kindRaw, mode: modeRaw } = (await req.json()) as {
    name?: string;
    kind?: string;
    mode?: string;
  };
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (
    kindRaw !== undefined &&
    kindRaw !== "whatif" &&
    kindRaw !== "headlights-archive"
  ) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (modeRaw !== undefined && modeRaw !== "clone" && modeRaw !== "blank") {
    return NextResponse.json({ error: "invalid mode" }, { status: 400 });
  }
  const kind = kindRaw as ScenarioKind | undefined;
  const mode = modeRaw as "clone" | "blank" | undefined;
  const scenario = await createScenario(trimmed, sess.user.email, kind, mode);
  return NextResponse.json({ scenario });
}
