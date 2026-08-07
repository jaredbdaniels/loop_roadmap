import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/loop/types";
import { parseAhaIdea, stripHtml, type AhaIdea } from "./client";
import {
  buildCaptureItem,
  findExistingCapture,
  isCxIdea,
  refreshCaptureItem,
} from "./map";

const NOW = "2026-07-23T00:00:00.000Z";

function idea(over: Partial<AhaIdea> = {}): AhaIdea {
  return {
    name: "Bulk export of camper records",
    description: "Parents keep asking for a one-click export.",
    referenceNum: "PROD-I-123",
    url: "https://campminder.aha.io/ideas/ideas/PROD-I-123",
    categories: [],
    endorsements: 0,
    ...over,
  };
}

// A minimal Item stand-in for dedup/refresh tests — only the fields these pure
// functions read/spread matter, so we cast rather than build the full shape.
function captured(over: Partial<Item>): Item {
  return {
    id: "i1",
    votes: 0,
    ahaUrl: "",
    ahaReference: "",
    ahaEndorsements: 0,
    activity: [],
    ...over,
  } as Item;
}

describe("stripHtml", () => {
  it("removes tags and decodes entities", () => {
    expect(stripHtml("<p>Hello&nbsp;&amp; <b>world</b></p>")).toBe(
      "Hello & world",
    );
  });
  it("turns block/br tags into newlines", () => {
    expect(stripHtml("a<br>b<br/>c")).toBe("a\nb\nc");
  });
  it("returns '' for non-strings", () => {
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(42)).toBe("");
  });
});

describe("parseAhaIdea", () => {
  it("reads a top-level idea body", () => {
    const out = parseAhaIdea({
      name: "X",
      description: "<p>why</p>",
      reference_num: "PROD-I-9",
      url: "https://a.aha.io/i/9",
      categories: ["CX", { name: "Billing" }],
      endorsements_count: 12,
    });
    expect(out).toEqual({
      name: "X",
      description: "why",
      referenceNum: "PROD-I-9",
      url: "https://a.aha.io/i/9",
      categories: ["CX", "Billing"],
      endorsements: 12,
    });
  });
  it("finds the idea nested under { idea }", () => {
    expect(parseAhaIdea({ idea: { name: "Nested" } })?.name).toBe("Nested");
  });
  it("finds the idea in an audit envelope", () => {
    expect(
      parseAhaIdea({ audit: { auditable: { reference_num: "PROD-I-1" } } })
        ?.referenceNum,
    ).toBe("PROD-I-1");
  });
  it("returns null when there's no name or reference", () => {
    expect(parseAhaIdea({ description: "orphan" })).toBeNull();
    expect(parseAhaIdea("nope")).toBeNull();
  });
  it("reports null endorsements when the payload omits the count", () => {
    // Distinct from 0: a fire without a count must not zero the Loop card.
    expect(parseAhaIdea({ name: "X" })?.endorsements).toBeNull();
    expect(parseAhaIdea({ name: "X", endorsements_count: 0 })?.endorsements).toBe(
      0,
    );
  });
});

describe("isCxIdea", () => {
  it("accepts everything when no allow-list is set", () => {
    expect(isCxIdea(idea({ categories: ["Random"] }), "")).toBe(true);
    expect(isCxIdea(idea({ categories: [] }), undefined)).toBe(true);
  });
  it("filters by category (case-insensitive) when an allow-list is set", () => {
    expect(isCxIdea(idea({ categories: ["cx"] }), "CX,Customer Experience")).toBe(
      true,
    );
    expect(isCxIdea(idea({ categories: ["Billing"] }), "CX")).toBe(false);
  });
});

describe("buildCaptureItem", () => {
  it("drafts a Discovery item stamped as the Aha! agent, with a backlink", () => {
    const item = buildCaptureItem(idea({ endorsements: 7 }), { nowISO: NOW });
    expect(item.stage).toBe("Discovery");
    expect(item.submitter).toEqual({ type: "agent", name: "Aha Ideas" });
    expect(item.mission).toBe("Cross-cutting");
    expect(item.ahaUrl).toBe("https://campminder.aha.io/ideas/ideas/PROD-I-123");
    expect(item.ahaReference).toBe("PROD-I-123");
    expect(item.votes).toBe(7); // endorsements carry over
    expect(item.ahaEndorsements).toBe(7); // recorded for delta-based re-fires
    expect(item.problemStatement).toBe(""); // no enrichment → raw capture
    expect(item.description).toContain("PROD-I-123");
    expect(item.description).toContain("aha.io");
    expect(item.activity[0]).toContain("Captured from Aha! idea PROD-I-123");
    expect(item.createdAt).toBe(NOW);
  });

  it("uses a deterministic id keyed on the Aha! reference (dedup under races)", () => {
    // Two independent fires for the same idea must produce the same id, so a
    // concurrent create+update collapses onto one row instead of duplicating.
    const a = buildCaptureItem(idea(), { nowISO: NOW });
    const b = buildCaptureItem(idea(), { nowISO: NOW });
    expect(a.id).toBe("aha_PROD-I-123");
    expect(a.id).toBe(b.id);
  });

  it("seeds ahaEndorsements at 0 when the idea carries no count", () => {
    const item = buildCaptureItem(idea({ endorsements: null }), { nowISO: NOW });
    expect(item.votes).toBe(0);
    expect(item.ahaEndorsements).toBe(0);
  });

  it("applies AI enrichment when provided", () => {
    const item = buildCaptureItem(idea(), {
      nowISO: NOW,
      enrichment: {
        title: "One-click record export",
        description: "Give admins a single export button.",
        problemStatement:
          "Admins spend hours assembling exports by hand each season.",
        mission: "Delta",
        kr: null,
      },
    });
    expect(item.title).toBe("One-click record export");
    expect(item.mission).toBe("Delta");
    expect(item.problemStatement).toContain("Admins spend hours");
    // The Aha! backlink is preserved alongside the enriched description.
    expect(item.description).toContain("aha.io");
  });

  it("falls back to the reference number when the idea has no name", () => {
    const item = buildCaptureItem(idea({ name: "" }), { nowISO: NOW });
    expect(item.title).toBe("PROD-I-123");
  });
});

describe("findExistingCapture", () => {
  const items = [
    captured({ id: "a", ahaUrl: "https://x.aha.io/i/1", ahaReference: "P-1" }),
    captured({ id: "b", ahaReference: "P-2" }),
  ];
  it("matches by backlink first", () => {
    expect(findExistingCapture(items, idea({ url: "https://x.aha.io/i/1" }))?.id).toBe(
      "a",
    );
  });
  it("falls back to the reference number", () => {
    expect(
      findExistingCapture(items, idea({ url: "", referenceNum: "P-2" }))?.id,
    ).toBe("b");
  });
  it("returns null when nothing matches", () => {
    expect(
      findExistingCapture(items, idea({ url: "https://x.aha.io/i/99", referenceNum: "P-99" })),
    ).toBeNull();
  });
});

describe("refreshCaptureItem", () => {
  it("applies the endorsement delta and preserves human upvotes", () => {
    // votes 5 = 3 Aha! endorsements (last synced) + 2 human upvotes.
    const existing = captured({
      id: "a",
      votes: 5,
      ahaEndorsements: 3,
      ahaUrl: "https://x.aha.io/i/1",
      ahaReference: "P-1",
      title: "Human-renamed title",
      stage: "Solutioning",
    } as Partial<Item>);
    const updated = refreshCaptureItem(
      existing,
      idea({ url: "https://x.aha.io/i/1", referenceNum: "P-1", endorsements: 9 }),
      NOW,
    );
    expect(updated).not.toBeNull();
    // +6 endorsements applied on top of the existing 5 (the 2 human votes kept).
    expect(updated!.votes).toBe(11);
    expect(updated!.ahaEndorsements).toBe(9);
    // Human edits are never clobbered.
    expect(updated!.title).toBe("Human-renamed title");
    expect(updated!.stage).toBe("Solutioning");
    expect(updated!.activity.at(-1)).toContain("endorsements synced: 3 → 9");
  });

  it("returns null when nothing Aha!-owned changed (idempotent re-fire)", () => {
    const existing = captured({
      votes: 5,
      ahaEndorsements: 5,
      ahaUrl: "https://x.aha.io/i/1",
      ahaReference: "P-1",
    });
    const same = refreshCaptureItem(
      existing,
      idea({ url: "https://x.aha.io/i/1", referenceNum: "P-1", endorsements: 5 }),
      NOW,
    );
    expect(same).toBeNull();
  });

  it("leaves votes untouched when the re-fire omits the endorsement count", () => {
    const existing = captured({
      votes: 5,
      ahaEndorsements: 3,
      ahaUrl: "https://x.aha.io/i/1",
      ahaReference: "P-1",
    });
    const same = refreshCaptureItem(
      existing,
      idea({ url: "https://x.aha.io/i/1", referenceNum: "P-1", endorsements: null }),
      NOW,
    );
    // No count in this fire → nothing Aha!-owned changed → no write, no zeroing.
    expect(same).toBeNull();
  });
});
