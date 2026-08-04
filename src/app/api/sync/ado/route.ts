import { NextResponse } from "next/server";
import { getSession } from "@/lib/require-session";
import { getAllItems, upsertItem } from "@/lib/loop/store";
import { adoConfigured, fetchWorkItems, parseWorkItemId } from "@/lib/ado/client";
import { computeAdoSync } from "@/lib/ado/sync";

export const dynamic = "force-dynamic";

// POST /api/sync/ado — one-way pull of delivery status from Azure DevOps.
//
// For every Loop item that carries an adoUrl, fetch the work item's state and
// iteration and refresh adoStatus. Loop never writes back to ADO here. Returns a
// diff summary so the UI can report exactly what moved (and what disagreed).
export async function POST() {
  const sess = await getSession();
  if (!sess) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!adoConfigured()) {
    return NextResponse.json(
      {
        error:
          "ADO sync is not configured. Set ADO_PAT (scope: Work Items → Read) in the environment.",
      },
      { status: 501 },
    );
  }

  const items = await getAllItems();
  // Collect work-item ids from both the item's own link and every sub-item's
  // link, so one batch fetch covers the whole breakdown.
  const ids = items
    .flatMap((i) => [
      (i.adoUrl || "").trim(),
      ...(i.subItems || []).map((s) => (s.adoUrl || "").trim()),
    ])
    .map((url) => parseWorkItemId(url))
    .filter((n): n is number => n !== null);

  let fetched;
  try {
    fetched = await fetchWorkItems(ids);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ADO request failed" },
      { status: 502 },
    );
  }

  const { updatedItems, summary } = computeAdoSync(
    items,
    fetched,
    new Date().toISOString(),
  );

  // Persist only the items that actually changed.
  for (const item of updatedItems) {
    await upsertItem(item);
  }

  return NextResponse.json({ ok: true, summary });
}
