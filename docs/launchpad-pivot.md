# Pivoting Headlights into Launchpad

Status: **plan, not built.** Written 2026-08-24 to size the full pivot — Loop
(renamed **Launchpad**) becomes the tool of record for the Headlights ritual,
replacing the per-team Notion boards and the manual pre-read/archive steps
around them.

This is not a rename exercise. The stage vocabulary already matches (see
`README.md` and `ai-native-process-alignment.md`) — that part of the pivot
happened months ago. What's left is closing the gap between "a kanban board
that uses the same four words" and "the artifact leadership actually reviews
once a month."

## Definition of done

A team can run its entire Headlights cycle — prep, triad alignment, the
board, the confidence conversation, the leadership session, the archive —
inside Launchpad, and nobody needs to touch the Notion Headlights hub to do
it. The Notion pages get one pinned banner pointing at Launchpad and stop
being edited.

**Non-goal:** replacing the meeting itself. Launchpad is the artifact and the
archive; the 90-minute room with a facilitator, a agenda, and a
challenge-and-support conversation stays exactly as `Headlights Meetings`
(Notion) describes it.

## Gap inventory

| Headlights requirement | Loop today | Gap |
| --- | --- | --- |
| Per-team 3-month board, four lifecycle bands | Board view = one global kanban by stage, no month axis | New view: bucket items by (team × month × stage) |
| Confidence per month, per team, with reasoning + what-would-raise-it | Nothing at this granularity (`Item.confidence` is a 1–5 RICE input, not this) | New entity, new UI |
| Risks and leadership asks, per team per cycle | Not modeled | New entity (same shape as above) |
| Leadership rollup — all teams, one sitting | Loop is one shared board; no cross-team summary screen | New view, built on the exec-share-link work already in flight |
| 24-hour pre-read | No formal mechanism; boards get manually sent | Reuse scoped share links (`settings-tab.md` Decision 4) |
| Archive — "what did we believe in June" | Scenarios exist but nothing snapshots automatically | Extend scenarios with a locked/archival kind |
| PM edits Discovery/Solutioning, EM edits Building/Releasing | No roles, by deliberate design (`settings-tab.md` Decision 4) | Convention + attribution, not a permission system (see Phase 5) |
| Stale-board anti-pattern | N/A — Notion pages get copied forward by hand | Solved for free once the board derives from live item data instead of being hand-edited each cycle |

Six of eight rows are genuinely new work. Two are already close to free.

## The naming collision worth catching now

`Item.confidence` already exists — a 1–5 RICE-style input that feeds
`computeRank`. Headlights "confidence" is a completely different thing: a
High/Medium/Low judgment about a *team's whole month*, not a 1–5 estimate
about *one item*. Calling the new field "confidence" anywhere near the
existing one will make every future code review and every AI feature prompt
ambiguous about which one it means.

**Name the new concept `DeliveryOutlook`** (or similarly distinct — the point
is it must not share a name with `Item.confidence`). Used throughout this
doc.

## Data model

### New: `DeliveryOutlook`, keyed by team + month

```ts
export const OUTLOOK_LEVELS = ["high", "medium", "low"] as const;
export type OutlookLevel = (typeof OUTLOOK_LEVELS)[number];

export interface DeliveryOutlook {
  id: string;           // `${mission}:${month}`, e.g. "Apollo:2026-09"
  mission: string;       // matches Item.mission / MISSIONS
  month: string;         // "YYYY-MM"
  level: OutlookLevel | null;   // null = not yet stated
  reasoning: string;
  whatWouldRaiseIt: string;
  risks: string[];       // one line each, matches the Notion "top 3 risks" convention
  asks: string[];        // specific leadership asks: a decision, a connection, a resource
  updatedBy: string;
  updatedAt: string;
}
```

**Lives inside `LoopState`, not beside it.** `settings-tab.md` Decision 2
already drew this line: workspace *preferences* (default view, voting
visibility) must stay out of `LoopState` because scenario-forking would
snapshot and restore them by accident. `DeliveryOutlook` is the opposite case
— it's exactly the kind of *declared current belief* that `weights` already
is in that same doc. You *want* it forked when someone drafts a what-if, and
you *want* it diffed in `CompareDrawer` the same way `weights` is. So:

```ts
export interface LoopState {
  items: Item[];
  weights: Weights;
  bets: Bet[];
  milestones: Milestone[];
  outlooks: DeliveryOutlook[];   // NEW
}
```

`StateDiff` gains `outlooksChanged: EntityChange[]`, following the exact
pattern `itemsChanged`/`betsChanged` already use. This is what makes "how did
the plan change since last month" a diff view instead of two Notion pages
open side by side.

### Board placement is derived, not entered

The board itself — which item sits in which (team, month, lifecycle band)
cell — should **not** be a new hand-maintained structure. It's already
computable from data every item carries today: `mission`, `stage`,
`targetStart`, `targetEnd`. `TimelineView` already does the month-bucketing
math for the Gantt view; the new Headlights grid reuses that, not a
parallel data entry step. This is the single biggest win of building this in
Launchpad instead of Notion: **the board can never go stale**, because it
isn't a snapshot someone copies forward — it's a live read of the same items
Loop already tracks. That alone kills two of the nine Headlights
anti-patterns (stale boards, and "everything in Building with no
Discovery/Solutioning" becomes visually obvious rather than something a
reviewer has to notice by eye).

## Views

### 1. Team Headlights board (new `ViewKey`)

Add `"cycle"` to `ViewKey` in `constants.ts`. Layout, per team:

- Columns: current month + next 2 (rolling, same as Notion today)
- Rows: the four `LIFECYCLE_STAGES`, populated by derived item placement
- A `DeliveryOutlook` panel per month column: level, reasoning,
  what-would-raise-it
- A risks/asks panel per team, sourced from the same `DeliveryOutlook` rows

This is a straight port of the `CampCo Headlights` Notion page structure
(columns = months, colored rows = lifecycle bands, pink confidence row,
action items at the bottom) onto live data instead of manually-populated
linked databases.

### 2. Leadership rollup (extends the exec-share-view work already planned)

`settings-tab.md` Decision 4 already specs scoped, read-only share links with
configurable stage/team visibility, explicitly to solve "an exec link
shouldn't show Intake." Extend that same mechanism with an **outlook rollup
mode**: one screen, every team's current-month `DeliveryOutlook.level` plus
top risk, in a grid. This is the screen leadership actually watches during
the 90-minute session, and it reuses infrastructure already scoped rather
than inventing a second sharing system.

Sequencing note: build the Team Headlights board (view 1) before the rollup
(view 2) — the rollup is a thin aggregation over the same `DeliveryOutlook`
rows, so it's materially cheaper once view 1 exists, and building it first
would mean guessing at the aggregation shape.

## Archive: locked scenarios

Extend `Scenario` with:

```ts
kind: "whatif" | "headlights-archive";   // default "whatif"
locked: boolean;                          // archives are never editable or discardable
```

A "Submit for Headlights" action per team, taken once before the monthly
session, forks the live state (items + the team's `DeliveryOutlook` rows)
into a `headlights-archive` scenario, named e.g. `"Apollo — Headlights
2026-09"`, and locks it. This is the entire archive requirement from the
Headlights spec — "what teams believed at the time," "how plans evolved" —
built on infrastructure (`Scenario`, `CompareDrawer`) that already exists and
already does exactly this kind of diffing. No new storage concept, just two
new fields and a filter in the scenario switcher to separate archives from
personal what-ifs.

This also gives the 24-hour pre-read for free: the submit action *is* the
pre-read trigger, and the resulting locked scenario can be the payload behind
a scoped share link sent to leadership.

## Phased plan

| Phase | What | Depends on | Size |
| --- | --- | --- | --- |
| **0 — Identity** | Rename Loop → Launchpad: README, nav header, page titles, doc cross-references. No schema/behavior change. | Nothing | S |
| **1 — `DeliveryOutlook` data layer** | New type, add to `LoopState`, schema column, `GET/PATCH /api/outlook`, `StateDiff.outlooksChanged`, a minimal editor (can be a modal before it has a home view) | Nothing | M |
| **2 — Team Headlights board view** | New `"cycle"` `ViewKey`, month-bucketed board reusing `TimelineView`'s placement math, `DeliveryOutlook` panel wired to Phase 1 | Phase 1 | M/L |
| **3 — Archive** | `Scenario.kind`/`locked`, "Submit for Headlights" action, archive filter in scenario switcher | Phase 1 (needs `outlooks` in `LoopState` to fork) | S/M |
| **4 — Leadership rollup** | Outlook-rollup mode on the scoped share-link work | Phase 2 (aggregation shape), the exec-share-link work in `settings-tab.md` | M |
| **5 — Governance & cutover** | See below | Phases 1–4 shipped | — |

Phases 1–3 are the real MVP: a team can prep, present, and archive a cycle
without Notion. Phase 4 is what makes the *meeting itself* run out of
Launchpad instead of someone screen-sharing eight Notion tabs. Phase 0 can
happen any time — it's free and it's a clear signal the pivot is real, so
there's an argument for doing it first purely for that reason, but nothing
functional blocks on it or is blocked by it.

## Phase 5 — governance and cutover

The two decisions here aren't engineering calls, and building ahead of them
risks building the wrong thing:

1. **Who owns "Launchpad is the tool of record."** Per `Headlights Meetings`,
   Janelle owns the operating rhythm today. This pivot needs her (or
   whoever owns the ritual) to bless Launchpad as *the* artifact, not an
   additional one — otherwise teams maintain both and the pivot has made
   things worse, not better.
2. **PM/EM field ownership.** The Headlights spec assigns Discovery/
   Solutioning updates to the PM and Building/Releasing to the EM. Loop has
   a standing, deliberate "no roles" position (`settings-tab.md` Decision
   4) — reversing that is a real scope increase, not a small addition.
   **Recommendation: don't build enforcement.** Log the last editor per
   `DeliveryOutlook` entry the same way `Item.activity` already logs
   changes, and let the convention be social, same as it is today. Add
   actual field-level permission only if this becomes a real problem in
   practice, not preemptively.

**Cutover sequencing:** run one full cycle in parallel — Launchpad board
built and archived alongside the existing Notion board — before touching the
Notion hub. Compare them side by side once at the actual leadership session.
Only after that comparison holds up should the Notion `Headlights` hub page
get a pinned banner pointing at Launchpad and stop being the page people
update.

## Risks

- **Room legibility.** The Notion board's colored columns are very scannable
  live in a meeting. The Team Headlights view needs to clear that bar before
  anyone will trust presenting from it — this is a design risk, not a data
  risk, and worth a throwaway prototype before Phase 2 is built for real.
- **`DeliveryOutlook` is still hand-typed.** This pivot removes the *board*
  maintenance burden (derived from items) but not the *confidence reasoning*
  writing burden — someone still types "why is this Medium" every month.
  That's a lateral move from Notion, not new work, but it's worth being
  explicit that Launchpad doesn't make the ritual free, just less redundant.
- **The open governance question in `ai-native-process-alignment.md`**
  ("which process governs which phase," AI-Native Product Process vs.
  Unified SDLC) doesn't block this pivot — Headlights sits above both as a
  leadership ritual — but if that question resolves in a way that changes
  Loop's stage vocabulary again, the Team Headlights board inherits the
  change for free (it reads `LIFECYCLE_STAGES`, not a hardcoded list).

## Open questions

- Does `DeliveryOutlook.level` stay High/Medium/Low, or should Launchpad
  also support percentage confidence (the spec allows either)? Recommend
  starting with the three-value enum — it matches what teams use today, and
  a numeric option is a strictly additive change later if requested.
- Should submitting a Headlights archive be mandatory (a gate before the
  monthly view is considered current) or optional? Recommend optional at
  first — a gate before anyone trusts the tool would block real cycles on
  tooling friction.
- Where does the leadership rollup live — a dedicated `/launchpad/rollup`
  route, or a `ViewKey` like the team board? Leaning dedicated route, since
  it's cross-team and doesn't fit the single-workspace board/timeline/team
  view model the rest of the app uses.
