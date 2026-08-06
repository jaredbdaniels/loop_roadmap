"use client";

import { useRef, useState } from "react";
import {
  Columns3,
  Users,
  GanttChartSquare,
  Layers,
  Flag,
  Plus,
  MoreHorizontal,
  Download,
  ImageDown,
  Upload,
  RefreshCw,
  SlidersHorizontal,
  Eye,
  Share2,
  GitBranch,
  GitCompare,
  Trash2,
} from "lucide-react";
import { toPng } from "html-to-image";
import type { GroupByKey, ViewKey, ZoomKey } from "@/lib/loop/constants";
import { OWNERS, OWNER_UNASSIGNED } from "@/lib/loop/constants";
import type { Bet, Item, Milestone, Weights } from "@/lib/loop/types";
import { authClient } from "@/lib/auth-client";
import { LoopProvider, useLoop } from "./store";
import { StatsBar } from "./StatsBar";
import { TeamFilter } from "./TeamFilter";
import { BoardView } from "./BoardView";
import { TeamView } from "./TeamView";
import { TimelineView } from "./TimelineView";
import { HorizonView } from "./HorizonView";
import { DetailModal } from "./DetailModal";
import { CaptureModal } from "./CaptureModal";
import { BetModal } from "./BetModal";
import { MilestoneModal } from "./MilestoneModal";
import { SettingsModal } from "./SettingsModal";
import { ShareModal } from "./ShareModal";
import { CompareDrawer } from "./CompareDrawer";
import { Toasts } from "./Toasts";
import { Celebration } from "./Celebration";

const MAIN_SCENARIO = "main";
const NEW_SCENARIO = "__new__";

const VIEWS: { key: ViewKey; label: string; icon: typeof Columns3 }[] = [
  { key: "board", label: "Board", icon: Columns3 },
  { key: "timeline", label: "Timeline", icon: GanttChartSquare },
  { key: "horizon", label: "Horizon", icon: Layers },
  { key: "mission", label: "Team", icon: Users },
];

// Display labels only — the ZoomKey union is persisted state, so "quarter"
// stays the key while reading as "Season" now that the timeline header names
// quarters by season (Fall / Winter / Spring / Summer). See logic.ts.
const ZOOMS: { key: ZoomKey; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Season" },
  { key: "year", label: "Year" },
];

const GROUP_BYS: { key: GroupByKey; label: string }[] = [
  { key: "team", label: "Team" },
  { key: "domain", label: "Domain" },
  { key: "bet", label: "Bet" },
];

export function LoopApp({
  initialItems,
  initialWeights,
  initialBets,
  initialMilestones,
  userEmail,
  readOnly = false,
  initialView,
  initialGroupBy,
}: {
  initialItems: Item[];
  initialWeights: Weights;
  initialBets: Bet[];
  initialMilestones: Milestone[];
  // null on the anonymous /share/<token> view.
  userEmail: string | null;
  readOnly?: boolean;
  // Optional initial view/grouping (e.g. the seed preview opens on Timeline +
  // Domain). Omitted everywhere else, falling back to the store defaults.
  initialView?: ViewKey;
  initialGroupBy?: GroupByKey;
}) {
  return (
    <LoopProvider
      initialItems={initialItems}
      initialWeights={initialWeights}
      initialBets={initialBets}
      initialMilestones={initialMilestones}
      readOnly={readOnly}
      initialView={initialView}
      initialGroupBy={initialGroupBy}
    >
      <Shell userEmail={userEmail} />
    </LoopProvider>
  );
}

function Shell({ userEmail }: { userEmail: string | null }) {
  const {
    items,
    weights,
    bets,
    milestones,
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
    readOnly,
    scenarios,
    scenarioId,
    scenarioName,
    draftMode,
    setScenario,
    forkScenario,
    discardScenario,
    setCompareOpen,
    setShareOpen,
    openCapture,
    setSettingsOpen,
    openBet,
    openMilestone,
    importData,
    syncAdo,
    toast,
  } = useLoop();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const exportData = () => {
    const payload = {
      items,
      weights,
      bets,
      milestones,
      exportedAt: new Date().toISOString(),
      schema: "loop-v2",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loop-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported loop-data.json. This is the same file agents can read.");
  };

  const exportImage = async () => {
    const el = viewRef.current;
    if (!el) return;
    const filename = `loop-${view}-${new Date().toISOString().slice(0, 10)}.png`;
    // main is transparent — the canvas background lives on <body>.
    const bg = getComputedStyle(document.body).backgroundColor;
    document.body.classList.add("exporting");
    try {
      // Wait for General Sans (self-hosted via @font-face) so the first
      // capture doesn't fall back to a system font.
      await document.fonts?.ready;
      // pixelRatio doubles each dimension (4x area) on top of the full,
      // un-clipped scroll size. Drop to 1x for large views (e.g. a year-zoom
      // timeline) so we stay under the browser's canvas cap, which would
      // otherwise make toPng resolve with a blank image.
      const area = el.scrollWidth * el.scrollHeight;
      const dataUrl = await toPng(el, {
        pixelRatio: area > 4_000_000 ? 1 : 2,
        backgroundColor: bg,
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { overflow: "visible" },
      });
      if (!dataUrl || dataUrl === "data:,") {
        throw new Error("the view was too large to render");
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
      toast(`Exported ${filename}.`);
    } catch (e) {
      toast("Could not export the view: " + (e as Error).message, true);
    } finally {
      document.body.classList.remove("exporting");
    }
  };

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.items || !Array.isArray(parsed.items))
          throw new Error("Missing items array");
        importData({
          items: parsed.items,
          weights: parsed.weights,
          bets: parsed.bets,
          milestones: parsed.milestones,
        });
      } catch (e) {
        toast("Could not import that file: " + (e as Error).message, true);
      }
    };
    reader.readAsText(file);
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  const runMenu = (fn: () => void) => {
    setMenuOpen(false);
    fn();
  };

  const onScenarioChange = (value: string) => {
    if (value === NEW_SCENARIO) {
      const name = window.prompt(
        'Name this draft scenario (e.g. "Q3 reshuffle"):',
      );
      if (name && name.trim()) forkScenario(name.trim());
      return;
    }
    setScenario(value);
  };

  const confirmDiscard = () => {
    if (
      window.confirm(
        `Discard draft "${scenarioName}"? This can't be undone. The live roadmap is not affected.`,
      )
    )
      discardScenario(scenarioId);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cm-icon.svg" alt="" />
          </span>
          <div>
            <h1>
              Product Launchpad{" "}
              <span className="sub">Closing product loops faster</span>
            </h1>
          </div>
        </div>
        <div className="topbar-right">
          <span className="badge-sharemode">
            <Eye size={13} strokeWidth={2.4} /> Read-only share
          </span>
          {!readOnly && userEmail && (
            <>
              <span className="user-chip">
                <span className="user-avatar" aria-hidden>
                  {userEmail.charAt(0).toUpperCase()}
                </span>
                <span className="user-email">{userEmail}</span>
              </span>
              <button className="link-button" onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {draftMode && (
        <div className="draft-banner">
          <span className="draft-banner-label">
            <GitBranch size={14} strokeWidth={2.4} />
            Draft: <strong>{scenarioName}</strong>
            <span className="draft-banner-note">
              changes here don’t affect the live roadmap
            </span>
          </span>
          <div className="draft-banner-actions">
            <button
              className="cm-button--outlined cm-button"
              onClick={() => setCompareOpen(true)}
            >
              <GitCompare size={15} strokeWidth={2.2} />
              Compare to live
            </button>
            <button className="link-button" onClick={confirmDiscard}>
              <Trash2 size={14} strokeWidth={2.2} />
              Discard
            </button>
          </div>
        </div>
      )}

      <StatsBar />

      <section className="controls">
        {!readOnly && (
          <select
            className={`cm-select${draftMode ? " cm-select--draft" : ""}`}
            aria-label="Scenario"
            value={scenarioId}
            onChange={(e) => onScenarioChange(e.target.value)}
            title="Switch between the live roadmap and your what-if drafts"
          >
            <option value={MAIN_SCENARIO}>Live roadmap</option>
            {scenarios.length > 0 && (
              <optgroup label="My drafts">
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={NEW_SCENARIO}>＋ New scenario…</option>
          </select>
        )}

        <TeamFilter value={filterMission} onChange={setFilterMission} />

        <select
          className="cm-select"
          aria-label="Filter by owner"
          value={filterOwner}
          onChange={(e) => setFilterOwner(e.target.value)}
        >
          <option value="all">All owners</option>
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={OWNER_UNASSIGNED}>Unassigned</option>
        </select>

        {bets.length > 0 && (
          <select
            className="cm-select"
            aria-label="Filter by bet"
            value={filterBet}
            onChange={(e) => setFilterBet(e.target.value)}
          >
            <option value="all">All bets</option>
            {bets.map((init) => (
              <option key={init.id} value={init.id}>
                {init.title}
              </option>
            ))}
          </select>
        )}

        <label className="killed-toggle">
          <input
            type="checkbox"
            checked={showKilled}
            onChange={(e) => setShowKilled(e.target.checked)}
          />
          Show killed
        </label>

        <div className="divider" />

        <div className="segmented" role="tablist" aria-label="View">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                role="tab"
                aria-selected={view === v.key}
                className={view === v.key ? "active" : ""}
                onClick={() => setView(v.key)}
              >
                <Icon size={15} strokeWidth={2.2} />
                {v.label}
              </button>
            );
          })}
        </div>

        {(view === "timeline" || view === "mission") && (
          <div className="segmented" role="tablist" aria-label="Group by">
            {GROUP_BYS.map((g) => (
              <button
                key={g.key}
                role="tab"
                aria-selected={groupBy === g.key}
                className={groupBy === g.key ? "active" : ""}
                onClick={() => setGroupBy(g.key)}
                title={`Group by ${g.label.toLowerCase()}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {view === "timeline" && (
          <div className="segmented" role="tablist" aria-label="Timeline zoom">
            {ZOOMS.map((z) => (
              <button
                key={z.key}
                role="tab"
                aria-selected={zoom === z.key}
                className={zoom === z.key ? "active" : ""}
                onClick={() => setZoom(z.key)}
              >
                {z.label}
              </button>
            ))}
          </div>
        )}

        <div className="spacer" />

        {!readOnly && !draftMode && (
          <button
            className="cm-button--outlined cm-button"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={15} strokeWidth={2.2} />
            Share
          </button>
        )}

        {view === "timeline" && (
          <button
            className="cm-button--outlined cm-button edit-only"
            onClick={() => openBet("new")}
          >
            <Layers size={15} strokeWidth={2.2} />
            New bet
          </button>
        )}

        {view === "timeline" && (
          <button
            className="cm-button--outlined cm-button edit-only"
            onClick={() => openMilestone("new")}
          >
            <Flag size={15} strokeWidth={2.2} />
            New milestone
          </button>
        )}

        <button
          className="cm-button edit-only"
          onClick={() => openCapture()}
        >
          <Plus size={16} strokeWidth={2.6} />
          Capture idea
        </button>

        <div className="menu-wrap">
          <button
            className="icon-button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal size={18} strokeWidth={2.2} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu-pop" role="menu">
                <div className="menu-label">Data</div>
                <button className="menu-item" onClick={() => runMenu(exportData)}>
                  <Download size={16} strokeWidth={2} />
                  Export JSON
                </button>
                <button
                  className="menu-item"
                  onClick={() => runMenu(exportImage)}
                >
                  <ImageDown size={16} strokeWidth={2} />
                  Export view as image
                </button>
                {!draftMode && (
                  <button
                    className="menu-item edit-only"
                    onClick={() => runMenu(() => fileRef.current?.click())}
                  >
                    <Upload size={16} strokeWidth={2} />
                    Import JSON
                  </button>
                )}
                {!draftMode && (
                  <button
                    className="menu-item edit-only"
                    onClick={() => runMenu(syncAdo)}
                  >
                    <RefreshCw size={16} strokeWidth={2} />
                    Sync ADO
                  </button>
                )}
                <div className="menu-sep" />
                <div className="menu-label">Configure</div>
                <button
                  className="menu-item edit-only"
                  onClick={() => runMenu(() => setSettingsOpen(true))}
                >
                  <SlidersHorizontal size={16} strokeWidth={2} />
                  Ranking weights
                </button>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) onImportFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </section>

      <main ref={viewRef}>
        {view === "board" && <BoardView />}
        {view === "mission" && <TeamView />}
        {view === "timeline" && <TimelineView />}
        {view === "horizon" && <HorizonView />}
      </main>

      <DetailModal />
      <CaptureModal />
      <BetModal />
      <MilestoneModal />
      <SettingsModal />
      {!readOnly && <ShareModal />}
      {!readOnly && <CompareDrawer />}
      <Toasts />
      <Celebration />
    </>
  );
}
