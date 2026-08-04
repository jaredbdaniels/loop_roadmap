import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { aiEnabled } from "@/lib/ai/model";

export const dynamic = "force-dynamic";

// GET /api/ai/status — lets the client decide whether to render AI affordances
// without shipping any provider detail to the browser. Session-gated like the
// rest of the app; never reveals which provider or model is in use.
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ enabled: aiEnabled() });
}
