# Freshness and view state

Status: **built.** Two small changes with one thing in common: both were about a reload — one
about not needing it, one about not being punished for it.

---

## The two complaints

**"Does this thing refresh?"** It always has. `store.tsx` has polled `/api/items` every 20 seconds
since the app was hosted. But a silent poll and a broken poll look identical, so people reloaded to
be certain — the exact habit the poll was built to retire. Two real gaps sat underneath the
perception one:

- A **hidden tab kept polling** on a timer the browser throttles anyway, and there was no pull on
  the way *back* to the tab. Returning to a tab you left an hour ago showed you hour-old numbers for
  up to twenty more seconds — which is precisely when someone reads the screen and believes it.
- A **failed pull was invisible and unhandled**. `refresh()` had no `try`/`catch`, so a dropped
  connection threw inside an interval callback, and the app went on showing stale data with total
  confidence.

**"If I refresh, can it keep me where I was?"** It couldn't. View, zoom, grouping, all three filters
and the open card lived only in React state, so any reload dumped you back on the Board with the
filters cleared. Reloading for fresher data cost you your place in the roadmap — a bad trade, and
the reason the first complaint had teeth.

## What changed

**The poll got a visible pulse and better timing.** `SyncStatus` in the header reads
`sync: { lastSyncedAt, syncing, failed, paused }` off the store: "Updated 2m ago", "Refreshing…", or
an amber "Reconnecting…" when a pull failed. It's a button, so it doubles as the manual refresh the
app never had. In a scenario draft it reads "Live updates paused" — pulling there would clobber
draft state that lives only in memory. It renders nothing on `/share/<token>`, which is a static
snapshot that genuinely never polls.

The poll itself now skips hidden tabs and pulls on `visibilitychange` and `focus` instead, debounced
by `REFOCUS_MIN_AGE_MS` so flicking between windows isn't a fetch per flick. Its pause conditions
moved into a ref, so opening a modal no longer tears the interval down and restarts its clock.

**View state round-trips through the query string.** `view-state.ts` owns the encoding —
`?view=timeline&zoom=year&group=bet&teams=<ids>&owner=<name>&bet=<id>&killed=1&item=<id>` — with
validation on the way in, so a stale or hand-edited URL falls back to the page's defaults rather
than putting the app in a state its own controls can't express. The store writes it with
`history.replaceState` (not a router navigation: this isn't a new page, and a history entry per
filter toggle would bury the Back button) and the pages parse it server-side, so a reload renders
the view you asked for instead of flashing the Board first.

Two consequences, both wanted: a reload lands you where you were, and a pasted URL puts a teammate
in the same place — the same argument that made a bet a route rather than a modal (D1 in
[`narrative-decisions.md`](./narrative-decisions.md)).

## What deliberately doesn't persist

- **Editors** — capture, bet, milestone, settings. An editor is an unsaved session; reopening one
  after a reload promises something the reload already threw away. Only the item detail modal
  round-trips (`?item=`), because it's a reading surface first.
- **Scroll position** inside a view. The browser restores window scroll on reload; the timeline's
  own horizontal scroll container starts back at the left edge.
- **The scenario you were in.** Drafts are per-user state on the server, and `?scenario=` would
  invite sharing a link to a draft that only its author can open.

## Note on `?edit=`

The bet page's Edit button used to send you to `/?bet=<id>&focus=<field>`. `bet` now names the bet
*filter*, so the one-shot instruction moved to `/?edit=<id>&field=<field>`. It's stripped from the
URL as soon as it's carried out — an instruction, not state. An old `/?bet=<id>` link still does
something sensible: it filters the roadmap to that bet.
