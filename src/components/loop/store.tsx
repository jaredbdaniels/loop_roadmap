"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GroupByKey, ViewKey, ZoomKey } from "@/lib/loop/constants";
import {
  migrateItems,
  normalizeBets,
  normalizeMilestones,
  normalizeOutlooks,
} from "@/lib/loop/logic";
import {
  parseViewState,
  resolveViewDefaults,
  viewStateToParams,
  type RawParams,
  type ViewState,
} from "@/lib/loop/view-state";
import { MAIN_SCENARIO } from "@/lib/loop/types";
import type {
  Bet,
  DeliveryOutlook,
  Item,
  LoopState,
  Milestone,
  Scenario,
  ScenarioKind,
  ScenarioMeta,
  Weights,
} from "@/lib/loop/types";

export interface ToastMsg {
  id: number;
  msg: string;
  warn: boolean;
}

// Optional seed for the Capture modal. When opened from the timeline we already
// know the team the click landed in and the date range it swept, so the new
// item can be created already scheduled instead of dumped in the tray.
export interface CapturePrefill {
  mission?: string;
  targetStart?: string;
  targetEnd?: string;
}

// A one-shot celebration overlay — an emoji streaks (or sinks, or pops) across
// the screen when something happens to a card. The `kind` picks both the visual
// and how long it lingers:
//   ship    — a card reached Learn: full confetti + a creature streak
//   advance — a forward stage move (or a checklist finished): creature streak
//   regress — a backward stage move: a muted emoji drifting down, no party
//   kill     — an idea killed: a somber emoji with a puff of smoke
// The positive kinds rotate through CREATURES so they stay fresh; the others
// draw from their own themed rosters.
export type CelebrationKind = "ship" | "advance" | "regress" | "kill";

export interface Celebration {
  id: number;
  kind: CelebrationKind;
  label: string;
  emoji: string;
}

// How often the app pulls fresh roadmap state while it's open and idle. Long
// enough to be cheap, short enough that a teammate's edit lands inside the
// conversation you're having about it.
const POLL_MS = 20_000;

// Coming back to the tab pulls immediately rather than waiting out the interval
// — but not if we synced moments ago, so flicking between two windows doesn't
// turn into a fetch per flick.
const REFOCUS_MIN_AGE_MS = 5_000;

const CREATURES = ["🦄", "🐉", "🚀", "🐋", "🦩", "🌈", "🦖", "🎈"];
// Themed rosters for the non-party kinds — a downbeat for regressions and a
// fittingly final send-off for kills.
const REGRESS_EMOJI = ["😵‍💫", "📉", "🫠", "💨"];
const KILL_EMOJI = ["🪦", "💀", "👋"];

// How long each kind stays on screen before it's cleared (ms). Matches the CSS
// animation durations in the celebration section of globals.css.
const CELEBRATION_DURATION: Record<CelebrationKind, number> = {
  ship: 2800,
  advance: 1600,
  regress: 1600,
  kill: 2000,
};

function emojiFor(kind: CelebrationKind, seq: number): string {
  const roster =
    kind === "regress"
      ? REGRESS_EMOJI
      : kind === "kill"
        ? KILL_EMOJI
        : CREATURES;
  return roster[(seq - 1) % roster.length];
}

// What the header's freshness chip reads off. The app has always polled in the
// background; the point of surfacing this is that a silent poll is
// indistinguishable from a broken one, so nobody trusted the numbers on screen
// without reloading — which is the very thing the poll exists to avoid.
export interface SyncStatus {
  // When the last successful pull landed. Null only before the first one, when
  // the server-rendered snapshot is what's on screen.
  lastSyncedAt: number | null;
  // A pull is in flight.
  syncing: boolean;
  // The last pull failed. Not toasted: a blip on a background poll isn't news,
  // and the chip goes to "Reconnecting" until one succeeds.
  failed: boolean;
  // Live updates are deliberately off — a scenario draft is in view (a pull
  // would clobber it) or something is being edited.
  paused: boolean;
}

interface LoopContextValue {
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  outlooks: DeliveryOutlook[];
  loading: boolean;
  sync: SyncStatus;
  // view state
  view: ViewKey;
  setView: (v: ViewKey) => void;
  zoom: ZoomKey;
  setZoom: (z: ZoomKey) => void;
  // Scope every view to a set of teams. Empty array = no scope (all teams);
  // one entry = the classic single-team drill-down; several = look at more
  // than one team at once (e.g. two Platform teams side by side).
  filterMission: string[];
  setFilterMission: (m: string[]) => void;
  // Scope every view to a single person owner ("all" = no scope, the
  // OWNER_UNASSIGNED sentinel = only unowned items). Mirrors filterMission and
  // is applied in the same central visibleItems().
  filterOwner: string;
  setFilterOwner: (o: string) => void;
  // Scope every view to a single bet ("all" = no scope). Mirrors
  // filterMission and is applied in the same central visibleItems().
  filterBet: string;
  setFilterBet: (id: string) => void;
  // Whether the timeline and Team views group rows by team or by bet.
  groupBy: GroupByKey;
  setGroupBy: (g: GroupByKey) => void;
  showKilled: boolean;
  setShowKilled: (b: boolean) => void;
  shareMode: boolean;
  toggleShareMode: () => void;
  // true on the public /share/<token> view: forces read-only and disables every
  // mutation, background polling, and the share-mode toggle.
  readOnly: boolean;
  // Scenarios — personal "what-if" drafts of the whole roadmap. `scenarioId` is
  // MAIN_SCENARIO ("main") for the live/shared roadmap, or a scenario id when
  // editing a draft; `draftMode` is the derived "we're in a scenario" flag. In
  // draft mode every mutation stays local + is persisted as one whole-state blob
  // (debounced) to the scenario, never touching the live roadmap.
  scenarios: ScenarioMeta[];
  scenarioId: string;
  scenarioName: string | null;
  draftMode: boolean;
  // Whether the scenario currently in view is a locked Headlights archive
  // (see ScenarioKind in types.ts). Every mutation checks this — not just the
  // UI — because a locked archive exists specifically to answer "what did we
  // believe in <month>," and an edit that silently failed to persist while
  // still showing in the UI would leave that question answered wrong until
  // the next reload.
  scenarioLocked: boolean;
  setScenario: (id: string) => Promise<void>;
  forkScenario: (name: string, kind?: ScenarioKind) => Promise<void>;
  discardScenario: (id: string) => Promise<void>;
  compareOpen: boolean;
  setCompareOpen: (b: boolean) => void;
  // modals
  detailId: string | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  captureOpen: boolean;
  setCaptureOpen: (b: boolean) => void;
  // Seed for the next Capture modal open (team + dates), or null for a blank
  // capture. Always set by openCapture, so it never goes stale.
  capturePrefill: CapturePrefill | null;
  openCapture: (prefill?: CapturePrefill) => void;
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  shareOpen: boolean;
  setShareOpen: (b: boolean) => void;
  // bet editor: null when closed, "new" to create, or an bet id
  betEdit: string | null;
  // Which field the editor should land on, when it was opened from a blank in
  // the bet detail's lede. Null for an ordinary open.
  betFocus: string | null;
  openBet: (idOrNew: string, focus?: string) => void;
  closeBet: () => void;
  // Where a bet's own page lives. Share-view readers are kept inside their
  // token's namespace — a bare /bets/<id> link would bounce an anonymous reader
  // to the login page, which is a dead end rather than a permission error.
  betHref: (id: string) => string | null;
  // milestone editor: null when closed, "new" to create, or a milestone id
  milestoneEdit: string | null;
  openMilestone: (idOrNew: string) => void;
  closeMilestone: () => void;
  // drag (board/horizon) — shared without re-render
  dragId: React.MutableRefObject<string | null>;
  // toasts
  toasts: ToastMsg[];
  toast: (msg: string, warn?: boolean) => void;
  // celebrations
  celebrations: Celebration[];
  celebrate: (opts?: { kind?: CelebrationKind; label?: string }) => void;
  // data actions
  createItem: (item: Item) => Promise<void>;
  updateItem: (item: Item) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  // Wipe every item-to-item dependency in one shot. Dependencies are meant only
  // for sequenced work, so this is the "start clean" reset.
  clearAllDependencies: () => Promise<void>;
  createBet: (init: Bet) => Promise<void>;
  updateBet: (init: Bet) => Promise<void>;
  removeBet: (id: string) => Promise<void>;
  createMilestone: (m: Milestone) => Promise<void>;
  updateMilestone: (m: Milestone) => Promise<void>;
  removeMilestone: (id: string) => Promise<void>;
  // Always an upsert — a DeliveryOutlook's id is the deterministic
  // `${mission}:${month}` key, so there's no separate create path.
  saveOutlook: (o: DeliveryOutlook) => Promise<void>;
  updateWeights: (w: Weights) => Promise<void>;
  importData: (payload: {
    items: Item[];
    weights?: Weights;
    bets?: Bet[];
    milestones?: Milestone[];
  }) => Promise<void>;
  syncAdo: () => Promise<void>;
  refresh: () => Promise<void>;
  // editing guard (pauses background polling)
  setEditing: (b: boolean) => void;
}

const LoopContext = createContext<LoopContextValue | null>(null);

export function useLoop(): LoopContextValue {
  const ctx = useContext(LoopContext);
  if (!ctx) throw new Error("useLoop must be used within LoopProvider");
  return ctx;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function LoopProvider({
  initialItems,
  initialWeights,
  initialBets,
  initialMilestones,
  initialOutlooks,
  readOnly = false,
  viewDefaults,
  viewParams,
  shareToken,
  children,
}: {
  initialItems: Item[];
  initialWeights: Weights;
  initialBets: Bet[];
  initialMilestones: Milestone[];
  initialOutlooks: DeliveryOutlook[];
  readOnly?: boolean;
  // Set only on the anonymous /share/<token> view, so links out of the app stay
  // inside the token's namespace.
  shareToken?: string;
  // Which view/grouping/filters the page opens on when its URL says nothing.
  // Defaults match the main app (Board, grouped by team); the seed preview
  // overrides them to open on the owner-grouped Timeline.
  viewDefaults?: Partial<ViewState>;
  // The page's query string. Anything it specifies beats viewDefaults, which is
  // how a reload lands you back where you were. Parsed here rather than on the
  // page so the server and the first client render agree.
  viewParams?: RawParams;
  children: ReactNode;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [bets, setBets] =
    useState<Bet[]>(initialBets);
  const [milestones, setMilestones] =
    useState<Milestone[]>(initialMilestones);
  const [outlooks, setOutlooks] = useState<DeliveryOutlook[]>(initialOutlooks);
  const [loading, setLoading] = useState(false);

  // Resolved once, on the first render, from the page's defaults and its query
  // string. `defaults` is kept because the URL writer only records what differs
  // from it — a page sitting on its own defaults deserves a clean URL.
  const [viewStateDefaults] = useState(() => resolveViewDefaults(viewDefaults));
  const [initialViewState] = useState(() =>
    parseViewState(viewParams ?? {}, viewStateDefaults),
  );

  const [view, setView] = useState<ViewKey>(initialViewState.view);
  const [zoom, setZoom] = useState<ZoomKey>(initialViewState.zoom);
  const [filterMission, setFilterMission] = useState<string[]>(
    initialViewState.teams,
  );
  const [filterOwner, setFilterOwner] = useState(initialViewState.owner);
  const [filterBet, setFilterBet] = useState(initialViewState.bet);
  const [groupBy, setGroupBy] = useState<GroupByKey>(initialViewState.groupBy);
  const [showKilled, setShowKilled] = useState(initialViewState.showKilled);
  // In read-only (share) mode share-mode is forced on and can't be toggled off.
  const [shareMode, setShareMode] = useState(readOnly);

  const [detailId, setDetailId] = useState<string | null>(
    initialViewState.detailId,
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturePrefill, setCapturePrefill] = useState<CapturePrefill | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [betEdit, setBetEdit] = useState<string | null>(null);
  const [betFocus, setBetFocus] = useState<string | null>(null);
  const [milestoneEdit, setMilestoneEdit] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenarioId, setScenarioId] = useState<string>(MAIN_SCENARIO);
  const [scenarioName, setScenarioName] = useState<string | null>(null);
  const [scenarioLocked, setScenarioLocked] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const draftMode = scenarioId !== MAIN_SCENARIO;

  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const dragId = useRef<string | null>(null);
  const editingRef = useRef(false);
  const setEditing = useCallback((b: boolean) => {
    editingRef.current = b;
  }, []);

  // Refs mirror the current scenario + full state so the mutation callbacks can
  // read them without being re-created (keeping their identities stable) and so
  // the debounced draft save always persists the latest state. Assigned every
  // render — cheap and always current.
  const scenarioIdRef = useRef(scenarioId);
  scenarioIdRef.current = scenarioId;
  const scenarioLockedRef = useRef(scenarioLocked);
  scenarioLockedRef.current = scenarioLocked;
  const stateRef = useRef<LoopState>({
    items,
    weights,
    bets,
    milestones,
    outlooks,
  });
  stateRef.current = { items, weights, bets, milestones, outlooks };
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastSeq = useRef(0);
  const toast = useCallback((msg: string, warn = false) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, warn }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // Every mutation calls this before touching local state — not just before
  // hitting the network. It covers both reasons a mutation must not proceed:
  // `readOnly` (a share-link viewer) and a locked Headlights archive, which
  // exists to answer "what did we believe in <month>" and which the server
  // already refuses to persist an edit to (see saveScenario/deleteScenario).
  // The reason this guard also exists on the client is that every mutation
  // below applies its change to local state optimistically, before it knows
  // whether the save will succeed. Without this, an edit to a read-only or
  // locked view would render as applied immediately and only quietly fail to
  // persist ~800ms later on the debounced draft save, leaving the screen
  // showing a change nothing ever actually kept — see
  // docs/launchpad-pivot.md Phase 3.
  const blocked = useCallback((): boolean => {
    if (readOnly) return true;
    if (!scenarioLockedRef.current) return false;
    toast(
      "This is a locked Headlights archive — switch to the live roadmap to make changes.",
      true,
    );
    return true;
  }, [readOnly, toast]);

  // Persist the active scenario's whole working state. No-op on the live
  // roadmap (which uses the granular per-entity endpoints instead).
  const saveDraftNow = useCallback(async () => {
    const id = scenarioIdRef.current;
    if (id === MAIN_SCENARIO) return;
    try {
      const res = await fetch(`/api/scenarios/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: stateRef.current }),
      });
      if (!res.ok) toast("Could not save draft changes.", true);
    } catch {
      toast("Could not save draft changes.", true);
    }
  }, [toast]);

  // Debounce whole-state saves so a burst of edits (dragging a lane, editing a
  // card) collapses into one write.
  const scheduleDraftSave = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      void saveDraftNow();
    }, 800);
  }, [saveDraftNow]);

  // Flush any pending debounced save immediately (used before switching away
  // from a scenario so nothing is lost).
  const flushDraftSave = useCallback(async () => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
      await saveDraftNow();
    }
  }, [saveDraftNow]);

  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const celebSeq = useRef(0);
  const celebrate = useCallback(
    (opts?: { kind?: CelebrationKind; label?: string }) => {
      const id = ++celebSeq.current;
      const kind = opts?.kind ?? "advance";
      const emoji = emojiFor(kind, id);
      setCelebrations((c) => [
        ...c,
        { id, kind, label: opts?.label ?? "", emoji },
      ]);
      // Clear once the kind's animation has run.
      setTimeout(
        () => setCelebrations((c) => c.filter((x) => x.id !== id)),
        CELEBRATION_DURATION[kind],
      );
    },
    [],
  );

  // Load the current user's scenarios once for the switcher. Skipped on the
  // anonymous share view (no session, and scenarios are private drafts anyway).
  useEffect(() => {
    if (readOnly) return;
    fetch("/api/scenarios")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.scenarios) setScenarios(d.scenarios as ScenarioMeta[]);
      })
      .catch(() => {});
  }, [readOnly]);

  // Reflect share mode on <body> so the original CSS (body.share-mode …) applies.
  useEffect(() => {
    document.body.classList.toggle("share-mode", shareMode);
    return () => document.body.classList.remove("share-mode");
  }, [shareMode]);

  // If the bet we're filtered to disappears — deleted here or by a
  // teammate (picked up on the next poll) — fall back to "all". Otherwise the
  // filter would silently hide every item, and the filter dropdown itself hides
  // once no bets remain, leaving no way to recover without a reload.
  useEffect(() => {
    if (
      filterBet !== "all" &&
      !bets.some((i) => i.id === filterBet)
    )
      setFilterBet("all");
  }, [bets, filterBet]);

  const refresh = useCallback(async () => {
    // The share view has no session; /api/items would 401. It's an SSR
    // snapshot — viewers reload for freshness.
    if (readOnly) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/items", { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/items ${res.status}`);
      const data = (await res.json()) as {
        items: Item[];
        weights: Weights;
        bets?: Bet[];
        milestones?: Milestone[];
        outlooks?: DeliveryOutlook[];
      };
      setItems(migrateItems(data.items));
      setWeights(data.weights);
      if (data.bets) setBets(normalizeBets(data.bets));
      if (data.milestones) setMilestones(normalizeMilestones(data.milestones));
      if (data.outlooks) setOutlooks(normalizeOutlooks(data.outlooks));
      setLastSyncedAt(Date.now());
      setSyncFailed(false);
    } catch {
      // Deliberately quiet — see SyncStatus.failed. A dropped poll on a train
      // is not worth a toast, and the header says so until one lands.
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  }, [readOnly]);

  // The server-rendered snapshot was current when the page was built, so the
  // freshness clock starts at load rather than at the first poll.
  useEffect(() => {
    if (!readOnly) setLastSyncedAt(Date.now());
  }, [readOnly]);

  // Everything that should hold the poll off, mirrored into a ref: read from
  // inside the interval instead of listed as a dependency, so opening a modal
  // no longer tears the interval down and restarts its 20-second clock.
  //   • a modal is open — a pull under an open editor would swap the record out
  //     from under whoever is reading or typing in it
  //   • a scenario draft is in view — a pull would clobber the draft state,
  //     which lives only in memory until it's debounced to the server
  const pollPausedRef = useRef(false);
  pollPausedRef.current =
    detailId !== null ||
    captureOpen ||
    settingsOpen ||
    betEdit !== null ||
    milestoneEdit !== null ||
    draftMode;

  const lastSyncedAtRef = useRef(lastSyncedAt);
  lastSyncedAtRef.current = lastSyncedAt;

  // Background poll so teammates' edits show up without anyone reloading.
  // Skipped entirely in read-only mode (no session to poll with).
  useEffect(() => {
    if (readOnly) return;
    const idle = () =>
      !pollPausedRef.current && !editingRef.current && !dragId.current;

    const interval = setInterval(() => {
      // A hidden tab doesn't need fresh data — nobody is reading it, and
      // browsers throttle its timers anyway, so polling it mostly produces
      // bursts of stale-then-current on return. The visibility handler below
      // covers the return instead.
      if (document.hidden || !idle()) return;
      void refresh();
    }, POLL_MS);

    // Coming back to the tab (or the window) is the moment freshness matters
    // most: you left, something happened, and the first thing you do is read
    // the screen. Pull straight away rather than making that read a coin flip
    // on where in the interval you landed.
    const onReturn = () => {
      if (document.hidden || !idle()) return;
      const last = lastSyncedAtRef.current;
      if (last !== null && Date.now() - last < REFOCUS_MIN_AGE_MS) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [refresh, readOnly]);

  // Mirror the view state into the query string, so a reload lands you back
  // where you were and a pasted URL puts a teammate in the same place.
  // replaceState rather than a router navigation: this isn't a new page, and
  // pushing a history entry per filter toggle would bury the Back button under
  // dozens of them. It also clears the one-shot ?edit= a bet page's Edit button
  // arrives with — that param is an instruction, carried out before this runs,
  // not state worth restoring on the next reload.
  useEffect(() => {
    const params = viewStateToParams(
      {
        view,
        zoom,
        groupBy,
        teams: filterMission,
        owner: filterOwner,
        bet: filterBet,
        showKilled,
        detailId,
      },
      viewStateDefaults,
    );
    const qs = params.toString();
    const { pathname, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${qs ? `?${qs}` : ""}${hash}`,
    );
  }, [
    view,
    zoom,
    groupBy,
    filterMission,
    filterOwner,
    filterBet,
    showKilled,
    detailId,
    viewStateDefaults,
  ]);

  // If the card we have open stops existing — deleted here, deleted by a
  // teammate and noticed on the next poll, or named by a stale ?item= someone
  // pasted — close the detail modal. Leaving the id set would pause the poll
  // indefinitely on a modal that renders nothing.
  useEffect(() => {
    if (detailId && !items.some((i) => i.id === detailId)) setDetailId(null);
  }, [items, detailId]);

  const createItem = useCallback(
    async (item: Item) => {
      if (blocked()) return;
      setItems((prev) => [...prev, item]);
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) toast("Could not save the new item.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const updateItem = useCallback(
    async (item: Item) => {
      if (blocked()) return;
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) toast("Could not save changes.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (blocked()) return;
      // Deleting an item can leave other items pointing at it via
      // `dependsOn` — prune those references locally too, or a later edit
      // to one of them would resend the dangling id and undo the server-side
      // cleanup in deleteItem().
      setItems((prev) =>
        prev
          .filter((i) => i.id !== id)
          .map((i) =>
            (i.dependsOn || []).includes(id)
              ? { ...i, dependsOn: i.dependsOn.filter((d) => d !== id) }
              : i,
          ),
      );
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) toast("Could not delete the item.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const clearAllDependencies = useCallback(async () => {
    if (blocked()) return;
    const affected = items.filter((i) => (i.dependsOn || []).length > 0);
    if (affected.length === 0) {
      toast("No dependencies to clear.");
      return;
    }
    const stamp = nowISO();
    const cleared = affected.map((i) => ({
      ...i,
      dependsOn: [],
      updatedAt: stamp,
      activity: [...(i.activity || []), "Dependencies cleared."],
    }));
    // Optimistic: drop them from local state, then persist each in parallel.
    const byId = new Map(cleared.map((c) => [c.id, c]));
    setItems((prev) => prev.map((i) => byId.get(i.id) || i));
    if (scenarioIdRef.current !== MAIN_SCENARIO) {
      scheduleDraftSave();
      toast(`Cleared dependencies on ${cleared.length} item(s).`);
      return;
    }
    const results = await Promise.all(
      cleared.map((i) =>
        fetch(`/api/items/${i.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(i),
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    const failed = results.filter((ok) => !ok).length;
    if (failed)
      toast(`Could not clear dependencies on ${failed} item(s).`, true);
    else toast(`Cleared dependencies on ${cleared.length} item(s).`);
  }, [blocked, items, toast, scheduleDraftSave]);

  const createBet = useCallback(
    async (init: Bet) => {
      if (blocked()) return;
      setBets((prev) => [...prev, init]);
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch("/api/initiatives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(init),
      });
      if (!res.ok) toast("Could not save the bet.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const updateBet = useCallback(
    async (init: Bet) => {
      if (blocked()) return;
      setBets((prev) =>
        prev.map((i) => (i.id === init.id ? init : i)),
      );
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/initiatives/${init.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(init),
      });
      if (!res.ok) toast("Could not save changes.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const removeBet = useCallback(
    async (id: string) => {
      if (blocked()) return;
      setBets((prev) => prev.filter((i) => i.id !== id));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/initiatives/${id}`, { method: "DELETE" });
      if (!res.ok) toast("Could not delete the bet.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const createMilestone = useCallback(
    async (m: Milestone) => {
      if (blocked()) return;
      setMilestones((prev) => [...prev, m]);
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(m),
      });
      if (!res.ok) toast("Could not save the milestone.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const updateMilestone = useCallback(
    async (m: Milestone) => {
      if (blocked()) return;
      setMilestones((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/milestones/${m.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(m),
      });
      if (!res.ok) toast("Could not save changes.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const removeMilestone = useCallback(
    async (id: string) => {
      if (blocked()) return;
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) toast("Could not delete the milestone.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const saveOutlook = useCallback(
    async (outlook: DeliveryOutlook) => {
      if (blocked()) return;
      setOutlooks((prev) => {
        const exists = prev.some((o) => o.id === outlook.id);
        return exists
          ? prev.map((o) => (o.id === outlook.id ? outlook : o))
          : [...prev, outlook];
      });
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch("/api/outlooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(outlook),
      });
      if (!res.ok) toast("Could not save the outlook.", true);
    },
    [blocked, toast, scheduleDraftSave],
  );

  const updateWeights = useCallback(
    async (w: Weights) => {
      if (blocked()) return;
      setWeights(w);
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weights: w }),
      });
    },
    [blocked, scheduleDraftSave],
  );

  const importData = useCallback(
    async (payload: {
      items: Item[];
      weights?: Weights;
      bets?: Bet[];
      milestones?: Milestone[];
    }) => {
      if (readOnly) return;
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        toast("Switch to the live roadmap to import.", true);
        return;
      }
      setLoading(true);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setLoading(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast("Could not import: " + (err.error || res.statusText), true);
        return;
      }
      await refresh();
      toast("Imported " + payload.items.length + " items.");
    },
    [readOnly, refresh, toast],
  );

  const syncAdo = useCallback(async () => {
    if (readOnly) return;
    if (scenarioIdRef.current !== MAIN_SCENARIO) {
      toast("Switch to the live roadmap to sync ADO.", true);
      return;
    }
    setLoading(true);
    let res: Response;
    try {
      res = await fetch("/api/sync/ado", { method: "POST" });
    } catch {
      setLoading(false);
      toast("ADO sync failed: could not reach the server.", true);
      return;
    }
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast("ADO sync failed: " + (err.error || res.statusText), true);
      return;
    }
    const { summary } = (await res.json()) as {
      summary: {
        checked: number;
        updated: unknown[];
        unchanged: number;
        notFound: unknown[];
        malformed: unknown[];
        flags: unknown[];
        completed: unknown[];
      };
    };
    await refresh();
    if (summary.checked === 0) {
      toast("Nothing linked to ADO yet — add a work-item link to an item or sub-item to sync.");
      return;
    }
    const parts = [`${summary.updated.length} updated`, `${summary.unchanged} unchanged`];
    if (summary.completed.length) parts.push(`${summary.completed.length} completed`);
    const issues =
      summary.notFound.length + summary.malformed.length + summary.flags.length;
    if (issues) parts.push(`${issues} flagged`);
    toast(`ADO sync: ${parts.join(", ")} (of ${summary.checked} linked).`, issues > 0);
  }, [readOnly, refresh, toast]);

  // Switch the active roadmap: MAIN_SCENARIO reloads the live roadmap; any other
  // id loads that scenario's working state into view. The scenario we're leaving
  // is flushed first so no debounced edit is lost.
  const setScenario = useCallback(
    async (id: string) => {
      if (readOnly) return;
      await flushDraftSave();
      if (id === MAIN_SCENARIO) {
        setScenarioId(MAIN_SCENARIO);
        setScenarioName(null);
        setScenarioLocked(false);
        await refresh();
        return;
      }
      try {
        const res = await fetch(`/api/scenarios/${id}`);
        if (!res.ok) throw new Error();
        const { scenario } = (await res.json()) as { scenario: Scenario };
        setItems(migrateItems(scenario.state.items));
        setWeights(scenario.state.weights);
        setBets(normalizeBets(scenario.state.bets));
        setMilestones(normalizeMilestones(scenario.state.milestones));
        setOutlooks(normalizeOutlooks(scenario.state.outlooks));
        setScenarioId(scenario.id);
        setScenarioName(scenario.name);
        setScenarioLocked(scenario.locked);
      } catch {
        toast("Could not open that scenario.", true);
      }
    },
    [readOnly, refresh, flushDraftSave, toast],
  );

  // Fork the live roadmap into a new named scenario and switch into it.
  // `kind` defaults to "whatif" (an editable draft); "headlights-archive"
  // locks the fork at creation — see ScenarioKind in types.ts and
  // HeadlightsView's "Submit for Headlights" action.
  const forkScenario = useCallback(
    async (name: string, kind: ScenarioKind = "whatif") => {
      if (readOnly) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      await flushDraftSave();
      try {
        const res = await fetch("/api/scenarios", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed, kind }),
        });
        if (!res.ok) throw new Error();
        const { scenario } = (await res.json()) as { scenario: Scenario };
        setScenarios((prev) => [
          {
            id: scenario.id,
            name: scenario.name,
            createdBy: scenario.createdBy,
            kind: scenario.kind,
            locked: scenario.locked,
            forkedAt: scenario.forkedAt,
            createdAt: scenario.createdAt,
            updatedAt: scenario.updatedAt,
          },
          ...prev,
        ]);
        setItems(migrateItems(scenario.state.items));
        setWeights(scenario.state.weights);
        setBets(normalizeBets(scenario.state.bets));
        setMilestones(normalizeMilestones(scenario.state.milestones));
        setOutlooks(normalizeOutlooks(scenario.state.outlooks));
        setScenarioId(scenario.id);
        setScenarioName(scenario.name);
        setScenarioLocked(scenario.locked);
        toast(
          kind === "headlights-archive"
            ? `"${trimmed}" archived and locked — changes here won't affect the live roadmap.`
            : `Draft "${trimmed}" created — changes here won't affect the live roadmap.`,
        );
      } catch {
        toast("Could not create the scenario.", true);
      }
    },
    [readOnly, flushDraftSave, toast],
  );

  // Discard a draft. If it's the one in view, drop back to the live roadmap.
  const discardScenario = useCallback(
    async (id: string) => {
      if (readOnly) return;
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      try {
        const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Could not discard the scenario.");
        }
        setScenarios((prev) => prev.filter((s) => s.id !== id));
        if (scenarioIdRef.current === id) {
          setScenarioId(MAIN_SCENARIO);
          setScenarioName(null);
          setScenarioLocked(false);
          await refresh();
        }
        toast("Draft discarded.");
      } catch (e) {
        toast((e as Error).message || "Could not discard the scenario.", true);
      }
    },
    [readOnly, refresh, toast],
  );

  const openCapture = useCallback((prefill?: CapturePrefill) => {
    setCapturePrefill(prefill ?? null);
    setCaptureOpen(true);
  }, []);

  const openDetail = useCallback((id: string) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const openBet = useCallback((idOrNew: string, focus?: string) => {
    setBetFocus(focus ?? null);
    setBetEdit(idOrNew);
  }, []);
  const closeBet = useCallback(() => {
    setBetEdit(null);
    setBetFocus(null);
  }, []);
  // Null where no bet page can honestly be reached. /preview renders the
  // committed seed and never touches the database, so linking it to /bets/<id>
  // — which reads the live DB — would 404 on a bet the seed has and the DB
  // doesn't, or worse, show live content under a page that promises the seed.
  // That is the read-only-without-a-token case, and it is only /preview.
  const betHref = useCallback(
    (id: string): string | null => {
      if (shareToken) return `/share/${shareToken}/bets/${id}`;
      return readOnly ? null : `/bets/${id}`;
    },
    [shareToken, readOnly],
  );
  const openMilestone = useCallback(
    (idOrNew: string) => setMilestoneEdit(idOrNew),
    [],
  );
  const closeMilestone = useCallback(() => setMilestoneEdit(null), []);
  const toggleShareMode = useCallback(() => {
    // Locked on in the public share view — there's nothing to toggle back to.
    if (readOnly) return;
    setShareMode((s) => {
      const next = !s;
      toast(
        next
          ? "Share mode on: edit controls hidden."
          : "Share mode off.",
      );
      return next;
    });
  }, [readOnly, toast]);

  const value: LoopContextValue = {
    items,
    weights,
    bets,
    milestones,
    outlooks,
    loading,
    sync: {
      lastSyncedAt,
      syncing,
      failed: syncFailed,
      // Editing pauses the poll too, but that's a keystroke-scale pause nobody
      // needs told about; a draft is a mode you're in until you leave it.
      paused: draftMode,
    },
    view,
    setView,
    zoom,
    setZoom,
    filterMission,
    setFilterMission,
    filterOwner,
    setFilterOwner,
    filterBet,
    setFilterBet,
    groupBy,
    setGroupBy,
    showKilled,
    setShowKilled,
    shareMode,
    toggleShareMode,
    readOnly,
    scenarios,
    scenarioId,
    scenarioName,
    draftMode,
    scenarioLocked,
    setScenario,
    forkScenario,
    discardScenario,
    compareOpen,
    setCompareOpen,
    detailId,
    openDetail,
    closeDetail,
    captureOpen,
    setCaptureOpen,
    capturePrefill,
    openCapture,
    settingsOpen,
    setSettingsOpen,
    shareOpen,
    setShareOpen,
    betEdit,
    betFocus,
    openBet,
    closeBet,
    betHref,
    milestoneEdit,
    openMilestone,
    closeMilestone,
    dragId,
    toasts,
    toast,
    celebrations,
    celebrate,
    createItem,
    updateItem,
    removeItem,
    clearAllDependencies,
    createBet,
    updateBet,
    removeBet,
    createMilestone,
    updateMilestone,
    removeMilestone,
    saveOutlook,
    updateWeights,
    importData,
    syncAdo,
    refresh,
    setEditing,
  };

  return <LoopContext.Provider value={value}>{children}</LoopContext.Provider>;
}
