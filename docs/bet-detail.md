# Bet detail — the reading surface

Status: **design.** Nothing here is built. The derivations it depends on are, almost entirely,
already written and wired to nothing.

Companion to [`strategic-bets.md`](./strategic-bets.md), which specifies the bet *model*. This
specifies how a bet is **read**. Where this document and the code disagree, the code is
authoritative and the disagreement is a bug in one of them.

---

## Why

A bet has no read mode. `BetModal.tsx` opens on `{isNew ? "New bet" : "Edit bet"}`
([`BetModal.tsx:290`](../src/components/loop/BetModal.tsx)) and the only route to it is an `onEdit`
handler on the timeline band ([`TimelineView.tsx:918`](../src/components/loop/TimelineView.tsx)).
The six blocks from `strategic-bets.md` are implemented faithfully — as **form sections**. To find
out what a bet claims you open the form that edits it and scan the inputs.

Items don't have this problem. `DetailModal` gives an item a reading surface with an activity log
([`DetailModal.tsx:1465`](../src/components/loop/DetailModal.tsx)). Bets got a form.

The second half of the problem is larger and easier to fix. Of the twenty bet derivations in
`logic.ts`, **eight are referenced by no component at all**:

| Derivation | Where | Used by UI |
| --- | --- | --- |
| `betItems` / `betFundedItems` / `betEnabledItems` | [`logic.ts:944`](../src/lib/loop/logic.ts) | — |
| `runTheBusinessShare` | [`logic.ts:1096`](../src/lib/loop/logic.ts) | — |
| `betTeamShares` | [`logic.ts:1113`](../src/lib/loop/logic.ts) | — |
| `betUnstaffedClaims` / `betUndeclaredSpend` | [`logic.ts:1165`](../src/lib/loop/logic.ts) | — |
| `sharedPlatformItems` | [`logic.ts:1182`](../src/lib/loop/logic.ts) | — |
| `betTypeMix` | [`logic.ts:1189`](../src/lib/loop/logic.ts) | — |
| `allocatingBets` | [`logic.ts:1208`](../src/lib/loop/logic.ts) | — |
| `recentlyKilledBets` | [`logic.ts:1228`](../src/lib/loop/logic.ts) | — |
| `totalEpicQuarters` / `itemQuarters` | [`logic.ts:1024`](../src/lib/loop/logic.ts) | — |

The analysis is built. The reading surface isn't. That ratio is what makes this a small change with
a large effect: most of this document is about **arranging numbers that already compute**, not
computing new ones.

---

## The governing principle

> **A narrative is a rendering of the schema, not a field in it.**

Nothing below adds a "story" text field. Every sentence in the bet detail is composed from data that
already exists or is already derived. This matters for three reasons: prose typed into a box goes
stale the moment the roadmap moves; a hand-written summary can disagree with the numbers beneath it;
and — the reason that actually decides it — **a composed sentence makes its own gaps visible.**

An empty `thesis` in a form is an empty textarea, which reads as a field someone will fill in later.
The same empty `thesis` in a rendered sentence is a hole in the middle of a claim:

> We believe **———** produces a lift in completed enrollments.

That is the single cheapest mechanism available for fixing the "both bets have no thesis" problem,
and it costs no validation rule, no required-field gate, and no nagging.

---

## Split read from edit

`BetDetail` becomes the default surface; `BetModal` stays exactly as it is and becomes what the Edit
button opens. The store gains one piece of state alongside the existing pair
([`store.tsx:812`](../src/components/loop/store.tsx)):

```ts
betDetailId: string | null;     // read
openBetDetail(id) / closeBetDetail()
betEdit: string | null;         // edit — unchanged
```

Two rules that keep the split from decaying:

- **`TimelineView.tsx:918` changes from `onEdit` to `onOpen`.** Clicking a bet band should read it.
  Editing is a button inside the thing you're reading, which is how items already work.
- **`BetDetail` renders in read-only and share contexts; `BetModal` never does.** The share view
  passes `readOnly` ([`share/[token]/page.tsx:19`](../src/app/share/[token]/page.tsx)), and today a
  share-link reader has no way to see a bet's reasoning at all — only its colored band on the
  timeline. That is the largest single gap this fixes, and it is the reason the read surface has to
  exist before the narrative view in [`narrative-view.md`](./narrative-view.md) can quote anything.

---

## The lede

The top of the detail is one composed paragraph. Not a field grid — a grid is what the form already
is, and putting a second one on the read surface would mean nothing was gained by splitting them.

**The grammar, in order, with the source of every token:**

```
We believe {thesis}.
{whyNow}
We intend {plannedShare[horizon]}% of {horizon} capacity;
  today this bet funds {funded.share}% — {funded.epics} epics, {funded.quarters}
  epic-quarters — across {teams.length} teams, running {envelope}.
It's worth {value.magnitude} in {value.type} ({value.basis}), landing in about
  {value.timeToValue} quarters.
We'll stop if {killCriteria}. We re-decide on {nextReview}.
```

| Token | Source |
| --- | --- |
| `thesis`, `whyNow`, `killCriteria`, `nextReview`, `value.*` | `Bet`, entered |
| `plannedShare[horizon]` | `Bet.plannedShare`, entered |
| `funded.*` | `betFundedShare` ([`logic.ts:1064`](../src/lib/loop/logic.ts)) |
| `teams` | `betTeams` ([`logic.ts:964`](../src/lib/loop/logic.ts)) |
| `envelope` | `betEnvelope` + `fmtRange` ([`logic.ts:973`](../src/lib/loop/logic.ts), [`:561`](../src/lib/loop/logic.ts)) |

**Missing tokens render as an em-dash blank with the field name beneath it, and the sentence still
runs.** Do not suppress a clause because its field is empty — a bet with no kill criteria should read
as a bet that cannot end, not as a shorter, tidier paragraph. Suppressing empties is how a form
learns to hide its own gaps.

**Blanks are click targets.** Clicking one opens `BetModal` scrolled to that field. The path from
"this bet has no thesis" to "I am typing the thesis" should be one click, from the place the absence
was noticed.

---

## The three deltas

Below the lede sit the three comparisons that carry the whole story of a bet. Everything else on the
page is context for these.

### 1. Planned against funded

`plannedShare[h]` against `betFundedShare().share`, per horizon, on one bar each, with the
`runTheBusinessShare()` remainder drawn in the same bar. Both numbers already exist; only the
remainder is unrendered today.

State the delta in words, not just as two bars: *"intended 25%, funding 6.5% — a 19-point gap."*
A gap in either direction is interesting and neither is automatically wrong. Under-funding a
declared bet is the common failure; over-funding one nobody declared is the more expensive one.

### 2. Declared scope against actual scope

`betJtbdScope` ([`logic.ts:1144`](../src/lib/loop/logic.ts)) already merges the two, marking each
JTBD `declared` or not. Render it as one list, declared first, with the epic count and stage mix per
row. The two flags — `betUnstaffedClaims` and `betUndeclaredSpend` — are already computed and used
nowhere.

Write them as findings, not badges:

- *"Claims Alerts & Automation and has staffed nothing there."*
- *"Four epics in Reporting that this bet never declared."*

A red chip reading `UNSTAFFED` tells a reader that a rule fired. A sentence tells them what is true.

### 3. The KPI against its own baseline

`Bet.outcomes` is a `KeyResult[]` ([`types.ts:28`](../src/lib/loop/types.ts)) with
`baseline → current → target`. Render each as a line with the reading spelled out, and say plainly
when the fields are empty: *"No baseline recorded, so this KPI cannot yet show movement."*

**Do not roll epic KRs up into this block.** `strategic-bets.md` settles that and the reasoning
holds: different denominators, different horizons, different units. Epic-KR coverage — *"3 of 8
linked epics carry no KR"* — belongs in the health strip as hygiene.

---

## The rest of the page

Ordered so that reading top to bottom answers *"should we keep funding this?"*, which is the order
`strategic-bets.md` already specifies. The lede and the three deltas cover blocks 1, 2, 3 and part of
4. What remains:

**Investment detail.** `betTeamShares` — for each team, what fraction of *its* dated work this bet
consumes. This is the over-allocation view at the resolution where the trade-off bites, and it is
computed and unrendered. `betTypeMix` beside it: a foundational bet made entirely of `modernize`
epics is a modernization programme and should read as one.

**Reach, stated separately and never blended.** *"Funds 6.5% · reaches work totalling 11%."*
`betReach` exists ([`logic.ts:1080`](../src/lib/loop/logic.ts)). Where `sharedPlatformItems` flags an
epic that three or more bets rest on, name it here on all three details.

**Delivery state.** `betProgress` ([`logic.ts:997`](../src/lib/loop/logic.ts)) for the stage bar, the
derived envelope, ADO status rolled up, and an at-risk count built from `horizonMismatch`
([`logic.ts:753`](../src/lib/loop/logic.ts)) and unscheduled epics.

**The decision.** Kill criteria, next review, and — once concluded — the verdict, the rationale, and
`whatWeLearned` / `whatWeDoDifferently` / `nextBet` rolled up from the linked epics.

---

## Two additions to the model

Everything above renders existing data. These two don't, and each earns its place.

### `Bet.activity: string[]`

Items have an activity log; bets don't. This is what turns a bet from a state into a plot: proposed,
committed, review passed, epic linked, share changed, verdict recorded. The retrospective comparison
that `strategic-bets.md` calls the one that compounds — *judge the decision, not the outcome* — is
unanswerable without a record of what was believed when.

Follow `Item.activity` exactly: a plain `string[]`, appended by the mutation that caused it, rendered
newest-last. Not an event schema. The moment it becomes structured, someone will want to query it,
and that is a different and much larger feature.

**Ride it in the existing JSON blob.** The `initiatives` table stores a lossless `Bet`
([`schema.ts:39`](../src/lib/schema.ts)), so this needs no migration — but it **must** be added to
`normalizeBets` ([`logic.ts:832`](../src/lib/loop/logic.ts)), which constructs its return value
field by field and silently drops anything unlisted. A field missing from that whitelist works in
memory and vanishes on reload. It is the single easiest thing to get wrong in this codebase.

### `Team.size: number`

*"6.5% of 93 epic-quarters"* is analyst language. *"About half a team for three quarters"* is the
language an exec can act on, and it is the difference between a number being read and a number being
used.

`docs/seed-redesign/4_teams.csv` already carries a `size` column (`"4 eng"`, `"5* eng"`) that
`gen_taxonomy.py` drops on the floor. Parse it there and carry it onto `Team`. Two caveats worth
stating before someone hits them: the values are free text and one is asterisked, so the parser needs
a documented fallback; and a team-quarter figure is an approximation whose error bars should be shown
(*"~½ a team"*, not *"0.47 teams"*). Precision the input doesn't support is worse than a round
number.

Both are optional to the rest of this spec. Build the read surface first; neither blocks it.

---

## What not to build

- **No AI-written bet summary.** The lede is composed by template. A model paraphrasing fields it
  can also get wrong adds a failure mode and removes the property that makes the lede useful — that
  its blanks are structurally visible. The narrative view is where generated prose belongs, and it
  quotes this surface rather than replacing it.
- **No single bet score.** `strategic-bets.md` settles this: 1–5 integers tuned to sort ideas in a
  lane will cluster every bet between 3.8 and 4.2 and launder judgment as arithmetic. The table of
  axes is the comparison.
- **No blocking validation.** Every flag here is advisory, matching `horizonMismatch`, dependency
  conflicts and ADO stage disagreement. Loop explains; it does not prevent.
- **No second edit path.** Everything editable stays in `BetModal`. If the read surface grows an
  inline editor, the two will drift.

---

## Implementation notes

- **New file `BetDetail.tsx`.** Read-only. Takes `bet`, `items`, `bets`; calls the derivations
  directly. No mutations, so it needs nothing from the store beyond `openBet` for the Edit button and
  `openDetail` for linking to an epic.
- **`BetModal` keeps its preview.** The modal builds a `previewItems` array so derived panels react
  to unsaved link changes ([`BetModal.tsx:175`](../src/components/loop/BetModal.tsx)). That behaviour
  is correct and stays; `BetDetail` reads live state and needs no equivalent.
- **`normalizeBets` whitelist.** As above — `activity` must be added or it will not survive a
  reload or an import.
- **`diffStates` already covers bets** via `betFieldChanges`
  ([`logic.ts:1381`](../src/lib/loop/logic.ts)). Confirm `activity` is *excluded* from it: a log that
  grows on every mutation would make every scenario diff noisy and hide the changes that matter.
- **`/api/import` guard.** It replaces bets only when the payload carries them, so legacy exports
  don't wipe existing rows. Preserve that; `Loop/loop-data.json` is the case it exists for.
- **Styling.** Reuse `bet-section`, `bet-grid`, `bet-links`, `bet-score`, `helper`, `bet-warn` from
  `globals.css` rather than introducing a parallel set. The read surface should look like the same
  product as the form it replaces the reading half of.

## Tests the new behaviour needs

The existing suites assert the current shape. These are the cases that don't exist and carry the
risk:

- **Lede composition with missing fields** — every clause still renders, with blanks, for a bet whose
  `thesis`, `killCriteria`, `nextReview` and `value.magnitude` are all empty. This is the seeded
  state of both current bets, so it is the common case, not the edge case.
- **`normalizeBets` round-trip for `activity`** — survives export → import. The whitelist is the
  failure mode.
- **Delta arithmetic** — planned-minus-funded is computed against `betFundedShare().share` and not
  against `betReach().share`. Getting this backwards inflates every bet.
- **Reconciliation rendering** — a declared JTBD with zero epics produces the unstaffed sentence; a
  linked epic in an undeclared JTBD produces the undeclared sentence. Both already have logic-level
  tests; these assert they reach the page.
- **Read surface in share mode** — `BetDetail` renders for an anonymous share-link reader, with
  Intake-linked epics excluded exactly as `getPublicState` excludes them elsewhere, so an internal
  reader and a share reader never see different epic counts on the same bet.

---

## Decisions

### Settled

- **Read and edit are separate surfaces.** The form stays; a read surface is added beside it.
- **The lede is composed, never stored or generated.** Blanks render as blanks.
- **Flags read as sentences, not badges**, and are always advisory.
- **`Bet.activity` mirrors `Item.activity`** — a plain string array, not an event schema.
- **Epic KRs never roll up into the bet's measure**; coverage appears as hygiene.

### Still open

- **Whether `BetDetail` is a modal or a route.** A modal matches `DetailModal` and costs nothing. A
  route (`/bets/<id>`) is linkable, which matters the moment anyone wants to paste a bet into Slack or
  cite one from the narrative view. **Recommend the route**, with the modal as a fast follow if the
  routing work looks disproportionate — but decide before building, because the narrative view will
  want to link to bets and retrofitting linkability is worse than paying for it now.
- **Whether the read surface shows Intake-linked epics to internal users.** They cost nothing and are
  excluded from every share, but hiding them entirely means a PM cannot see what they have parked
  against a bet. **Recommend showing them, visibly separated and explicitly labelled as costing
  nothing** — the same treatment the board gives the Intake lane.
- **`Team.size` parsing.** Free-text values with an asterisk. Worth deciding whether the asterisk
  means anything before writing a parser that discards it.
