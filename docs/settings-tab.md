# Settings — design notes

Status: design, not built. Written 2026-08-04 to think through a single Settings
surface covering voting visibility, ranking weights, ADO sync, the other
integrations, and who outside the team sees what.

The point of writing it down first: four of the six decisions below are cheap now
and expensive later, and one of them (where config is stored) is a trap the
current architecture walks you straight into. Decision 4 has already been
reversed once in the course of writing — roles and invites are out, configurable
shared views are in — which is the argument for the doc.

---

## What exists today, and where it lives

Configuration is real but scattered. Nothing here is missing — it's just spread
across three affordances with no shared home.

| Thing | Where it lives now | Stored where |
| --- | --- | --- |
| Ranking weights (4 sliders) | `SettingsModal`, reached from ⋯ → "Ranking weights" | `settings.weights` (one global row, `id = "global"`) |
| Clear all dependencies | Same modal, below a divider | derived from items |
| Read-only share link | `ShareModal`, top-bar **Share** button | `share_links` table |
| Sync ADO | ⋯ → "Sync ADO" → `POST /api/sync/ado` | nothing persisted about the sync itself |
| Export / Import JSON, export image | ⋯ menu | — |
| Who can sign in | `ALLOWED_DOMAIN` in `src/lib/auth.ts` | code |
| ADO / Aha! / AI credentials | Vercel env (`ADO_PAT`, `AHA_WEBHOOK_SECRET`, `AI_FEATURES`) | env |
| Owner list | `OWNERS` in `src/lib/loop/constants.ts` | code |

Two observations fall out of that table. Settings today is *entirely* the
ranking-weights modal plus a stray danger button, and every integration's real
state lives in env vars the UI can neither read nor explain.

---

## Decision 1 — it is not a view, so it is not a view tab

`VIEWS` (Board / Timeline / Horizon / Team) is a segmented control over *ways of
looking at the roadmap*. Settings is not one of those, and putting it in that
`role="tablist"` breaks the mental model: switching to it would blank the
`<main>` the export-as-image button captures, and the filter/zoom/group-by
controls above it would all become meaningless while it's open.

**Recommendation: a `/settings` route with a left rail of sections**, reached
from a gear next to the user chip in the top bar (not from the ⋯ menu — ⋯ is
"actions on the current view", settings is "how this workspace behaves").

Why a route rather than growing `SettingsModal` into a tabbed modal:

- Sections are linkable. "Go set up ADO" becomes a URL you paste in Slack —
  `/settings/integrations`. That matters a lot for the integrations section,
  where the remaining human steps get handed to someone else.
- Integration cards want to make network calls on mount (status, last sync). A
  modal that does that on every open is worse than a page that does it once.
- The modal is already at the edge of what fits — weights plus one danger button
  at `maxWidth: 460`. Six sections will not fit.

Keep the modal shell for genuinely modal things (capture, detail, share). Keep
the top-bar **Share** button where it is; the settings page's share section
should link to it rather than duplicate the control.

Sections, in this order:

1. **Workspace** — name, who can sign in, defaults
2. **Shared views** — the read-only links and what each one shows
3. **Prioritization** — ranking weights, voting, default sort
4. **Integrations** — ADO, Aha!, Notion, Slack, AI, agent-only connectors
5. **Data** — export, import, seed, scenarios
6. **Danger zone** — clear dependencies, revoke share, delete scenarios

Order is deliberate: identity → who sees what → how decisions get made → what
it's wired to → the data itself → things that destroy data.

**Gating:** the entry point must be behind `!readOnly && userEmail`. The
`/share/[token]` page renders `LoopApp` with `readOnly`, and while `edit-only`
CSS hides most write buttons, a settings *route* isn't covered by that class —
it needs its own session check server-side, the same `getSession()` pattern
every API route already uses.

---

## Decision 2 — do NOT put workspace config in `LoopState` (the trap)

This is the one that's expensive to undo.

`LoopState` is `{ items, weights, bets, milestones }`. A scenario stores a **full
copy of `LoopState`** as one JSON blob (`scenarios.state`), and `CompareDrawer`
diffs it field by field — `StateDiff` even has a dedicated `weights:
FieldChange[]` for exactly this.

So anything you add to `LoopState` automatically becomes:

- forked into every scenario,
- diffed in the compare drawer,
- and *restorable* when a scenario is applied.

For `weights` that's correct and intentional — "what if we weighted strategic
fit higher?" is a legitimate what-if, and seeing the weight change in the diff
is the feature working.

For "hide voting" it is wrong. A display preference is not a what-if. If it
lives in `LoopState`, forking a scenario snapshots it, the compare drawer reports
"Show votes: true → false" as a roadmap change, and applying an old scenario
silently flips voting back on for the whole team.

**Recommendation: two stores with different lifecycles.**

```
settings  (id = "global")
  weights   jsonb   -- stays. Part of LoopState. Forked and diffed. Unchanged.
  config    jsonb   -- NEW. Workspace config. Never enters LoopState.
  updatedAt timestamptz
```

`config` as a single jsonb blob follows the pattern the rest of the schema
already uses (items, bets, milestones, scenarios are all lossless blobs
precisely so new fields ride along with no migration). A column per toggle would
be a migration per toggle.

```ts
export interface WorkspaceConfig {
  votingEnabled: boolean;      // can anyone click +1
  voteCountsVisible: boolean;  // are counts rendered at all
  defaultView: ViewKey;
  defaultGroupBy: GroupByKey;
  ado: { autoSyncDaily: boolean };
  // ...
}
```

Served by extending `GET /api/settings` to return `{ weights, config }` and
adding `PATCH /api/settings` for partial config writes. Keep `PUT` for weights
so `updateWeights` in the store doesn't change shape.

The client-side mirror of this split: `weights` stays in the `LoopProvider`
state that scenario switching overwrites (`setWeights(scenario.state.weights)`
already happens in three places); `config` goes in a separate context — or the
same provider but explicitly *outside* `stateRef.current` — so scenario
switching cannot touch it.

---

## Decision 3 — "hide voting" is two toggles, and it has to reach the rank formula

**Confirmed 2026-08-04, against the competing proposal.** PR #47's earlier revision specified
deleting voting and the `Weights` tuning UI outright, per the Opportunities Register's additive
rubric. That is now reversed in favour of what follows: configurable, defaulting to off and out of
the rank score. Reasoning lives in
[`ai-native-process-alignment.md`](./ai-native-process-alignment.md) under objection 1 — in short,
the objection is that a popularity number quietly drives the roadmap, not that the number must be
destroyed, and deleting the weight-tuning UI removes the mechanism that makes rank arguable.

A single boolean under-specifies it. There are two distinct things a PM wants:

- **"Stop people clicking +1."** The tally is fine, we just don't want it moving
  during a planning week.
- **"Stop the roadmap looking like a popularity contest."** Don't show counts to
  anyone; especially not on the shared read-only link an exec is looking at.

Those are independent, so: `votingEnabled` (write) and `voteCountsVisible`
(read). Two checkboxes, second one indented under the first.

### The part that's easy to miss

Votes are not just a display element. `weights.votes` is a live term in the rank
score. Hide the input and leave the weight at 3, and the number on the card
becomes unexplainable — the ranking is still substantially driven by a signal
nobody can see, and `explain-rank` will happily cite it.

Three ways to resolve it, and the middle one is right:

1. Hide the UI, leave the formula. **Rejected** — produces a score no one can
   defend, which is the exact opposite of what the modal's own helper text
   promises ("Adjust the weights so the number stays defensible").
2. **Hiding vote counts drops the votes term from the score.** The Votes slider
   in Prioritization disables with an inline note ("Votes aren't part of the
   score while vote counts are hidden"), `rankScore` skips the term, and the
   `explain-rank` prompt stops receiving it. Recommended.
3. Hiding counts forces `weights.votes = 0`. Same arithmetic as (2), but it
   *destroys* the stored weight — turn voting back on and the old setting is
   gone. Rejected for that reason.

Note (2) means the rank formula reads config, not just weights. Keep the
computation pure — pass config into `rankScore` rather than importing it — so
`logic.test.ts` stays as it is.

### Every touchpoint

Worth listing because a CSS-only hide misses over half of them:

| Surface | What's there | Under `voteCountsVisible: false` |
| --- | --- | --- |
| `BoardView` card | `· N votes` meta + `+1 vote` link | both gone |
| `HorizonView` | `+1 vote` link | gone |
| `DetailModal` | Votes field + `+1 vote` button | field hidden (value preserved in `form`) |
| `SettingsModal` / Prioritization | Votes weight slider | disabled with a note |
| `logic.ts` `rankScore` | `votes × w` term | term dropped |
| `explain-rank` prompt | votes cited as a driver | votes omitted from the payload |
| `CompareDrawer` | `votes: "Votes"` field label | row suppressed in diffs |
| `Celebration` | `kind: "vote"` +1 pop | never fires |
| `StatsBar` | check for a vote total | suppressed if present |
| `/share/[token]` | per-link chrome, defaulting from workspace config | counts hidden — this is the main reason to build it (see Decision 4) |

**Never delete vote data on a display toggle.** The Aha! webhook keeps arriving
regardless: `ahaEndorsements` syncs in and moves `votes` by the *delta* between
fires. That should keep working with voting hidden — Aha! owns that number, Loop
is just storing it. Hiding is a view concern; the toggle must be losslessly
reversible.

---

## Decision 4 — no roles. Configurable shared views instead

**Superseded 2026-08-04.** The first draft of this section weighed three ways to
build invites and recommended a `members` table with admin/editor/viewer roles.
Dropped, on the grounds that it solves a problem that doesn't exist: everyone who
can sign in is at Campminder and can already edit, and inventing a permission
hierarchy inside one product org adds administration without adding safety. The
only boundary that earns its keep is **internal vs. external**, and the share
token already draws it.

What people actually needed from "invite" was *different audiences seeing
different things*. That's a share-link feature, not an identity feature.

So: **no members table, no roles.** The Workspace section states plainly that
anyone with a Campminder Google account can sign in and edit, with a copy-link
button. Everything else moves into Shared views.

### The gap: today's share view isn't simplified, it's the app with buttons hidden

`/share/<token>` renders the same `LoopApp` with `readOnly`, which sets
`body.share-mode`, which hides `.edit-only` in CSS. That covers write
affordances well — drag handles, link handles, inline add buttons, Save/Kill, the
`✎ to edit` hints. It does not simplify anything. An anonymous viewer still gets:

- all four view tabs, group-by, and zoom
- the team / owner / bet filter selects
- `StatsBar`
- **the ⋯ menu, including Export JSON and Export view as image** — neither is
  marked `edit-only`, so anyone holding the link can download the whole roadmap
  file, toast text and all ("this is the same file agents can read")
- **a "Show killed" checkbox that cannot do anything**, because `getPublicState`
  already strips killed items before they reach the client

That last pair is the tell: the share view was built as a permission state, not
as an audience-facing artifact.

### Two independent dials

**Scope — what data.** Applied in `getPublicState`, which already takes exactly
this shape of responsibility (it filters `killed` and blanks `killedReason` /
`activity`). Extend it to accept the link's config:

- stages — **the highest-value one.** A Capture-stage idea rendering to an exec
  as "the roadmap" is the actual failure mode: a half-formed thought read as a
  commitment. Defaulting an exec link to Committed → Deliver → Learn fixes more
  than every chrome setting combined.
- teams / missions, bets, modules or JTBDs
- horizon or date window (e.g. current + next season only)

**Chrome — what UI.** Passed to `LoopApp` as config rather than baked into CSS:

- which views are offered, and which one opens (lock a link to Timeline)
- default group-by and zoom
- `StatsBar` on/off
- vote counts on/off (see Decision 3)
- rank scores on/off — a raw rank out of context mostly invites "why is my thing
  seventh?"
- the ⋯ menu / export affordances — **default off for shared links**
- the filter selects, which a scoped link has little use for

### Enforce scope on the server. Not in the client.

The one implementation note that actually matters. If a link's scope is applied
by hiding cards client-side, the full state still ships in the HTML payload and
view-source defeats it. `getPublicState` is already the server-side chokepoint
and already strips two things — scope belongs there, beside them.

### Restriction-only invariant

**A shared view may only ever show less than the internal app, never more.**
Link config can hide what the workspace shows; it can never reveal what the
workspace hides. That makes every link safe by construction — a new link can't
leak something a workspace setting was meant to suppress, so links never need
auditing individually. It also resolves the earlier open question about whether
share inherits workspace config: workspace config supplies the defaults, link
config may only tighten them.

### Filtering breaks derived things — prune and recompute

Two failure modes to handle rather than discover:

- **Dangling references.** `dependsOn` pointing at an excluded item, and
  `betIds` / `fundedBetId` pointing at an excluded bet, must be pruned in
  `getPublicState` or the timeline draws dependency arrows to nothing.
- **Silently wrong derived numbers.** `StatsBar` counts, and a bet's investment
  and `plannedShare` arithmetic — derived from the items that fund it — become
  wrong on a filtered set while still rendering as fact. A bet whose funding
  items were filtered out reads as free. Either recompute on the filtered set
  and label the view as scoped, or keep bets out of scoped links.

### The schema is already most of the way there

`share_links` has `label` and `expiresAt` columns that no UI touches, and its
comment already anticipates this: *"the UI exposes one active link at a time…
but the table supports multiple rows for cheap future-proofing and an audit
trail."* So named, purpose-built views are close to free:

```
share_links
  ...
  label      text          -- exists, unused. Names the view: "Exec view"
  expiresAt  timestamptz   -- exists, unused. "Board demo link, 30 days"
  config     jsonb         -- NEW. { scope: {...}, chrome: {...} }
```

One real blocker to multiple links: `createShareLink` revokes **every** enabled
row before inserting, because regenerate currently means rotate-the-one-secret.
Going multi means scoping that revoke to a single token.

And a found affordance — `toggleShareMode` already exists in the store, complete
with toast copy, and **no component calls it.** It's a built-but-unwired
"preview as a viewer" that the Shared views section can use as-is, per link.

### Considered: use a forked scenario as the exec view

Worth taking seriously, because scenarios already exist and cost nothing to fork: make an "Exec view"
scenario, curate it by hand, share or export that. The answer splits by whether you want a document
or a link.

**For a one-off export — yes, and it works today with no build.** Fork, delete what an exec shouldn't
see, adjust dates, then Export view as image or Export JSON. That's a board-deck artifact, and
scenarios are already exactly the right tool for it.

**For a live link — no.** A scenario is a *copy*, not a *view*, and four things follow from that:

- **It goes stale silently.** Forked at a moment, drifting from live the instant anyone edits. A
  filtered view is always current; a scenario-backed exec link is a snapshot that looks live. Stale is
  worse than absent here.
- **Refreshing it is manual and repeated.** Re-fork, re-curate, re-share, every time. That won't
  happen, which is how the link gets stale in the first place.
- **It fights what a scenario is.** `createdBy` scopes them personal, they're modeled as throwaway
  what-ifs, and there's a Discard button next to one. Nothing about that says "durable published
  artifact."
- **`applyScenario` becomes dangerous.** If the exec view is a scenario, someone hitting apply pushes
  an exec-curated subset onto the live roadmap. Scenarios are safe to apply today precisely because
  they're *meant* to be applied.

Two smaller ones: curating by deleting items bakes the dangling `dependsOn` / `betIds` problem
permanently into the blob rather than pruning it on read, and a scenario changes data but not chrome —
the ⋯ menu and Export JSON are still sitting there for your viewer.

So: scenarios for the exported artifact, a scoped share link for the live one. And if only the live
link is wanted, the cheap version isn't the whole config system above — it's the stage filter in
`getPublicState`, which is one filter and delivers most of the value.

### Sequence it in two phases

- **Phase A — config on the single existing link.** Add `config`, extend
  `getPublicState`, thread chrome through `LoopApp`, wire the preview toggle.
  Stops being a permission state and becomes an artifact. Nothing about the
  single-link model changes, so `ShareModal` stays roughly as it is.
- **Phase B — multiple named views.** Relax `createShareLink`, turn the modal
  into a list, surface `label` and `expiresAt`. Worth it once there's a second
  audience; skippable if there isn't.

Phase A is where the value is. Phase B is a small follow-on and losing nothing
by waiting.

---

## Decision 5 — Integrations is a status mirror, not a secrets form

The temptation is to build a form that takes a PAT. Resist it: secrets live in
Vercel env, there is no secrets store in the app, and accepting a PAT into
Postgres would be a real downgrade in posture for zero gain.

**The section reads config state and names the exact remaining human step. It
never accepts a secret and never echoes one.** `GET /api/ai/status` is already
the pattern to copy — it returns `{ enabled }` and deliberately reveals neither
provider nor model. Do the same per integration: a status endpoint returning a
state and metadata, never the credential.

Every card shows one of four honest states. This matters more than the styling —
it's what stops the page from claiming things that aren't true:

- **Connected** — configured and working, with last activity
- **Needs setup** — built, credential missing, *here is the one remaining step*
- **Agent-only** — works in a Cowork session, not from the hosted app
- **Not built** — no connector; say so instead of showing a dead toggle

Mapping the current reality (from `Loop/INTEGRATIONS.md`, which is the source of
truth for this and should stay in sync):

| Integration | State | Card shows |
| --- | --- | --- |
| **Azure DevOps** | Connected (or Needs setup) | org/project, direction, last sync + diff summary, **Sync now**. Setup step: "mint a PAT scoped Work Items → Read, set `ADO_PAT` in Vercel env" |
| **Aha! Ideas** | Needs setup | the webhook URL to paste into the Aha! automation, whether `AHA_WEBHOOK_SECRET` is set, count of items ingested. Setup step: create the automation + set the secret |
| **AI features** | Connected / off | `AI_FEATURES` state, which copilots that lights up. No provider name |
| **Notion** | Agent-only | links work (they're just URLs on items); title refresh and one-pager drafting are agent-run, not hosted |
| **Slack** | Not built | intake + digest are prompts today, not a connector |
| **Miro / Granola** | Agent-only | workshop snapshot / meeting capture, session-only |
| **Pendo / Salesforce** | Not built | `outcomeReading` is manual — say so |

### The concrete gap: nothing records a sync

`POST /api/sync/ado` returns a diff summary and throws it away. The UI toasts
it, then it's gone. A settings page that can't answer "when did this last run
and what changed?" is decoration.

Smallest fix that fits the existing schema style — a blob per integration:

```
integration_state
  id        text primary key   -- 'ado' | 'aha' | ...
  state     jsonb              -- { lastRunAt, lastSummary, lastError, counters }
  updatedAt timestamptz
```

`POST /api/sync/ado` writes a row on the way out; the card reads it. That also
unlocks daily auto-sync later (a cron hitting the same route) with somewhere to
report into.

### Say what each integration owns

`INTEGRATIONS.md` states the governing principle — *Loop references other
systems, it never duplicates them* — and the cards are the right place to make
that visible rather than tribal. ADO's card should say, in one line: **one-way
pull, ADO → Loop; refreshes `adoStatus` only; Loop never writes back.** That
single sentence prevents the standing question of whether editing a Loop date
moves an ADO iteration.

---

## Decision 6 — settings changes are team-wide and currently unlogged

Items carry an `activity` string array. Settings carry nothing. Yet a weights
change silently re-ranks every lane for everyone, which is a bigger blast radius
than most item edits.

Cheapest useful version: an `activity` array inside the `config` blob —
`"2026-08-04 · jareddaniels@campminder.com set strategic fit weight 3 → 4.5"` —
rendered as a short "recent changes" list at the bottom of the settings page. No
new table, no new route. Worth it mostly for weights, voting, and roles.

---

## Suggested build order

Each step is independently shippable and useful on its own.

1. **The shell.** `/settings` route, left rail, gear entry point, session-gated.
   Move the existing weights sliders into Prioritization and the clear-deps
   button into Danger zone. Delete `SettingsModal`. Nothing new — pure relocation,
   so it's easy to verify against current behavior.
2. **`config` blob.** Add the column, extend `GET /api/settings`, add `PATCH`,
   wire the separate client context. Ship it with one trivial setting
   (`defaultView`) to prove the path end to end.
3. **Voting toggles.** Both booleans, all ten touchpoints, the rank-formula
   change, the disabled Votes slider. This is the highest-value section and the
   one that most needs the config store to already exist.
4. **Shared views, Phase A.** `config` on `share_links`, scope enforced in
   `getPublicState` (with reference pruning), chrome threaded through `LoopApp`,
   preview toggle wired. Fix the two existing oddities while in here: gate
   Export JSON behind chrome, and drop "Show killed" from the share view.
5. **Integrations, read-only.** Status endpoints per integration, four-state
   cards, `integration_state` table, ADO last-sync and **Sync now** moved out of
   the ⋯ menu.
6. **Later.** Shared views Phase B (multiple named links); daily ADO auto-sync;
   settings activity log.

Steps 1–4 are the ones worth doing soon. Nothing here needs a members table, an
email provider, or a permission model.

---

## Dependency: the stage rename lands first

The stage names are being renamed to the guild's phase vocabulary — `Signal / Discovery / Validation /
Design / Delivery / Outcome`, six columns replacing today's five. See
[`ai-native-process-alignment.md`](./ai-native-process-alignment.md).

That gates the scope filter here, since stage is the filter that matters most and its values are
about to change. It does **not** gate the shared view as a whole: a shared view should probably show
no stage vocabulary at all, which is the point of separating publish from share. So the ordering is
narrower than it first looks — the rename blocks the stage-scoping work and the internal board, not
the exec view.

---

## Open questions

- **Which stages should an exec link default to?** Under the new names, Delivery → Outcome is the
  obvious answer, with Design a judgment call; worth confirming that Discovery and Validation are
  genuinely too early to show.
- **Do scoped links get bets at all?** Keeping them means recomputing investment
  and planned-share honestly on the filtered set and labelling the view as
  scoped; dropping them is simpler and loses the strategic framing that's often
  the reason to share in the first place.
- **Is Phase B ever wanted**, or is one well-configured link enough? Phase A
  works either way — this only decides whether `createShareLink` gets relaxed.
- **Should a shared link record last-accessed?** Cheap (one write in
  `validateShareToken`) and it answers "is anyone actually looking at this?"
  before someone maintains a view nobody opens.
- **Anything else that should move in?** Seasonality lanes, the seed/preview
  route, and scenario cleanup are all plausible settings residents and none of
  them are in the six sections above.
