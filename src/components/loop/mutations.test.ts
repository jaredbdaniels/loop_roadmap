import { describe, expect, it } from "vitest";
import { OWNER_UNASSIGNED } from "@/lib/loop/constants";
import type { Item } from "@/lib/loop/types";
import { visibleItems } from "./mutations";

// Minimal Item factory — only the fields visibleItems reads matter here.
function item(over: Partial<Item> = {}): Item {
  return {
    id: "i1",
    mission: "Family",
    owner: "",
    killed: false,
    betIds: [],
    ...over,
  } as Item;
}

describe("visibleItems owner filter", () => {
  const items = [
    item({ id: "a", owner: "Jared" }),
    item({ id: "b", owner: "Ellen" }),
    item({ id: "c", owner: "" }),
  ];

  it("an empty team filter keeps every (non-killed) item", () => {
    const ids = visibleItems(items, [], false, "all", "all").map((i) => i.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("matches a specific owner exactly", () => {
    const ids = visibleItems(items, [], false, "all", "Jared").map((i) => i.id);
    expect(ids).toEqual(["a"]);
  });

  it("the unassigned sentinel keeps only ownerless items", () => {
    const ids = visibleItems(items, [], false, "all", OWNER_UNASSIGNED).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["c"]);
  });

  it("composes with the team filter", () => {
    const mixed = [
      item({ id: "a", owner: "Jared", mission: "Family" }),
      item({ id: "b", owner: "Jared", mission: "Staff" }),
    ];
    const ids = visibleItems(mixed, ["Staff"], false, "all", "Jared").map(
      (i) => i.id,
    );
    expect(ids).toEqual(["b"]);
  });

  it("selecting several teams keeps items from any of them", () => {
    const mixed = [
      item({ id: "a", mission: "Family" }),
      item({ id: "b", mission: "Staff" }),
      item({ id: "c", mission: "Facilities" }),
    ];
    const ids = visibleItems(mixed, ["Family", "Staff"], false).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["a", "b"]);
  });
});

// Share mode hides the Intake lane from everyone without edit access. This
// filter is what makes it hold across all four views rather than only the
// board — the Timeline in particular would otherwise draw every parked idea,
// since intake rows carry dates.
describe("visibleItems share mode", () => {
  const items = [
    item({ id: "parked", stage: "Intake" }),
    item({ id: "live", stage: "Building" }),
  ];

  it("keeps Intake for a signed-in editor", () => {
    const ids = visibleItems(items, [], false, "all", "all", false).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["parked", "live"]);
  });

  it("drops Intake in share mode", () => {
    const ids = visibleItems(items, [], false, "all", "all", true).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["live"]);
  });

  it("defaults to showing Intake when share mode is not passed", () => {
    expect(visibleItems(items, [], false).map((i) => i.id)).toEqual([
      "parked",
      "live",
    ]);
  });

  it("still hides Intake when killed items are being shown", () => {
    const withKilled = [
      item({ id: "parked", stage: "Intake" }),
      item({ id: "dead", stage: "Building", killed: true }),
    ];
    const ids = visibleItems(withKilled, [], true, "all", "all", true).map(
      (i) => i.id,
    );
    expect(ids).toEqual(["dead"]);
  });
});
