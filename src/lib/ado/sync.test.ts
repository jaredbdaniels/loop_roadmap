import { describe, expect, it } from "vitest";
import type { AdoWorkItem } from "./client";
import { computeAdoSync } from "./sync";
import type { Item, SubItem } from "@/lib/loop/types";

// Minimal builders so tests speak only to the fields the sync reads.
function sub(over: Partial<SubItem> = {}): SubItem {
  return {
    id: "s1",
    title: "Sub",
    targetStart: null,
    targetEnd: null,
    done: false,
    adoUrl: "",
    adoStatus: "",
    ...over,
  };
}

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1",
    title: "Item",
    description: "",
    mission: "Alpha",
    owner: "",
    moduleId: null,
    type: null,
    stage: "Deliver",
    order: null,
    horizon: null,
    targetStart: null,
    targetEnd: null,
    dependsOn: [],
    betIds: [],
    fundedBetId: null,
    subItems: [],
    submitter: { type: "human", name: "" },
    problemStatement: "",
    kr: { statement: "", metric: "", unit: "", baseline: null, target: null, current: null },
    votes: 0,
    reach: 0,
    confidence: 0,
    strategicFit: 0,
    notionUrl: "",
    notionTitle: "",
    adoUrl: "",
    adoStatus: "",
    ahaUrl: "",
    ahaReference: "",
    ahaEndorsements: 0,
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
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    activity: [],
    ...over,
  };
}

const url = (id: number) =>
  `https://dev.azure.com/CampMinderLLC/CampMinder/_workitems/edit/${id}`;

function wi(id: number, state: string, iteration = ""): AdoWorkItem {
  return { id, state, iteration, type: "Task", title: `WI ${id}` };
}

const NOW = "2026-07-14T00:00:00Z";

describe("computeAdoSync — sub-item links", () => {
  it("syncs a sub-item's status from its linked work item", () => {
    const items = [
      item({ subItems: [sub({ id: "sa", adoUrl: url(10) })] }),
    ];
    const fetched = new Map([[10, wi(10, "Active", "FY26.Q3")]]);

    const { updatedItems, summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.checked).toBe(1);
    expect(summary.updated).toHaveLength(1);
    expect(summary.updated[0].to).toBe("Active — FY26.Q3");
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0].subItems[0].adoStatus).toBe("Active — FY26.Q3");
    // Not closed, so it stays open.
    expect(updatedItems[0].subItems[0].done).toBe(false);
  });

  it("completes a sub-item when its work item is closed", () => {
    const items = [
      item({ subItems: [sub({ id: "sa", adoUrl: url(11), adoStatus: "Active" })] }),
    ];
    const fetched = new Map([[11, wi(11, "Closed")]]);

    const { updatedItems, summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.completed).toHaveLength(1);
    expect(updatedItems[0].subItems[0].done).toBe(true);
    expect(updatedItems[0].subItems[0].adoStatus).toBe("Closed");
    expect(
      updatedItems[0].activity.some((a) => a.includes("completed")),
    ).toBe(true);
  });

  it("never unchecks a manually-completed sub-item", () => {
    const items = [
      item({
        subItems: [sub({ id: "sa", adoUrl: url(12), adoStatus: "Active", done: true })],
      }),
    ];
    // Work item is back to Active, but the box was checked by a human. Nothing
    // changes — the done flag is left alone and the item is not rewritten.
    const fetched = new Map([[12, wi(12, "Active")]]);

    const { updatedItems, summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.unchanged).toBe(1);
    expect(updatedItems).toHaveLength(0);
  });

  it("counts an already-synced, still-open sub-item as unchanged", () => {
    const items = [
      item({ subItems: [sub({ id: "sa", adoUrl: url(13), adoStatus: "Active" })] }),
    ];
    const fetched = new Map([[13, wi(13, "Active")]]);

    const { updatedItems, summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.unchanged).toBe(1);
    expect(summary.updated).toHaveLength(0);
    expect(updatedItems).toHaveLength(0);
  });

  it("flags malformed and not-found sub-item links with a parent-qualified label", () => {
    const items = [
      item({
        title: "Registration",
        subItems: [
          sub({ id: "bad", title: "Forms", adoUrl: "https://dev.azure.com/no-id-here" }),
          sub({ id: "missing", title: "Payment", adoUrl: url(999) }),
        ],
      }),
    ];
    const fetched = new Map<number, AdoWorkItem>(); // 999 not returned

    const { summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.checked).toBe(2);
    expect(summary.malformed[0].title).toBe("Registration ▸ Forms");
    expect(summary.notFound[0].title).toBe("Registration ▸ Payment");
  });

  it("writes the item once when both its own link and a sub-item change", () => {
    const items = [
      item({
        adoUrl: url(20),
        adoStatus: "New",
        subItems: [sub({ id: "sa", adoUrl: url(21) })],
      }),
    ];
    const fetched = new Map([
      [20, wi(20, "Active", "FY26.Q3")],
      [21, wi(21, "Closed")],
    ]);

    const { updatedItems, summary } = computeAdoSync(items, fetched, NOW);

    expect(summary.checked).toBe(2);
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0].adoStatus).toBe("Active — FY26.Q3");
    expect(updatedItems[0].subItems[0].done).toBe(true);
  });
});
