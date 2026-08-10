import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/loop/types";

// Mock the true boundaries only — the DB store and the AI provider. The Aha!
// client (secret check, payload parse) and the mapping logic run for real, so
// this exercises the route's actual behavior end to end.
vi.mock("@/lib/loop/store", () => ({
  getAllItems: vi.fn(),
  upsertItem: vi.fn(),
}));
vi.mock("@/lib/ai/model", () => ({ aiEnabled: vi.fn() }));
vi.mock("@/lib/ai/suggest", () => ({ suggest: vi.fn() }));

import { getAllItems, upsertItem } from "@/lib/loop/store";
import { aiEnabled } from "@/lib/ai/model";
import { POST } from "./route";

const SECRET = "s3cret-value";

const req = (body: unknown, opts: { secret?: string | false } = {}) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  if (secret) headers["x-aha-secret"] = secret;
  return new Request("http://test/api/webhooks/aha", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
};

const ideaBody = {
  name: "Bulk export of camper records",
  description: "<p>Parents keep asking for a one-click export.</p>",
  reference_num: "PROD-I-123",
  url: "https://campminder.aha.io/ideas/ideas/PROD-I-123",
  categories: ["CX"],
  endorsements_count: 4,
};

beforeEach(() => {
  vi.mocked(getAllItems).mockReset().mockResolvedValue([]);
  vi.mocked(upsertItem).mockReset().mockResolvedValue(undefined);
  vi.mocked(aiEnabled).mockReset().mockReturnValue(false);
  process.env.AHA_WEBHOOK_SECRET = SECRET;
  delete process.env.AHA_CX_CATEGORY;
});

describe("POST /api/webhooks/aha", () => {
  it("501 when the webhook secret isn't configured", async () => {
    delete process.env.AHA_WEBHOOK_SECRET;
    const res = await POST(req(ideaBody));
    expect(res.status).toBe(501);
    expect(upsertItem).not.toHaveBeenCalled();
  });

  it("401 when the shared secret is missing or wrong", async () => {
    expect((await POST(req(ideaBody, { secret: false }))).status).toBe(401);
    expect((await POST(req(ideaBody, { secret: "wrong" }))).status).toBe(401);
    expect(upsertItem).not.toHaveBeenCalled();
  });

  it("400 on non-JSON body", async () => {
    const res = await POST(req("{not json", {}));
    expect(res.status).toBe(400);
  });

  it("400 when the payload has no idea", async () => {
    const res = await POST(req({ description: "orphan" }));
    expect(res.status).toBe(400);
  });

  it("creates a draft Intake item from a valid idea", async () => {
    const res = await POST(req(ideaBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "created" });
    expect(upsertItem).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(upsertItem).mock.calls[0][0] as Item;
    expect(saved.stage).toBe("Intake");
    expect(saved.submitter).toEqual({ type: "agent", name: "Aha Ideas" });
    expect(saved.ahaReference).toBe("PROD-I-123");
    expect(saved.votes).toBe(4);
  });

  it("updates the existing card on a re-fire instead of duplicating", async () => {
    const existing = {
      id: "existing-1",
      votes: 4,
      ahaEndorsements: 4, // last-synced Aha! count
      ahaUrl: "https://campminder.aha.io/ideas/ideas/PROD-I-123",
      ahaReference: "PROD-I-123",
      activity: [],
    } as unknown as Item;
    vi.mocked(getAllItems).mockResolvedValue([existing]);

    // Same endorsements → nothing Aha!-owned changed → no write.
    const unchanged = await POST(req(ideaBody));
    expect(await unchanged.json()).toMatchObject({ action: "unchanged" });
    expect(upsertItem).not.toHaveBeenCalled();

    // Bumped endorsements → update in place (still one card).
    const res = await POST(req({ ...ideaBody, endorsements_count: 20 }));
    expect(await res.json()).toMatchObject({ action: "updated", id: "existing-1" });
    expect(upsertItem).toHaveBeenCalledTimes(1);
    expect((vi.mocked(upsertItem).mock.calls[0][0] as Item).votes).toBe(20);
  });

  it("skips a non-CX idea as a 200 no-op when a category backstop is set", async () => {
    process.env.AHA_CX_CATEGORY = "CX";
    const res = await POST(req({ ...ideaBody, categories: ["Billing"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: "not-cx" });
    expect(upsertItem).not.toHaveBeenCalled();
  });
});
