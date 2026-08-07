import { NextResponse } from "next/server";
import { getAllItems, upsertItem } from "@/lib/loop/store";
import { ahaConfigured, parseAhaIdea, verifyAhaSecret, type AhaIdea } from "@/lib/aha/client";
import {
  buildCaptureItem,
  findExistingCapture,
  isCxIdea,
  refreshCaptureItem,
} from "@/lib/aha/map";
import { aiEnabled } from "@/lib/ai/model";
import { suggest } from "@/lib/ai/suggest";
import {
  buildCapturePrompt,
  captureOut,
  captureSystem,
  type CaptureOutput,
} from "@/lib/ai/features/capture";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/webhooks/aha — ingest a CX idea from the Aha! Ideas portal as a draft
// Capture item. Aha! pushes here via an automation/webhook; the human review
// happens afterward in the Capture inbox.
//
// Gates mirror the ADO sync's graceful-degrade contract:
//   501 not configured — AHA_WEBHOOK_SECRET unset (rest of app unaffected)
//   401 unauthorized   — shared secret missing/wrong (a webhook has no session)
//   400 bad payload    — body isn't JSON or has no idea in it
// A non-CX idea (per the optional AHA_CX_CATEGORY backstop) is a 200 no-op so
// Aha! doesn't treat it as a delivery failure and retry.
export async function POST(req: Request) {
  if (!ahaConfigured()) {
    return NextResponse.json(
      {
        error:
          "Aha! webhook is not configured. Set AHA_WEBHOOK_SECRET in the environment.",
      },
      { status: 501 },
    );
  }

  if (!verifyAhaSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const idea = parseAhaIdea(payload);
  if (!idea) {
    return NextResponse.json(
      { error: "no Aha! idea found in payload" },
      { status: 400 },
    );
  }

  const nowISO = new Date().toISOString();
  const items = await getAllItems();

  // Dedup: a re-fired webhook (Aha! sends create *and* update events) refreshes
  // the existing card's Aha!-owned fields rather than creating a duplicate.
  const existing = findExistingCapture(items, idea);

  // The CX backstop only gates *new* captures. An idea we've already captured
  // still gets its Aha!-owned fields refreshed even if this particular fire
  // omitted categories (Aha! update events don't always carry them) — otherwise
  // endorsement bumps on a captured card would be silently dropped.
  if (!existing && !isCxIdea(idea)) {
    return NextResponse.json({ ok: true, skipped: "not-cx" });
  }

  if (existing) {
    const updated = refreshCaptureItem(existing, idea, nowISO);
    if (updated) await upsertItem(updated);
    return NextResponse.json({
      ok: true,
      action: updated ? "updated" : "unchanged",
      id: existing.id,
    });
  }

  // New idea → draft a Capture item. When the AI copilot is enabled, reuse it to
  // draft a problem statement / mission / KR from the idea body; enrichment is
  // best-effort, so a provider hiccup still captures the raw idea for a human.
  const enrichment = await maybeEnrich(idea);
  const item = buildCaptureItem(idea, { nowISO, enrichment });
  await upsertItem(item);

  return NextResponse.json({ ok: true, action: "created", id: item.id });
}

async function maybeEnrich(idea: AhaIdea): Promise<CaptureOutput | null> {
  if (!aiEnabled()) return null;
  const text = [idea.name, idea.description].filter(Boolean).join("\n\n").trim();
  if (!text) return null;
  try {
    return await suggest({
      system: captureSystem,
      prompt: buildCapturePrompt({ text }),
      schema: captureOut,
    });
  } catch (err) {
    console.error("[aha] capture enrichment failed; capturing raw idea", err);
    return null;
  }
}
