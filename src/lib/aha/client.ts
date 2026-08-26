import "server-only";
import { bearerToken } from "../bearer-token";
import { safeEqual } from "../safe-equal";

// Thin, dependency-free helpers for the Aha! Ideas → Loop Capture webhook.
//
// Unlike the ADO integration (which Loop *pulls* over REST with a PAT), Aha!
// *pushes* to us: an Aha! automation/webhook fires when a CX idea is created and
// POSTs the idea to /api/webhooks/aha. So there's no REST client here — just the
// config gate, the shared-secret check that stands in for a session on a webhook
// route, and a defensive parser that normalizes Aha!'s payload into an AhaIdea.
//
// Loop references Aha!, it never mirrors it: we keep the idea's name, a plain-text
// body, its reference number, and a backlink — nothing more (same principle as
// adoUrl/notionUrl).

// The webhook is considered configured once a shared secret is set. Without it
// the route 501s and the rest of the app is unaffected (mirrors adoConfigured()).
export function ahaConfigured(): boolean {
  return Boolean(process.env.AHA_WEBHOOK_SECRET);
}

// A webhook can't carry a Better Auth session, so the shared secret is the auth
// boundary. Aha! automations can attach the secret a few ways depending on how
// the rule is configured; accept the common ones so setup is flexible:
//   - a custom header  `x-aha-secret: <secret>`
//   - an Authorization bearer token
//   - a `?secret=` query param on the webhook URL
export function verifyAhaSecret(req: Request): boolean {
  const expected = process.env.AHA_WEBHOOK_SECRET;
  if (!expected) return false;

  const header = req.headers.get("x-aha-secret");
  if (header && safeEqual(header, expected)) return true;

  const bearer = bearerToken(req);
  if (bearer && safeEqual(bearer, expected)) return true;

  try {
    const qs = new URL(req.url).searchParams.get("secret");
    if (qs && safeEqual(qs, expected)) return true;
  } catch {
    // Non-absolute URL (shouldn't happen for a real request) — ignore.
  }

  return false;
}

// The normalized idea shape the rest of the integration works with. Everything
// downstream (mapping, filter, tests) depends on this, not on Aha!'s raw JSON.
export interface AhaIdea {
  name: string;
  description: string; // plain text; HTML stripped
  referenceNum: string; // e.g. "PROD-I-123"
  url: string; // backlink to the idea in Aha!
  categories: string[]; // category/tag names, used by the CX filter
  // The Aha! endorsement/vote count, or null when this fire didn't carry one.
  // null is deliberately distinct from 0: an update event that omits the count
  // must not be read as "0 endorsements" and reset the Loop card (see
  // refreshCaptureItem).
  endorsements: number | null;
}

// Strips HTML to readable plain text: drop tags, decode the handful of entities
// Aha! descriptions actually contain, and collapse whitespace. Deliberately
// minimal — we're storing a reference blurb, not rendering rich text.
export function stripHtml(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Pulls category/tag names out of the shapes Aha! uses: an array of strings, or
// an array of objects with a `name`.
function readCategories(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => (typeof c === "string" ? c : str(asRecord(c)?.name)))
    .map((s) => s.trim())
    .filter(Boolean);
}

// Reads the endorsement count, returning null when the payload carries no count
// at all. We only coerce a value that's actually present: a missing field must
// stay null so a re-fire that omits it leaves the Loop card's count untouched
// rather than zeroing it.
function readEndorsements(idea: Record<string, unknown>): number | null {
  const n =
    idea.endorsements_count ??
    idea.endorsements ??
    idea.votes ??
    idea.score;
  if (n === undefined || n === null) return null;
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

// Locates the idea object inside an Aha! webhook body. Aha! payloads vary by how
// the automation/webhook is configured (top-level idea, `{ idea }`, `{ entity }`,
// or an audit envelope), so we look in the likely places rather than assuming
// one. Returns null when nothing idea-shaped is present.
//
// NOTE: confirm the exact payload against the live Aha! account and tighten this
// if needed — it's written to be forgiving precisely because the shape is not yet
// verified in this repo.
export function parseAhaIdea(payload: unknown): AhaIdea | null {
  const root = asRecord(payload);
  if (!root) return null;

  const candidate =
    asRecord(root.idea) ??
    asRecord(root.entity) ??
    asRecord(asRecord(root.audit)?.auditable) ??
    // Fall back to treating the body itself as the idea.
    root;

  const name = str(candidate.name).trim();
  const url = str(candidate.url).trim();
  const referenceNum = str(
    candidate.reference_num ?? candidate.referenceNum,
  ).trim();

  // Require at least a name or a reference — otherwise this isn't an idea we can
  // meaningfully capture.
  if (!name && !referenceNum) return null;

  return {
    name,
    description: stripHtml(candidate.description),
    referenceNum,
    url,
    categories: readCategories(candidate.categories ?? candidate.tags),
    endorsements: readEndorsements(candidate),
  };
}
