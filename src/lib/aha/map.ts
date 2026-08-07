import { genId, normalizeKr } from "@/lib/loop/logic";
import type { Item } from "@/lib/loop/types";
import type { CaptureOutput } from "@/lib/ai/features/capture";
import type { AhaIdea } from "./client";

// Pure, testable core of the Aha! → Loop capture sync. No I/O here: the route
// verifies the secret, optionally enriches with the AI copilot, and persists;
// this module only decides what a captured item looks like.
//
// A captured idea lands in the Capture inbox as an agent-drafted item — the
// human-verification step stays, exactly as it does for Slack/Granola intake.
// It is deliberately not dropped straight into Discovery: arriving in the tool
// is not the same as anyone deciding to spend time on it.

// The team a fresh capture is parked under until a human retags it in review.
// "Cross-cutting" is a real mission and reads honestly as "not yet assigned".
const DEFAULT_MISSION = "Cross-cutting";

// The agent identity stamped on the submitter, matching the Slack-intake
// convention ("an agent drafts, the human verifies").
export const AHA_SUBMITTER = { type: "agent" as const, name: "Aha Ideas" };

// Whether an idea should be ingested. The CX scope is best enforced Aha!-side by
// pointing the automation at the CX portal; AHA_CX_CATEGORY is an optional
// server-side backstop — a comma-separated allow-list of category/tag names.
// Unset (the default) means "trust the source" and accept everything.
export function isCxIdea(
  idea: AhaIdea,
  allowRaw: string | undefined = process.env.AHA_CX_CATEGORY,
): boolean {
  const allow = (allowRaw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const cats = idea.categories.map((c) => c.toLowerCase());
  return cats.some((c) => allow.includes(c));
}

// The description shown on the Loop card: the idea's own blurb plus a backlink
// line so the card always points home to Aha! (Loop references, never mirrors).
function captureDescription(idea: AhaIdea): string {
  const ref = idea.referenceNum ? ` (${idea.referenceNum})` : "";
  const link = idea.url ? `\n\nFrom Aha! idea${ref}: ${idea.url}` : ref ? `\n\nAha! idea ${idea.referenceNum}` : "";
  return `${idea.description}${link}`.trim();
}

// Find an already-captured item for this idea, so a re-fired webhook updates in
// place instead of creating a duplicate. Match on the backlink first (the strong
// key), then the reference number (covers ideas whose url wasn't in the payload).
export function findExistingCapture(items: Item[], idea: AhaIdea): Item | null {
  return (
    items.find((i) => idea.url && i.ahaUrl === idea.url) ??
    items.find((i) => idea.referenceNum && i.ahaReference === idea.referenceNum) ??
    null
  );
}

// A stable id derived from the idea's Aha! identity (reference first, then the
// backlink). Using a deterministic id means two near-simultaneous fires for the
// same idea — Aha! sends a create *and* an update — collapse onto one row via
// upsertItem's onConflict, instead of racing past the read-then-write dedup and
// creating a duplicate card. Falls back to a random id only when the idea
// carries neither key.
export function ahaItemId(idea: AhaIdea): string {
  const key = idea.referenceNum || idea.url;
  if (!key) return genId();
  return "aha_" + key.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Build a fresh Capture draft from an Aha! idea. Mirrors the exact default shape
// the CaptureModal creates, so an Aha!-captured item is indistinguishable from a
// hand-captured one except for its origin fields. `enrichment` (when the AI
// copilot is on) supplies a drafted problem statement / mission / KR; without it
// the raw idea is captured for a human to frame.
export function buildCaptureItem(
  idea: AhaIdea,
  opts: { nowISO: string; enrichment?: CaptureOutput | null },
): Item {
  const { nowISO, enrichment } = opts;
  return {
    id: ahaItemId(idea),
    title: (enrichment?.title || idea.name || idea.referenceNum).trim(),
    description: enrichment?.description
      ? `${enrichment.description}\n\n${captureDescription(idea)}`.trim()
      : captureDescription(idea),
    mission: enrichment?.mission || DEFAULT_MISSION,
    // No owner assigned at capture — a human picks one during review.
    owner: "",
    moduleId: null,
    type: null,
    stage: "Capture",
    order: null,
    horizon: null,
    targetStart: null,
    targetEnd: null,
    dependsOn: [],
    betIds: [],
    fundedBetId: null,
    subItems: [],
    submitter: { ...AHA_SUBMITTER },
    problemStatement: enrichment?.problemStatement || "",
    kr: normalizeKr(enrichment?.kr ?? undefined),
    // Seed votes from the Aha! endorsement count; ahaEndorsements records that
    // seed so later re-fires apply only the delta and never clobber a human's
    // upvotes (see refreshCaptureItem).
    votes: idea.endorsements ?? 0,
    reach: 0,
    confidence: 0,
    strategicFit: 0,
    notionUrl: "",
    notionTitle: "",
    adoUrl: "",
    adoStatus: "",
    ahaUrl: idea.url,
    ahaReference: idea.referenceNum,
    ahaEndorsements: idea.endorsements ?? 0,
    prototypeUrl: "",
    prototypes: [],
    outcomeReading: "",
    whatWeLearned: "",
    whatWeDoDifferently: "",
    nextBet: "",
    killed: false,
    killedAt: null,
    killedReason: "",
    committedAt: null,
    shippedAt: null,
    createdAt: nowISO,
    updatedAt: nowISO,
    activity: [
      `Captured from Aha! idea${idea.referenceNum ? ` ${idea.referenceNum}` : ""}.`,
    ],
  };
}

// Apply an Aha! re-fire to an item we've already captured. Aha! owns the idea,
// so we only ever refresh Aha!-owned facts — the endorsement count and the
// backlink/reference — and never touch what a human may have edited in Loop
// (title, stage, mission, KR, description).
//
// `votes` is the one subtle case. Nothing in Loop surfaces or edits it any more
// — voting was removed — but Aha! still owns the endorsement count behind it, so
// the field keeps syncing rather than being dropped: deleting it would make
// Aha!'s number unrecoverable. The delta bookkeeping stays for the same reason it
// was written: rather than overwrite with Aha!'s raw count, we track the
// last-synced value in `ahaEndorsements` and apply only the *difference*, so
// whatever is already stored survives a re-fire. A fire that omits the count
// (idea.endorsements === null) leaves both untouched.
//
// Returns the updated item when something Aha!-owned actually changed, or null
// when there's nothing to do, so the route only writes on real changes.
export function refreshCaptureItem(
  existing: Item,
  idea: AhaIdea,
  nowISO: string,
): Item | null {
  const prevEndorsements = existing.ahaEndorsements ?? 0;
  const endorsementsChanged =
    idea.endorsements !== null && idea.endorsements !== prevEndorsements;

  const nextRef = idea.referenceNum || existing.ahaReference;
  const nextUrl = idea.url || existing.ahaUrl;
  const refChanged = nextRef !== existing.ahaReference;
  const urlChanged = nextUrl !== existing.ahaUrl;

  if (!endorsementsChanged && !refChanged && !urlChanged) return null;

  const notes: string[] = [];
  let nextVotes = existing.votes;
  let nextEndorsements = prevEndorsements;
  if (endorsementsChanged) {
    // idea.endorsements is non-null here (guarded by endorsementsChanged).
    const delta = (idea.endorsements as number) - prevEndorsements;
    nextVotes = Math.max(0, existing.votes + delta);
    nextEndorsements = idea.endorsements as number;
    notes.push(
      `Aha! endorsements synced: ${prevEndorsements} → ${nextEndorsements}.`,
    );
  }
  if (urlChanged || refChanged) notes.push("Aha! reference updated.");

  return {
    ...existing,
    votes: nextVotes,
    ahaEndorsements: nextEndorsements,
    ahaReference: nextRef,
    ahaUrl: nextUrl,
    updatedAt: nowISO,
    activity: [...(existing.activity || []), ...notes],
  };
}
