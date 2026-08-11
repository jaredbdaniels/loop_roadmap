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
} from "@/lib/loop/logic";
import { MAIN_SCENARIO } from "@/lib/loop/types";
import type {
  Bet,
  Item,
  LoopState,
  Milestone,
  Scenario,
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

interface LoopContextValue {
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  loading: boolean;
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
  setScenario: (id: string) => Promise<void>;
  forkScenario: (name: string) => Promise<void>;
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
  openBet: (idOrNew: string) => void;
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
  readOnly = false,
  initialView = "board",
  initialGroupBy = "team",
  shareToken,
  children,
}: {
  initialItems: Item[];
  initialWeights: Weights;
  initialBets: Bet[];
  initialMilestones: Milestone[];
  readOnly?: boolean;
  // Set only on the anonymous /share/<token> view, so links out of the app stay
  // inside the token's namespace.
  shareToken?: string;
  // Which view/grouping the app opens on. Defaults match the main app (Board,
  // grouped by team); the seed preview overrides these to open on the
  // owner-grouped Timeline (Timeline + Domain).
  initialView?: ViewKey;
  initialGroupBy?: GroupByKey;
  children: ReactNode;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const [bets, setBets] =
    useState<Bet[]>(initialBets);
  const [milestones, setMilestones] =
    useState<Milestone[]>(initialMilestones);
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState<ViewKey>(initialView);
  const [zoom, setZoom] = useState<ZoomKey>("quarter");
  const [filterMission, setFilterMission] = useState<string[]>([]);
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterBet, setFilterBet] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupByKey>(initialGroupBy);
  const [showKilled, setShowKilled] = useState(false);
  // In read-only (share) mode share-mode is forced on and can't be toggled off.
  const [shareMode, setShareMode] = useState(readOnly);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturePrefill, setCapturePrefill] = useState<CapturePrefill | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [betEdit, setBetEdit] = useState<string | null>(null);
  const [milestoneEdit, setMilestoneEdit] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenarioId, setScenarioId] = useState<string>(MAIN_SCENARIO);
  const [scenarioName, setScenarioName] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const draftMode = scenarioId !== MAIN_SCENARIO;

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
  const stateRef = useRef<LoopState>({ items, weights, bets, milestones });
  stateRef.current = { items, weights, bets, milestones };
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastSeq = useRef(0);
  const toast = useCallback((msg: string, warn = false) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, msg, warn }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

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
    const res = await fetch("/api/items", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      items: Item[];
      weights: Weights;
      bets?: Bet[];
      milestones?: Milestone[];
    };
    setItems(migrateItems(data.items));
    setWeights(data.weights);
    if (data.bets) setBets(normalizeBets(data.bets));
    if (data.milestones) setMilestones(normalizeMilestones(data.milestones));
  }, [readOnly]);

  // Background poll so teammates' edits show up. Paused while editing/dragging.
  // Skipped entirely in read-only mode (no session to poll with).
  useEffect(() => {
    if (readOnly) return;
    const interval = setInterval(() => {
      if (editingRef.current || dragId.current) return;
      if (detailId || captureOpen || settingsOpen || betEdit || milestoneEdit)
        return;
      // Never poll while editing a scenario draft — a live pull would clobber
      // the draft state held in view.
      if (scenarioIdRef.current !== MAIN_SCENARIO) return;
      refresh();
    }, 20000);
    return () => clearInterval(interval);
  }, [
    refresh,
    readOnly,
    detailId,
    captureOpen,
    settingsOpen,
    betEdit,
    milestoneEdit,
  ]);

  const createItem = useCallback(
    async (item: Item) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const updateItem = useCallback(
    async (item: Item) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const clearAllDependencies = useCallback(async () => {
    if (readOnly) return;
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
  }, [readOnly, items, toast, scheduleDraftSave]);

  const createBet = useCallback(
    async (init: Bet) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const updateBet = useCallback(
    async (init: Bet) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const removeBet = useCallback(
    async (id: string) => {
      if (readOnly) return;
      setBets((prev) => prev.filter((i) => i.id !== id));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/initiatives/${id}`, { method: "DELETE" });
      if (!res.ok) toast("Could not delete the bet.", true);
    },
    [readOnly, toast, scheduleDraftSave],
  );

  const createMilestone = useCallback(
    async (m: Milestone) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const updateMilestone = useCallback(
    async (m: Milestone) => {
      if (readOnly) return;
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
    [readOnly, toast, scheduleDraftSave],
  );

  const removeMilestone = useCallback(
    async (id: string) => {
      if (readOnly) return;
      setMilestones((prev) => prev.filter((m) => m.id !== id));
      if (scenarioIdRef.current !== MAIN_SCENARIO) {
        scheduleDraftSave();
        return;
      }
      const res = await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      if (!res.ok) toast("Could not delete the milestone.", true);
    },
    [readOnly, toast, scheduleDraftSave],
  );

  const updateWeights = useCallback(
    async (w: Weights) => {
      if (readOnly) return;
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
    [readOnly, scheduleDraftSave],
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
        setScenarioId(scenario.id);
        setScenarioName(scenario.name);
      } catch {
        toast("Could not open that scenario.", true);
      }
    },
    [readOnly, refresh, flushDraftSave, toast],
  );

  // Fork the live roadmap into a new named draft and switch into it.
  const forkScenario = useCallback(
    async (name: string) => {
      if (readOnly) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      await flushDraftSave();
      try {
        const res = await fetch("/api/scenarios", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) throw new Error();
        const { scenario } = (await res.json()) as { scenario: Scenario };
        setScenarios((prev) => [
          {
            id: scenario.id,
            name: scenario.name,
            createdBy: scenario.createdBy,
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
        setScenarioId(scenario.id);
        setScenarioName(scenario.name);
        toast(
          `Draft "${trimmed}" created — changes here won't affect the live roadmap.`,
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
        if (!res.ok) throw new Error();
        setScenarios((prev) => prev.filter((s) => s.id !== id));
        if (scenarioIdRef.current === id) {
          setScenarioId(MAIN_SCENARIO);
          setScenarioName(null);
          await refresh();
        }
        toast("Draft discarded.");
      } catch {
        toast("Could not discard the scenario.", true);
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
  const openBet = useCallback(
    (idOrNew: string) => setBetEdit(idOrNew),
    [],
  );
  const closeBet = useCallback(() => setBetEdit(null), []);
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
    loading,
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
    updateWeights,
    importData,
    syncAdo,
    refresh,
    setEditing,
  };

  return <LoopContext.Provider value={value}>{children}</LoopContext.Provider>;
}
