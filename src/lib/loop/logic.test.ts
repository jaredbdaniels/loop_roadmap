import { describe, expect, it } from "vitest";
import {
  betFundedShare,
  betJtbdScope,
  betReach,
  betUndeclaredSpend,
  betUnstaffedClaims,
  diffCount,
  diffStates,
  fiscalMonthOffset,
  fiscalQuarter,
  fiscalQuarterIndex,
  fiscalQuarterLabel,
  fiscalSeason,
  fiscalSeasonLabel,
  isFiscalQuarterStartMonth,
  itemLink,
  itemQuarters,
  nextFiscalQuarterStart,
  normalizeBets,
  framingGaps,
  migrateItems,
  plannedShareTotal,
  resolveDomain,
  runTheBusinessShare,
  stageBlockReason,
  totalEpicQuarters,
} from "./logic";
import type { Bet, Item, LoopState, Milestone, Prototype, Weights } from "./types";

const WEIGHTS: Weights = { votes: 1, reach: 3, confidence: 2, strategicFit: 3 };

function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1",
    title: "Item",
    description: "",
    mission: "Family",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    activity: [],
    ...over,
  };
}

function bet(over: Partial<Bet> = {}): Bet {
  return {
    id: "b1",
    title: "Bet",
    description: "",
    thesis: "",
    whyNow: "",
    tier: "foundational",
    theme: "grow",
    goalArea: "product-strategy",
    sponsor: "",
    owner: "",
    status: "active",
    horizon: null,
    confidence: 3,
    reversibility: 3,
    value: {
      statement: "",
      type: "new-revenue",
      magnitude: null,
      basis: "guess",
      timeToValue: null,
    },
    evidence: { strength: 1, notes: "", links: [] },
    outcomes: [],
    jtbdIds: [],
    plannedShare: { now: 0, next: 0, later: 0 },
    killCriteria: "",
    nextReview: null,
    decision: { verdict: null, rationale: "", decidedAt: null },
    color: "#7A5AF8",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function state(over: Partial<LoopState> = {}): LoopState {
  return {
    items: [],
    weights: WEIGHTS,
    bets: [],
    milestones: [],
    ...over,
  };
}

describe("framingGaps", () => {
  const framed = item({
    problemStatement: "Registration takes too long and families drop off.",
    kr: { statement: "", metric: "Signup conversion", unit: "%", baseline: 80, target: 90, current: 85 },
  });

  it("is empty for a fully framed item", () => {
    expect(framingGaps(framed)).toEqual([]);
  });

  it("flags only the baseline when metric and target are set", () => {
    const it_ = { ...framed, kr: { ...framed.kr, baseline: null } };
    expect(framingGaps(it_)).toEqual(["a baseline value"]);
  });

  it("does not treat a zero baseline as missing", () => {
    const it_ = { ...framed, kr: { ...framed.kr, baseline: 0 } };
    expect(framingGaps(it_)).toEqual([]);
  });

  it("lists every missing piece", () => {
    const bare = item({ problemStatement: "", kr: framed.kr });
    const gaps = framingGaps({
      ...bare,
      kr: { ...framed.kr, metric: "", baseline: null, target: null },
    });
    expect(gaps).toEqual([
      "a problem statement",
      "a metric",
      "a baseline value",
      "a target value",
    ]);
  });
});

describe("stageBlockReason", () => {
  const framed = item({
    problemStatement: "Registration takes too long and families drop off.",
    kr: { statement: "", metric: "Signup conversion", unit: "%", baseline: 80, target: 90, current: 85 },
  });

  it("allows a framed item into Validate", () => {
    expect(stageBlockReason(framed, "Validate")).toBeNull();
  });

  it("names the specific missing field in the block message", () => {
    const noBaseline = { ...framed, kr: { ...framed.kr, baseline: null } };
    const reason = stageBlockReason(noBaseline, "Validate");
    expect(reason).toContain("a baseline value");
    expect(reason).not.toContain("a metric");
    expect(reason).not.toContain("a target value");
  });

  it("joins multiple gaps with a serial comma", () => {
    const bare = {
      ...framed,
      problemStatement: "",
      kr: { ...framed.kr, metric: "", baseline: null, target: null },
    };
    expect(stageBlockReason(bare, "Deliver")).toContain(
      "a problem statement, a metric, a baseline value, and a target value",
    );
  });
});

describe("diffStates", () => {
  it("reports no differences when draft equals live", () => {
    const live = state({ items: [item()] });
    const draft = state({ items: [item()] });
    expect(diffCount(diffStates(live, draft))).toBe(0);
  });

  it("detects an added item (in draft, not live)", () => {
    const live = state({ items: [item({ id: "a" })] });
    const draft = state({ items: [item({ id: "a" }), item({ id: "b", title: "New bet" })] });
    const d = diffStates(live, draft);
    expect(d.itemsAdded.map((i) => i.id)).toEqual(["b"]);
    expect(d.itemsRemoved).toHaveLength(0);
  });

  it("detects a removed item (in live, not draft)", () => {
    const live = state({ items: [item({ id: "a" }), item({ id: "b" })] });
    const draft = state({ items: [item({ id: "a" })] });
    const d = diffStates(live, draft);
    expect(d.itemsRemoved.map((i) => i.id)).toEqual(["b"]);
    expect(d.itemsAdded).toHaveLength(0);
  });

  it("records a per-field change with before/after", () => {
    const live = state({ items: [item({ id: "a", horizon: "later" })] });
    const draft = state({ items: [item({ id: "a", horizon: "now" })] });
    const d = diffStates(live, draft);
    expect(d.itemsChanged).toHaveLength(1);
    const change = d.itemsChanged[0].changes.find((c) => c.field === "horizon");
    expect(change).toEqual({ field: "horizon", before: "later", after: "now" });
  });

  it("flags a killed bet", () => {
    const live = state({ items: [item({ id: "a", killed: false })] });
    const draft = state({ items: [item({ id: "a", killed: true })] });
    const d = diffStates(live, draft);
    expect(
      d.itemsChanged[0].changes.some((c) => c.field === "killed" && c.after === true),
    ).toBe(true);
  });

  it("surfaces a rank shift when scoring fields change", () => {
    const live = state({ items: [item({ id: "a", reach: 1 })] });
    const draft = state({ items: [item({ id: "a", reach: 5 })] });
    const d = diffStates(live, draft);
    const changes = d.itemsChanged[0].changes;
    expect(changes.some((c) => c.field === "reach")).toBe(true);
    expect(changes.some((c) => c.field === "rank")).toBe(true);
  });

  it("detects changed ranking weights", () => {
    const live = state();
    const draft = state({ weights: { ...WEIGHTS, reach: 5 } });
    const d = diffStates(live, draft);
    expect(d.weights).toEqual([{ field: "reach", before: 3, after: 5 }]);
  });

  it("treats dependsOn as an unordered set", () => {
    const live = state({ items: [item({ id: "a", dependsOn: ["x", "y"] })] });
    const draft = state({ items: [item({ id: "a", dependsOn: ["y", "x"] })] });
    expect(diffCount(diffStates(live, draft))).toBe(0);
  });

  it("diffs bets and milestones by id", () => {
    const initA: Bet = bet({ id: "n1", title: "Registration" });
    const ms: Milestone = {
      id: "m1",
      title: "Beta",
      date: "2026-03-01",
      color: "#7A5AF8",
      description: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const live = state({ bets: [initA], milestones: [ms] });
    const draft = state({
      bets: [{ ...initA, title: "Registration v2" }],
      milestones: [],
    });
    const d = diffStates(live, draft);
    expect(d.betsChanged[0].changes[0]).toEqual({
      field: "title",
      before: "Registration",
      after: "Registration v2",
    });
    expect(d.milestonesRemoved.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("resolveDomain", () => {
  it("resolves from the module, ignoring the team", () => {
    // community-engagement → Community & Media → community, even though the
    // Admin Workflows team maps to the admin-workflows domain.
    expect(
      resolveDomain(
        item({ moduleId: "community-engagement", mission: "Admin Workflows" }),
      ),
    ).toBe("community");
  });

  it("falls back to the team mapping when no module is set", () => {
    expect(
      resolveDomain(item({ moduleId: null, mission: "Platform — Payments" })),
    ).toBe("product-platform");
  });

  it("falls back to the team mapping when the module id is unknown", () => {
    expect(
      resolveDomain(item({ moduleId: "bogus", mission: "Admin Workflows" })),
    ).toBe("admin-workflows");
  });

  it("lands unknown/renamed teams in the unclaimed domain", () => {
    expect(resolveDomain(item({ moduleId: null, mission: "GhostTeam" }))).toBe(
      "unclaimed",
    );
  });

  it("resolves a module whose JTBD sits in the unclaimed domain", () => {
    expect(resolveDomain(item({ moduleId: "events-and-rentals" }))).toBe(
      "unclaimed",
    );
  });
});

// Databases written before the JTBD rename store the durable anchor as
// `capabilityId`. The ids themselves never changed, so the migration is a key
// move — but if it regressed, every stored item would silently fall back to its
// team's domain and the anchor would be lost on the next save.
describe("migrateItems capabilityId → moduleId", () => {
  // A legacy row: the old key present, the new one absent entirely.
  const legacyRow = (capabilityId: string | null) => {
    const raw = { ...item(), capabilityId } as unknown as Record<string, unknown>;
    delete raw.moduleId;
    return raw as unknown as Item;
  };

  it("carries a legacy capabilityId onto moduleId", () => {
    const out = migrateItems([legacyRow("payment-processing")])[0];
    expect(out.moduleId).toBe("payment-processing");
  });

  it("drops the stale capabilityId key so the two can't drift", () => {
    const out = migrateItems([legacyRow("payment-processing")])[0];
    expect(out).not.toHaveProperty("capabilityId");
  });

  it("preserves an explicit legacy null", () => {
    expect(migrateItems([legacyRow(null)])[0].moduleId).toBeNull();
  });

  it("resolves the domain through the migrated anchor", () => {
    // Team is a Community one, so a lost anchor would resolve to "community".
    const raw = { ...legacyRow("payment-processing"), mission: "Family" };
    expect(resolveDomain(migrateItems([raw])[0])).toBe("product-platform");
  });

  it("prefers an already-migrated moduleId over a leftover capabilityId", () => {
    const raw = {
      ...item({ moduleId: "family-billing" }),
      capabilityId: "payment-processing",
    } as unknown as Item;
    const out = migrateItems([raw])[0];
    expect(out.moduleId).toBe("family-billing");
    expect(out).not.toHaveProperty("capabilityId");
  });

  it("is idempotent", () => {
    const once = migrateItems([legacyRow("payment-processing")]);
    expect(migrateItems(once)[0].moduleId).toBe("payment-processing");
  });

  it("defaults a missing anchor to null", () => {
    const raw = { ...item() } as unknown as Record<string, unknown>;
    delete raw.moduleId;
    expect(migrateItems([raw as unknown as Item])[0].moduleId).toBeNull();
  });
});

describe("migrateItems team remap", () => {
  const missionOf = (over: Partial<Item>) => migrateItems([item(over)])[0].mission;

  it("remaps a retired codename to the team owning its module's JTBD", () => {
    // Alpha is retired; community-engagement sits in Community & Media, owned by
    // Community — Engagement & Advancement.
    expect(missionOf({ mission: "Alpha", moduleId: "community-engagement" })).toBe(
      "Community — Engagement & Advancement",
    );
  });

  it("lets the module win over the retirement table", () => {
    // Phoenix retires to Staff & Family Comms, but a Payments module
    // overrides it — the module is the durable anchor.
    expect(missionOf({ mission: "Phoenix", moduleId: "payment-processing" })).toBe(
      "Platform — Payments",
    );
  });

  it("falls back to the retirement table when no module is set", () => {
    expect(missionOf({ mission: "Phoenix", moduleId: null })).toBe(
      "Community — Staff & Family Comms",
    );
    // Sub-domains from the previous map are retired too, not just codenames.
    expect(missionOf({ mission: "Financials", moduleId: null })).toBe(
      "Platform — Payments",
    );
  });

  it("is idempotent — a migrated team is left alone", () => {
    const once = migrateItems([
      item({ mission: "Alpha", moduleId: "community-engagement" }),
    ]);
    expect(migrateItems(once)[0].mission).toBe(
      "Community — Engagement & Advancement",
    );
  });

  it("leaves a current team untouched", () => {
    expect(missionOf({ mission: "UltraCamp", moduleId: null })).toBe("UltraCamp");
    expect(missionOf({ mission: "Admin Workflows", moduleId: null })).toBe(
      "Admin Workflows",
    );
  });

  it("empties a team it cannot map rather than inventing one", () => {
    expect(missionOf({ mission: "GhostTeam", moduleId: null })).toBe("");
    // Gazebo retires to nothing — its module has no owner on the new map.
    expect(missionOf({ mission: "Gazebo", moduleId: null })).toBe("");
  });
});

describe("migrateItems owner backfill", () => {
  const ownerOf = (over: Partial<Item>) => migrateItems([item(over)])[0].owner;

  it("defaults a missing owner to the empty string (unassigned)", () => {
    const raw = item();
    delete (raw as Partial<Item>).owner;
    expect(migrateItems([raw])[0].owner).toBe("");
  });

  it("preserves an assigned owner", () => {
    expect(ownerOf({ owner: "Jared" })).toBe("Jared");
  });
});

describe("fiscalQuarter", () => {
  // Fiscal year starts Sep 1, named for the calendar year it ends in.
  it("maps Sep–Nov to Q1 of the next-numbered fiscal year", () => {
    expect(fiscalQuarter(new Date(2026, 8, 1))).toEqual({ year: 2027, quarter: 1 }); // Sep
    expect(fiscalQuarter(new Date(2026, 10, 30))).toEqual({ year: 2027, quarter: 1 }); // Nov
  });

  it("maps Dec–Feb to Q2, Mar–May to Q3, Jun–Aug to Q4", () => {
    expect(fiscalQuarter(new Date(2026, 11, 1))).toEqual({ year: 2027, quarter: 2 }); // Dec
    expect(fiscalQuarter(new Date(2027, 1, 28))).toEqual({ year: 2027, quarter: 2 }); // Feb
    expect(fiscalQuarter(new Date(2027, 4, 15))).toEqual({ year: 2027, quarter: 3 }); // May
    expect(fiscalQuarter(new Date(2026, 5, 30))).toEqual({ year: 2026, quarter: 4 }); // Jun
  });

  // The column headings on the roadmap deck: "Q4 '26 / June, July, Aug" and
  // "Q1 '27 / Sept, Oct, Nov".
  it("labels fiscal quarters the way the roadmap deck does", () => {
    expect(fiscalQuarterLabel(new Date(2026, 5, 1))).toBe("Q4 FY26"); // Jun '26
    expect(fiscalQuarterLabel(new Date(2026, 8, 1))).toBe("Q1 FY27"); // Sep '26
    expect(fiscalQuarterLabel(new Date(2026, 11, 1))).toBe("Q2 FY27"); // Dec '26
    expect(fiscalQuarterLabel(new Date(2027, 2, 1))).toBe("Q3 FY27"); // Mar '27
  });

  it("produces a monotonic, contiguous index across the fiscal-year boundary", () => {
    const aug = fiscalQuarterIndex(new Date(2026, 7, 1)); // Q4 FY26
    const sep = fiscalQuarterIndex(new Date(2026, 8, 1)); // Q1 FY27
    expect(sep - aug).toBe(1);
  });

  it("finds the fiscal quarter boundaries at Sep / Dec / Mar / Jun", () => {
    const starts = [8, 11, 2, 5]; // Sep, Dec, Mar, Jun
    for (let m = 0; m < 12; m++)
      expect(
        isFiscalQuarterStartMonth(new Date(2027, m, 1)),
        `month ${m}`,
      ).toBe(starts.includes(m));
  });

  it("steps to the start of the next fiscal quarter", () => {
    // Mid-quarter (Jan, inside Dec–Feb) and on a boundary (Dec) both land on Mar 1.
    expect(nextFiscalQuarterStart(new Date(2027, 0, 15))).toEqual(new Date(2027, 2, 1));
    expect(nextFiscalQuarterStart(new Date(2026, 11, 1))).toEqual(new Date(2027, 2, 1));
    // Rolls the calendar year over: Jun–Aug → Sep 1.
    expect(nextFiscalQuarterStart(new Date(2027, 7, 20))).toEqual(new Date(2027, 8, 1));
  });

  it("counts months into the fiscal year from September", () => {
    expect(fiscalMonthOffset(new Date(2026, 8, 1))).toBe(0); // Sep
    expect(fiscalMonthOffset(new Date(2026, 11, 1))).toBe(3); // Dec
    expect(fiscalMonthOffset(new Date(2027, 7, 1))).toBe(11); // Aug
  });
});

describe("fiscalSeason", () => {
  it("names each fiscal quarter as the season Campminder calls it", () => {
    expect(fiscalSeason(new Date(2026, 8, 1))).toBe("Fall"); // Q1, Sep
    expect(fiscalSeason(new Date(2026, 11, 1))).toBe("Winter"); // Q2, Dec
    expect(fiscalSeason(new Date(2027, 2, 1))).toBe("Spring"); // Q3, Mar
    expect(fiscalSeason(new Date(2027, 5, 1))).toBe("Summer"); // Q4, Jun
  });

  // The labels the seed pipeline already writes in 3_epics.csv: "FY27-Q1
  // Fall'26" means Sep–Nov 2026. A season is named for the calendar year it
  // starts in, which is one behind the fiscal year for Fall and Winter — this
  // is the easiest thing to get backwards, so it's pinned in both directions.
  it("names a season for the calendar year it starts in, not the fiscal year", () => {
    expect(fiscalSeasonLabel(new Date(2026, 8, 1))).toBe("Fall '26"); // FY27-Q1
    expect(fiscalSeasonLabel(new Date(2026, 10, 30))).toBe("Fall '26");
    expect(fiscalSeasonLabel(new Date(2026, 11, 1))).toBe("Winter '26"); // FY27-Q2
    expect(fiscalSeasonLabel(new Date(2027, 2, 1))).toBe("Spring '27"); // FY27-Q3
    expect(fiscalSeasonLabel(new Date(2027, 5, 1))).toBe("Summer '27"); // FY27-Q4
    expect(fiscalSeasonLabel(new Date(2026, 5, 1))).toBe("Summer '26"); // FY26-Q4
  });

  // Jan and Feb are the tail of a Winter that began the previous December, so
  // they look back a calendar year while still naming the same three months.
  it("keeps Dec, Jan and Feb inside one named Winter", () => {
    expect(fiscalSeasonLabel(new Date(2026, 11, 15))).toBe("Winter '26"); // Dec '26
    expect(fiscalSeasonLabel(new Date(2027, 0, 15))).toBe("Winter '26"); // Jan '27
    expect(fiscalSeasonLabel(new Date(2027, 1, 28))).toBe("Winter '26"); // Feb '27
  });

  it("agrees with fiscalQuarterLabel about which three months it names", () => {
    // Every month of FY27 maps to the same span under both naming schemes.
    const pairs: [Date, string, string][] = [
      [new Date(2026, 8, 1), "Q1 FY27", "Fall '26"],
      [new Date(2026, 11, 1), "Q2 FY27", "Winter '26"],
      [new Date(2027, 2, 1), "Q3 FY27", "Spring '27"],
      [new Date(2027, 5, 1), "Q4 FY27", "Summer '27"],
    ];
    for (const [d, fy, season] of pairs) {
      expect(fiscalQuarterLabel(d), String(d)).toBe(fy);
      expect(fiscalSeasonLabel(d), String(d)).toBe(season);
    }
  });
});

describe("bet funding", () => {
  it("auto-sets the funder when an item has exactly one bet", () => {
    const [m] = migrateItems([item({ betIds: ["b1"] })]);
    expect(m.fundedBetId).toBe("b1");
  });

  it("leaves the funder unset when several bets could pay", () => {
    // Ambiguous, so it stays null and the work rolls into run-the-business
    // rather than silently charging whichever bet happens to be first.
    const [m] = migrateItems([item({ betIds: ["b1", "b2"] })]);
    expect(m.fundedBetId).toBeNull();
  });

  it("does not override a funder that was chosen deliberately", () => {
    const [m] = migrateItems([
      item({ betIds: ["b1", "b2"], fundedBetId: "b2" }),
    ]);
    expect(m.fundedBetId).toBe("b2");
  });

  it("clears a funder the item is no longer linked to", () => {
    // The invariant: a dangling funder would keep charging a bet the item has
    // been unlinked from, inflating that bet's share forever.
    const [m] = migrateItems([item({ betIds: ["b1"], fundedBetId: "gone" })]);
    expect(m.fundedBetId).toBe("b1");
    const [n] = migrateItems([
      item({ betIds: ["b1", "b2"], fundedBetId: "gone" }),
    ]);
    expect(n.fundedBetId).toBeNull();
  });

  it("carries legacy initiativeIds over and drops the stale key", () => {
    const legacy = { ...item(), initiativeIds: ["b1"] } as unknown as Item;
    delete (legacy as { betIds?: string[] }).betIds;
    const [m] = migrateItems([legacy]);
    expect(m.betIds).toEqual(["b1"]);
    expect(m.fundedBetId).toBe("b1");
    expect("initiativeIds" in m).toBe(false);
  });
});

describe("bet investment", () => {
  const scheduled = (over: Partial<Item> = {}) =>
    item({ targetStart: "2026-09-01", targetEnd: "2026-11-30", ...over });

  it("counts an epic spanning a fiscal-year boundary as one quarter", () => {
    // Dec 2027 – Feb 2028 is Q2 FY28 at both ends. Counting elapsed months, or
    // subtracting calendar years, would call this three or five.
    expect(
      itemQuarters(
        item({ targetStart: "2027-12-01", targetEnd: "2028-02-29" }),
      ),
    ).toBe(1);
    // And a genuine multi-quarter span still counts every quarter it touches.
    expect(
      itemQuarters(
        item({ targetStart: "2026-09-01", targetEnd: "2027-05-31" }),
      ),
    ).toBe(3);
    expect(itemQuarters(item())).toBe(0); // unscheduled
  });

  it("divides funded share by the whole roadmap, not by the bets", () => {
    // One funded epic among four scheduled ones is 25% of the roadmap. Divided
    // by the bets alone it would read 100% — the regression this guards.
    const items = [
      scheduled({ id: "a", betIds: ["b1"], fundedBetId: "b1" }),
      scheduled({ id: "b" }),
      scheduled({ id: "c" }),
      scheduled({ id: "d" }),
    ];
    expect(totalEpicQuarters(items)).toBe(4);
    expect(betFundedShare(bet({ id: "b1" }), items).share).toBe(25);
  });

  it("keeps funded shares summing to at most 100 with the remainder as run-the-business", () => {
    const items = [
      scheduled({ id: "a", betIds: ["b1"], fundedBetId: "b1" }),
      scheduled({ id: "b", betIds: ["b2"], fundedBetId: "b2" }),
      scheduled({ id: "c" }),
      scheduled({ id: "d" }),
    ];
    const one = betFundedShare(bet({ id: "b1" }), items).share;
    const two = betFundedShare(bet({ id: "b2" }), items).share;
    const rtb = runTheBusinessShare(items).share;
    expect(one + two).toBeLessThanOrEqual(100);
    expect(one + two + rtb).toBe(100);
    expect(rtb).toBe(50);
  });

  it("counts an enabling link in reach but never in funded share", () => {
    // The double-count this whole design exists to prevent: one epic on two
    // bets must cost one of them and be merely reached by the other.
    const items = [
      scheduled({ id: "a", betIds: ["b1", "b2"], fundedBetId: "b1" }),
      scheduled({ id: "b" }),
    ];
    expect(betFundedShare(bet({ id: "b2" }), items).epics).toBe(0);
    expect(betReach(bet({ id: "b2" }), items).epics).toBe(1);
    expect(betFundedShare(bet({ id: "b1" }), items).share).toBe(50);
    expect(betReach(bet({ id: "b2" }), items).share).toBe(50);
  });

  it("excludes killed work from the denominator", () => {
    const items = [
      scheduled({ id: "a", betIds: ["b1"], fundedBetId: "b1" }),
      scheduled({ id: "b", killed: true }),
    ];
    expect(totalEpicQuarters(items)).toBe(1);
    expect(betFundedShare(bet({ id: "b1" }), items).share).toBe(100);
  });

  it("totals planned share across foundational bets only", () => {
    const bets = [
      bet({ id: "b1", tier: "foundational", plannedShare: { now: 40, next: 0, later: 0 } }),
      bet({ id: "b2", tier: "foundational", plannedShare: { now: 30, next: 0, later: 0 } }),
      // Experiments carry no share, so ~20 of them can't crowd out the bar.
      bet({ id: "b3", tier: "experiment", plannedShare: { now: 90, next: 0, later: 0 } }),
      // Nor do bets that have already ended.
      bet({ id: "b4", tier: "foundational", status: "killed", plannedShare: { now: 50, next: 0, later: 0 } }),
    ];
    expect(plannedShareTotal(bets, "now")).toBe(70);
  });
});

describe("bet scope reconciliation", () => {
  it("flags a declared JTBD with no work behind it", () => {
    const b = bet({ id: "b1", jtbdIds: ["registrations", "payments"] });
    const items = [
      item({ id: "a", betIds: ["b1"], moduleId: "applications-registration" }),
    ];
    expect(betUnstaffedClaims(b, items)).toEqual(["payments"]);
    expect(betUndeclaredSpend(b, items)).toEqual([]);
  });

  it("flags work landing outside the declaration", () => {
    const b = bet({ id: "b1", jtbdIds: ["registrations"] });
    const items = [
      item({ id: "a", betIds: ["b1"], moduleId: "applications-registration" }),
      item({ id: "b", betIds: ["b1"], moduleId: "family-billing" }),
    ];
    expect(betUndeclaredSpend(b, items)).toEqual(["payments"]);
    // Declared entries lead, so a bet's own statement of intent reads first.
    expect(betJtbdScope(b, items).map((s) => s.declared)).toEqual([true, false]);
  });
});

describe("normalizeBets", () => {
  it("round-trips every field through export and import", () => {
    // The whitelist trap: a field missing from normalizeBets works in memory and
    // vanishes on reload, so this asserts the whole shape survives.
    const b = bet({
      id: "b1",
      thesis: "We believe X",
      whyNow: "now",
      tier: "foundational",
      theme: "protect",
      goalArea: "delivery",
      sponsor: "Scott",
      owner: "Jared",
      status: "scaling",
      horizon: "now",
      confidence: 4,
      reversibility: 2,
      value: {
        statement: "retained ARR",
        type: "retained-revenue",
        magnitude: 1_400_000,
        basis: "modeled",
        timeToValue: 4,
      },
      evidence: { strength: 5, notes: "EYP study", links: ["https://x"] },
      jtbdIds: ["registrations"],
      plannedShare: { now: 25, next: 10, later: 0 },
      killCriteria: "WAU flat after two quarters",
      nextReview: "2027-01-15",
      decision: { verdict: "won", rationale: "shipped", decidedAt: "2027-02-01" },
    });
    const round = normalizeBets(JSON.parse(JSON.stringify([b])))[0];
    expect(round).toEqual(b);
  });

  it("fills a legacy initiative row without inventing credibility", () => {
    // An old row has none of the new fields. It must land valid, but with the
    // weakest possible claims — not a modeled magnitude it never had.
    const legacy = {
      id: "n1",
      title: "Registration",
      description: "",
      color: "#7A5AF8",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as Bet;
    const [b] = normalizeBets([legacy]);
    expect(b.title).toBe("Registration");
    expect(b.tier).toBe("experiment");
    expect(b.value.magnitude).toBeNull();
    expect(b.value.basis).toBe("guess");
    expect(b.evidence.strength).toBe(1);
    expect(b.decision.verdict).toBeNull();
    expect(b.plannedShare).toEqual({ now: 0, next: 0, later: 0 });
  });

  it("clamps out-of-range scores and shares rather than rejecting the row", () => {
    const [b] = normalizeBets([
      bet({ confidence: 99, reversibility: 0, plannedShare: { now: 500, next: -3, later: 0 } }),
    ]);
    expect(b.confidence).toBe(5);
    expect(b.reversibility).toBe(1);
    expect(b.plannedShare.now).toBe(100);
    expect(b.plannedShare.next).toBe(0);
  });
});

describe("scenario compare sees bet changes", () => {
  it("reports a moved planned share and a moved funder", () => {
    // Without these in the diff whitelists, the allocation trade-off a scenario
    // exists to model would be invisible in the compare drawer.
    const live = state({
      bets: [bet({ id: "b1", plannedShare: { now: 20, next: 0, later: 0 } })],
      items: [item({ id: "a", betIds: ["b1", "b2"], fundedBetId: "b1" })],
    });
    const draft = state({
      bets: [bet({ id: "b1", plannedShare: { now: 35, next: 0, later: 0 } })],
      items: [item({ id: "a", betIds: ["b1", "b2"], fundedBetId: "b2" })],
    });
    const d = diffStates(live, draft);
    expect(d.betsChanged[0].changes).toContainEqual({
      field: "plannedShare.now",
      before: 20,
      after: 35,
    });
    expect(d.itemsChanged[0].changes).toContainEqual({
      field: "fundedBetId",
      before: "b1",
      after: "b2",
    });
  });
});

describe("itemLink", () => {
  function proto(over: Partial<Prototype> = {}): Prototype {
    return {
      id: "p1",
      title: "Direction",
      url: "https://figma.test/p1",
      approach: "",
      createdBy: { type: "human", name: "" },
      status: "exploring",
      outcomeReading: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...over,
    };
  }

  it("returns null when nothing is linked", () => {
    expect(itemLink(item())).toBeNull();
  });

  it("sends a framed item to its brief", () => {
    const link = itemLink(
      item({ stage: "Frame", notionUrl: "https://notion.test/x", notionTitle: "Forms PRD" }),
    );
    expect(link).toMatchObject({
      kind: "brief",
      url: "https://notion.test/x",
      label: "Open brief",
      detail: "Forms PRD",
    });
  });

  it("prefers the design once the item is validating, even with a brief linked", () => {
    const link = itemLink(
      item({
        stage: "Validate",
        notionUrl: "https://notion.test/x",
        prototypes: [proto()],
      }),
    );
    expect(link).toMatchObject({ kind: "design", url: "https://figma.test/p1" });
  });

  it("picks the converged direction over the others", () => {
    const link = itemLink(
      item({
        stage: "Validate",
        prototypes: [
          proto({ id: "p1", createdAt: "2026-02-01T00:00:00.000Z" }),
          proto({ id: "p2", url: "https://figma.test/p2", status: "chosen", title: "Inline" }),
        ],
      }),
    );
    expect(link).toMatchObject({ kind: "design", url: "https://figma.test/p2", detail: "Inline" });
  });

  it("picks the newest live direction when none is chosen, ignoring rejected ones", () => {
    const link = itemLink(
      item({
        stage: "Validate",
        prototypes: [
          proto({ id: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
          proto({ id: "p2", url: "https://figma.test/p2", createdAt: "2026-03-01T00:00:00.000Z" }),
          proto({
            id: "p3",
            url: "https://figma.test/p3",
            status: "rejected",
            createdAt: "2026-04-01T00:00:00.000Z",
          }),
        ],
      }),
    );
    expect(link?.url).toBe("https://figma.test/p2");
  });

  it("falls back to the legacy single prototype link", () => {
    const link = itemLink(item({ stage: "Validate", prototypeUrl: "https://v0.test/old" }));
    expect(link).toMatchObject({ kind: "design", url: "https://v0.test/old", detail: "" });
  });

  it("sends an item in delivery to its work item", () => {
    const link = itemLink(
      item({
        stage: "Deliver",
        notionUrl: "https://notion.test/x",
        prototypes: [proto()],
        adoUrl: "https://ado.test/1",
        adoStatus: "Active — Sprint 4",
      }),
    );
    expect(link).toMatchObject({
      kind: "ado",
      url: "https://ado.test/1",
      label: "Open in ADO",
      detail: "Active — Sprint 4",
    });
  });

  it("uses a sub-item's work item when the epic has none of its own", () => {
    const link = itemLink(
      item({
        stage: "Deliver",
        subItems: [
          { id: "s1", title: "No link", targetStart: null, targetEnd: null, done: false, adoUrl: "", adoStatus: "" },
          { id: "s2", title: "Build API", targetStart: null, targetEnd: null, done: false, adoUrl: "https://ado.test/2", adoStatus: "" },
        ],
      }),
    );
    expect(link).toMatchObject({ kind: "ado", url: "https://ado.test/2", detail: "Build API" });
  });

  it("falls through to the brief for an item in delivery with no work item", () => {
    const link = itemLink(item({ stage: "Deliver", notionUrl: "https://notion.test/x" }));
    expect(link?.kind).toBe("brief");
  });

  it("falls back to the Aha idea for a captured item with nothing else", () => {
    const link = itemLink(
      item({ ahaUrl: "https://aha.test/i1", ahaReference: "PROD-I-123" }),
    );
    expect(link).toMatchObject({ kind: "idea", label: "Open idea", detail: "PROD-I-123" });
  });

  it("ignores whitespace-only URLs", () => {
    expect(itemLink(item({ notionUrl: "   ", adoUrl: "  " }))).toBeNull();
  });
});
