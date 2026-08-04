import { describe, expect, it } from "vitest";
import seedJson from "./seed-data.json";
import { ITEM_TYPES, MISSIONS, STAGES } from "./constants";
import { DOMAINS, MODULES } from "./taxonomy";
import { resolveDomain } from "./logic";
import { seedBets, seedItems, seedMilestones } from "./seed";
import type { Item } from "./types";

// The seed roadmap is generated (docs/seed-redesign/build_import.py) from the
// Architecture-Aligned map and the Epic Seed sheet. These tests turn the easy mistakes — a module id that
// no longer exists, an invalid type tag, an item with no dates, a duplicate id —
// into a CI failure instead of a silently mis-placed or invisible roadmap item.
describe("seed-data integrity", () => {
  const moduleIds = new Set(MODULES.map((m) => m.id));
  const rawItems = seedJson.items as unknown as Item[];

  it("gives every item a unique id", () => {
    const ids = rawItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("anchors every item to a real module (or leaves it null)", () => {
    for (const i of rawItems) {
      if (i.moduleId !== null)
        expect(moduleIds, `item "${i.id}"`).toContain(i.moduleId);
    }
  });

  it("tags every item with a valid type (or null)", () => {
    for (const i of rawItems) {
      if (i.type !== null && i.type !== undefined)
        expect(ITEM_TYPES as readonly string[], `item "${i.id}"`).toContain(
          i.type,
        );
    }
  });

  it("gives every item both target dates so it lands on the timeline", () => {
    for (const i of rawItems) {
      expect(i.targetStart, `item "${i.id}" start`).toBeTruthy();
      expect(i.targetEnd, `item "${i.id}" end`).toBeTruthy();
    }
  });

  // An inverted range renders as a zero/negative-width bar rather than failing
  // loudly, so it is worth asserting rather than eyeballing.
  it("gives every item a well-formed, non-inverted date range", () => {
    for (const i of rawItems) {
      expect(i.targetStart, i.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.targetEnd, i.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i.targetStart! <= i.targetEnd!, `item "${i.id}" range`).toBe(true);
    }
  });

  it("gives every item a stage the loop knows", () => {
    for (const i of seedItems())
      expect(STAGES as readonly string[], `item "${i.id}"`).toContain(i.stage);
  });

  it("resolves every seeded item into one of the real owner-domains", () => {
    const domainIds = DOMAINS.map((d) => d.id);
    const unclaimed: string[] = [];
    for (const i of seedItems()) {
      const d = resolveDomain(i);
      expect(domainIds, `item "${i.id}"`).toContain(d);
      if (d === "unclaimed") unclaimed.push(i.id);
    }
    // Only Events & Rentals, the lone module under Unclaimed Property.
    expect(unclaimed.length, `unclaimed: ${unclaimed.join(", ")}`).toBeLessThanOrEqual(1);
  });

  // Team is stored on the item, not derived from its module, so a typo here
  // would strand work in a band no filter or view lists.
  it("assigns every item to a current team, or leaves it explicitly unassigned", () => {
    const unassigned: string[] = [];
    for (const i of seedItems()) {
      if (i.mission === "") unassigned.push(i.id);
      else expect(MISSIONS, `item "${i.id}"`).toContain(i.mission);
    }
    // Only Events & Rentals, the one module no team owns, may be team-less.
    expect(unassigned.length).toBeLessThanOrEqual(1);
  });

  it("seeds bets and links the parent-experience epics to one", () => {
    const inits = seedBets();
    expect(inits.length).toBeGreaterThan(0);
    const ids = new Set(inits.map((x) => x.id));
    const linked = seedItems().filter((i: Item) => i.betIds.length);
    expect(linked.length).toBeGreaterThan(0);
    for (const i of linked)
      for (const id of i.betIds)
        expect(ids, `item "${i.id}"`).toContain(id);
  });

  it("seeds cross-team milestones with a title and date", () => {
    const ms = seedMilestones();
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      expect(m.title.trim(), `milestone "${m.id}"`).not.toBe("");
      expect(m.date, `milestone "${m.id}" date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
