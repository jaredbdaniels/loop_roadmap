// Where you are, as opposed to what the roadmap says.
//
// View, zoom, grouping, the three filters, whether killed work is showing and
// which card is expanded all belong to the *reader*, not the roadmap — two
// people looking at the same live data can sit in completely different places
// in it. Because that state lives only in React, a reload used to dump everyone
// back on the Board with the filters cleared, which is a bad trade when the
// thing you reloaded for was fresher data on the timeline you were reading.
//
// So it round-trips through the query string. Two consequences, both wanted:
// a reload lands you back where you were, and a pasted URL puts a teammate in
// the same place. The store writes it with replaceState (see the URL-sync
// effect in store.tsx) and the pages parse it on the way in, so the server
// renders the view you asked for rather than flashing the default first.
//
// Values are validated on the way in: a hand-edited, stale, or truncated URL
// falls back to the page's defaults rather than putting the app in a state its
// own controls can't express.

import {
  OWNERS,
  OWNER_UNASSIGNED,
  type GroupByKey,
  type ViewKey,
  type ZoomKey,
} from "./constants";
import { TEAMS, teamLabel } from "./taxonomy";

export interface ViewState {
  view: ViewKey;
  zoom: ZoomKey;
  groupBy: GroupByKey;
  // Team scope. Holds team *labels*, because that is what the filter itself
  // holds (see MISSIONS) — the query string carries the shorter, stabler team
  // ids and this module translates.
  teams: string[];
  // An OWNERS name, the OWNER_UNASSIGNED sentinel, or "all" for no scope.
  owner: string;
  // A bet id, or "all" for no scope.
  bet: string;
  showKilled: boolean;
  // The item whose detail modal is open, or null. Editors (capture, bet,
  // milestone, settings) deliberately don't round-trip: an editor is an unsaved
  // session, and reopening one empty after a reload promises something the
  // reload already threw away.
  detailId: string | null;
}

// What the main app opens on with a bare URL. Pages override pieces of this —
// /preview opens on the owner-grouped timeline — and every override is still
// beaten by an explicit query param.
export const DEFAULT_VIEW_STATE: ViewState = {
  view: "board",
  zoom: "quarter",
  groupBy: "team",
  teams: [],
  owner: "all",
  bet: "all",
  showKilled: false,
  detailId: null,
};

const VIEWS: ViewKey[] = ["board", "timeline", "horizon", "mission", "headlights"];
const ZOOMS: ZoomKey[] = ["month", "quarter", "year"];
const GROUP_BYS: GroupByKey[] = ["team", "domain", "bet"];

const TEAM_ID_BY_LABEL: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.label, t.id]),
);

// `teams=none` — an empty team scope, stated rather than implied. Needed because
// an absent param means "use the page's default", which isn't the same thing.
const TEAMS_NONE = "none";

function teamIds(labels: string[]): string[] {
  return labels
    .map((label) => TEAM_ID_BY_LABEL[label])
    .filter((id): id is string => Boolean(id));
}

// Next hands searchParams over as a plain object whose values may repeat; the
// client reads from a URLSearchParams. Both narrow to "first value for a key".
export type RawParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(raw: RawParams, key: string): string | undefined {
  const v = raw instanceof URLSearchParams ? raw.get(key) : raw[key];
  if (v === null || v === undefined) return undefined;
  const first = Array.isArray(v) ? v[0] : v;
  return first?.trim() ? first.trim() : undefined;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

// Fold a page's own defaults into the app-wide ones.
export function resolveViewDefaults(
  overrides?: Partial<ViewState>,
): ViewState {
  return { ...DEFAULT_VIEW_STATE, ...overrides };
}

export function parseViewState(
  raw: RawParams,
  defaults: ViewState = DEFAULT_VIEW_STATE,
): ViewState {
  const ownerParam = read(raw, "owner");
  const owner =
    ownerParam &&
    (ownerParam === OWNER_UNASSIGNED || OWNERS.includes(ownerParam))
      ? ownerParam
      : defaults.owner;

  const teamsParam = read(raw, "teams");
  // Unknown ids are dropped rather than failing the whole param — a team that
  // was renamed shouldn't cost you the rest of the URL. TEAMS_NONE is how "I
  // deliberately cleared the team scope" survives a page whose own default is
  // some particular team.
  const teams =
    teamsParam === undefined
      ? defaults.teams
      : teamsParam === TEAMS_NONE
        ? []
        : teamsParam
            .split(",")
            .map((id) => teamLabel(id.trim()))
            .filter((label) => label in TEAM_ID_BY_LABEL);

  const killed = read(raw, "killed");

  return {
    view: oneOf(read(raw, "view"), VIEWS, defaults.view),
    zoom: oneOf(read(raw, "zoom"), ZOOMS, defaults.zoom),
    groupBy: oneOf(read(raw, "group"), GROUP_BYS, defaults.groupBy),
    teams,
    owner,
    // Bet and item ids can't be checked without the roadmap in hand. The store
    // clears both if nothing matches once the data is loaded.
    bet: read(raw, "bet") ?? defaults.bet,
    showKilled:
      killed === undefined ? defaults.showKilled : killed === "1" || killed === "true",
    detailId: read(raw, "item") ?? defaults.detailId,
  };
}

// Only what differs from the page's defaults, in a stable order, so an
// untouched app keeps a clean URL and a shared link says exactly what the
// sender changed.
export function viewStateToParams(
  state: ViewState,
  defaults: ViewState = DEFAULT_VIEW_STATE,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== defaults.view) params.set("view", state.view);
  // Zoom and grouping are carried even from views that don't offer their
  // controls (the Board has no zoom picker). They're still live state — you set
  // them on the timeline, wandered off, and expect them back when you return.
  if (state.zoom !== defaults.zoom) params.set("zoom", state.zoom);
  if (state.groupBy !== defaults.groupBy) params.set("group", state.groupBy);
  const ids = teamIds(state.teams);
  if (ids.join(",") !== teamIds(defaults.teams).join(","))
    params.set("teams", ids.length ? ids.join(",") : TEAMS_NONE);
  if (state.owner !== defaults.owner) params.set("owner", state.owner);
  if (state.bet !== defaults.bet) params.set("bet", state.bet);
  if (state.showKilled !== defaults.showKilled)
    params.set("killed", state.showKilled ? "1" : "0");
  // Unconditional rather than compared against the defaults: no page opens with
  // a card already expanded, so "no item" is always the thing an absent param
  // should mean.
  if (state.detailId) params.set("item", state.detailId);
  return params;
}
