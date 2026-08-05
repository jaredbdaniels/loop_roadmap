import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the boundaries the shared handler depends on so no real model or auth is
// touched: session, the enabled-gate, and the suggestion helpers.
vi.mock("@/lib/require-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/ai/model", () => ({ aiEnabled: vi.fn() }));
vi.mock("@/lib/ai/suggest", () => ({ suggest: vi.fn(), suggestText: vi.fn() }));

import { getSession } from "@/lib/require-session";
import { aiEnabled } from "@/lib/ai/model";
import { suggest, suggestText } from "@/lib/ai/suggest";
import { POST as ricePost } from "@/app/api/ai/rice/route";
import { POST as explainPost } from "@/app/api/ai/explain-rank/route";

const req = (body: unknown) =>
  new Request("http://test/api/ai/rice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const goodRiceBody = {
  title: "Faster onboarding",
  problemStatement: "Onboarding is slow",
  mission: "Alpha",
  description: "",
};

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(aiEnabled).mockReset();
  vi.mocked(suggest).mockReset();
  vi.mocked(suggestText).mockReset();
});

describe("aiObjectRoute (rice)", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(aiEnabled).mockReturnValue(true);
    const res = await ricePost(req(goodRiceBody));
    expect(res.status).toBe(401);
  });

  it("503 when AI is disabled", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(aiEnabled).mockReturnValue(false);
    const res = await ricePost(req(goodRiceBody));
    expect(res.status).toBe(503);
  });

  it("400 on invalid body", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(aiEnabled).mockReturnValue(true);
    const res = await ricePost(req({ problemStatement: "no title" }));
    expect(res.status).toBe(400);
  });

  it("200 with the suggested object on success", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(aiEnabled).mockReturnValue(true);
    const out = {
      reach: 4,
      confidence: 3,
      strategicFit: 5,
      rationale: { reach: "r", confidence: "c", strategicFit: "s" },
    };
    vi.mocked(suggest).mockResolvedValue(out);
    const res = await ricePost(req(goodRiceBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(out);
  });

  it("502 when the model call throws", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(aiEnabled).mockReturnValue(true);
    vi.mocked(suggest).mockRejectedValue(new Error("provider down"));
    const res = await ricePost(req(goodRiceBody));
    expect(res.status).toBe(502);
  });
});

describe("aiTextRoute (explain-rank)", () => {
  const body = {
    title: "Item A",
    scores: { votes: 1, reach: 3, confidence: 4, strategicFit: 5 },
    weights: { votes: 1, reach: 2, confidence: 1, strategicFit: 3 },
    rank: 30,
  };

  it("200 returns { text }", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u" } } as never);
    vi.mocked(aiEnabled).mockReturnValue(true);
    vi.mocked(suggestText).mockResolvedValue("Reach dominates this ranking.");
    const res = await explainPost(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Reach dominates this ranking." });
  });
});
