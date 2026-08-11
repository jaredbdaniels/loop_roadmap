"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PauseCircle, RefreshCw } from "lucide-react";
import { useLoop } from "./store";

// How often the chip re-reads the clock. Its wording changes at 45s and then
// once a minute, so a 15-second tick keeps it honest without re-rendering the
// header for no reason.
const TICK_MS = 15_000;

function ago(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

// The header's freshness chip: how current the numbers on screen are, and a
// click to make them current now.
//
// The app polls in the background either way. What was missing was any way to
// tell that from a page quietly sitting on ten-minute-old data — so people
// reloaded to be sure, which is exactly the habit the poll was meant to retire.
export function SyncStatus() {
  const { sync, readOnly, refresh } = useLoop();
  const [now, setNow] = useState<number | null>(null);

  // Starts null and is set on mount: the relative time has to be computed on
  // the client only, or the server would render one age and hydration another.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Recompute as soon as a pull lands, rather than waiting out the tick, so
  // "just now" appears the moment it's true.
  useEffect(() => {
    if (sync.lastSyncedAt !== null) setNow(Date.now());
  }, [sync.lastSyncedAt]);

  // The share view never polls — it's a server-rendered snapshot, and a chip
  // promising live updates there would be a lie.
  if (readOnly) return null;

  if (sync.paused)
    return (
      <span
        className="sync-chip sync-chip--paused"
        title="Live updates are paused while a draft scenario is in view, so a teammate's edit can't overwrite your draft."
      >
        <PauseCircle size={13} strokeWidth={2.4} aria-hidden />
        Live updates paused
      </span>
    );

  const label = sync.syncing
    ? "Refreshing…"
    : sync.failed
      ? "Reconnecting…"
      : sync.lastSyncedAt === null || now === null
        ? "Up to date"
        : `Updated ${ago(now - sync.lastSyncedAt)}`;

  return (
    <button
      className={`sync-chip${sync.failed ? " sync-chip--failed" : ""}`}
      onClick={() => void refresh()}
      disabled={sync.syncing}
      title={
        sync.failed
          ? "The last refresh didn't get through. Click to try again."
          : "The roadmap refreshes itself every 20 seconds and whenever you come back to this tab. Click to refresh now."
      }
    >
      {sync.failed ? (
        <AlertTriangle size={13} strokeWidth={2.4} aria-hidden />
      ) : (
        <RefreshCw
          size={13}
          strokeWidth={2.4}
          aria-hidden
          className={sync.syncing ? "sync-spin" : undefined}
        />
      )}
      <span className="sync-chip-label">{label}</span>
    </button>
  );
}
