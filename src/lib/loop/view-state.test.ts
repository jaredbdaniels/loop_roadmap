import { describe, expect, it } from "vitest";
import { OWNER_UNASSIGNED } from "./constants";
import { TEAMS } from "./taxonomy";
import {
  DEFAULT_VIEW_STATE,
  parseViewState,
  resolveViewDefaults,
  viewStateToParams,
  type ViewState,
} from "./view-state";

const TEAM_A = TEAMS[0];
const TEAM_B = TEAMS[1];

// Serialize then parse: the pair has to be a true round-trip, since the URL is
// the only thing carrying view state across a reload.
function roundTrip(state: ViewState, defaults = DEFAULT_VIEW_STATE): ViewState {
  return parseViewState(viewStateToParams(state, defaults), defaults);
}

describe("parseViewState", () => {
  it("returns the defaults for a bare URL", () => {
    expect(parseViewState({})).toEqual(DEFAULT_VIEW_STATE);
  });

  it("reads every param", () => {
    const parsed = parseViewState({
      view: "timeline",
      zoom: "month",
      group: "bet",
      hlayout: "quarter",
      teams: `${TEAM_A.id},${TEAM_B.id}`,
      owner: OWNER_UNASSIGNED,
      bet: "bet-7",
      killed: "1",
      item: "item-3",
    });
    expect(parsed).toEqual({
      view: "timeline",
      zoom: "month",
      groupBy: "bet",
      horizonLayout: "quarter",
      teams: [TEAM_A.label, TEAM_B.label],
      owner: OWNER_UNASSIGNED,
      bet: "bet-7",
      showKilled: true,
      detailId: "item-3",
    });
  });

  it("falls back to the defaults on junk values", () => {
    const parsed = parseViewState({
      view: "gantt",
      zoom: "decade",
      group: "vibes",
      hlayout: "sprint",
      owner: "Nobody In The Roster",
      killed: "",
    });
    expect(parsed).toEqual(DEFAULT_VIEW_STATE);
  });

  it("keeps the teams it recognizes and drops the ones it doesn't", () => {
    expect(
      parseViewState({ teams: `${TEAM_A.id},team-that-was-renamed` }).teams,
    ).toEqual([TEAM_A.label]);
  });

  it("honors a page's own defaults, and lets a param beat them", () => {
    const defaults = resolveViewDefaults({ view: "timeline", groupBy: "domain" });
    expect(parseViewState({}, defaults).view).toBe("timeline");
    expect(parseViewState({}, defaults).groupBy).toBe("domain");
    expect(parseViewState({ view: "board" }, defaults).view).toBe("board");
  });

  it("reads a URLSearchParams as happily as a Next searchParams object", () => {
    const fromObject = parseViewState({ view: ["horizon"] });
    const fromParams = parseViewState(new URLSearchParams("view=horizon"));
    expect(fromObject).toEqual(fromParams);
    expect(fromParams.view).toBe("horizon");
  });
});

describe("viewStateToParams", () => {
  it("writes nothing when nothing has moved off the defaults", () => {
    expect(viewStateToParams(DEFAULT_VIEW_STATE).toString()).toBe("");
  });

  it("writes only what differs", () => {
    const params = viewStateToParams({
      ...DEFAULT_VIEW_STATE,
      view: "timeline",
      zoom: "year",
    });
    expect(params.toString()).toBe("view=timeline&zoom=year");
  });

  it("round-trips the Horizon view's quarter layout", () => {
    const state: ViewState = { ...DEFAULT_VIEW_STATE, horizonLayout: "quarter" };
    expect(viewStateToParams(state).get("hlayout")).toBe("quarter");
    expect(roundTrip(state).horizonLayout).toBe("quarter");
  });

  it("round-trips a fully-specified state", () => {
    const state: ViewState = {
      view: "mission",
      zoom: "month",
      groupBy: "domain",
      horizonLayout: "quarter",
      teams: [TEAM_B.label],
      owner: OWNER_UNASSIGNED,
      bet: "bet-42",
      showKilled: true,
      detailId: "item-9",
    };
    expect(roundTrip(state)).toEqual(state);
  });

  it("round-trips an emptied team scope against a page that defaults to one", () => {
    const defaults = resolveViewDefaults({ teams: [TEAM_A.label] });
    const state: ViewState = { ...defaults, teams: [] };
    expect(viewStateToParams(state, defaults).get("teams")).toBe("none");
    expect(roundTrip(state, defaults).teams).toEqual([]);
  });

  it("round-trips showKilled back off against a page that defaults it on", () => {
    const defaults = resolveViewDefaults({ showKilled: true });
    const state: ViewState = { ...defaults, showKilled: false };
    expect(viewStateToParams(state, defaults).get("killed")).toBe("0");
    expect(roundTrip(state, defaults).showKilled).toBe(false);
  });
});
