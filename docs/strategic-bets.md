# Strategic bets in Loop

Status: **partly built.** The schema, the funded/enabling link, the derivations and the bet detail
are live. The portfolio view, the comparison table and the value-density ratio (with its tunable
`betWeights`) are still design — they are the follow-up described at the end of this doc.

This remains the model to argue with; where the code and this document disagree, the code is
authoritative and the disagreement is a bug in one of them.

## Why

Campminder's Rhythm of Business already runs on bets. `Claude.md` describes it: the annual cycle
locks the product offering on May 1 and then locks the strategic bets for the following year's
revenue; PMs submit no more than 4–5 bets each; the portfolio is a pyramid with **1–3 foundational
bets** and smaller experiments on top; every bet has to answer *"why are we making a bet in this
area at all?"*; and decision quality is judged Annie-Duke style — judge the decision, not the
outcome, and expect at least one losing bet every 6–8 months. Three cross-functional themes
(protect, grow, new logos) are meant to cut across all of it.

None of that is modeled in Loop. The nearest thing is `Initiative`
([`src/lib/loop/types.ts:147`](../src/lib/loop/types.ts)), whose entire schema is six fields — an
id, two timestamps, and three that carry any meaning:

```ts
export interface Initiative {
  id: string;
  title: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}
```

That anemia is deliberate and half-right. An initiative carries no dates, teams, or progress of its
own — they're derived from the items linked to it via `Item.initiativeIds`. **That principle is
correct and this design keeps it.** The problem is what's missing: an initiative can't state a
hypothesis, can't say what it costs, and can't be wrong. Today two initiatives are seeded and one of
them has zero linked epics. It's a coloring layer on the timeline, not a strategy layer.

Two problems `Claude.md` names explicitly are the ones this fixes:

> Roadmap visibility is limited — historically, no single artifact shows what each team is building
> for the next year.

> Monolith capacity is over-allocated — multiple workstreams book monolith/ERP team time without
> centralized coordination. Trade-off decisions require visible accounting of what's competing for
> the same engineering resources.

## What makes a bet a bet

Three things an initiative structurally cannot have:

1. **A claim that can be wrong** — a thesis, and kill criteria that say what would stop it.
2. **Declared money behind it** — an intended share of product capacity.
3. **A date when we re-decide** — a review date, and a recorded verdict when it concludes.

The governing rule, inherited from `Initiative` and worth stating out loud because every field below
obeys it:

> **Declared fields are intent. Everything factual is derived.**

A bet never carries dates, teams, or progress of its own. If a number can be computed from the epics
linked to it, it is computed — never typed in, never allowed to drift.

## The shape of a bet

### Entered — the claim

| Field | Type | Why it's there |
| --- | --- | --- |
| `thesis` | string | "We believe X produces Y because Z." The answer to "why bet here at all?" |
| `whyNow` | string | The timing or competitive window. A good thesis with no urgency is a someday-list entry. |
| `tier` | `foundational \| experiment` | The pyramid. The portfolio view warns above 3 foundational. |
| `theme` | `protect \| grow \| new-logos` | The cross-functional themes, modeled nowhere today. |
| `goalArea` | `product-strategy \| delivery \| gtm` | The three annual goal owners. |
| `sponsor` | string | The exec accountable. |
| `owner` | string (`OWNERS`) | The PM who submitted it. |
| `status` | `proposed \| committed \| active \| scaling \| paused \| concluded \| killed` | See the note below on kill state. |
| `horizon` | `HorizonKey` | Reuses `HORIZONS` ([`constants.ts:129`](../src/lib/loop/constants.ts)). |
| `confidence` | 1–5 | Same scale as the item field. |
| `value.statement` | string | What this is worth and to whom, in a sentence. |
| `value.type` | `new-revenue \| retained-revenue \| cost-to-serve \| strategic-option` | You cannot compare a revenue bet to an option bet without knowing which is which. |
| `value.magnitude` | number \| null | **Dollars** — ARR, retained revenue, or cost saved, per `type`. |
| `value.basis` | `modeled \| benchmarked \| analogous \| guess` | **Required whenever `magnitude` is set.** |
| `value.timeToValue` | number (quarters) | When the value lands. A 2-quarter and a 6-quarter payback are not the same bet. |
| `reversibility` | 1–5 | How cheaply we can stop. |
| `evidence` | `{ strength: 1–5, notes: string, links: string[] }` | What backs the thesis. |
| `outcomes` | `KeyResult[]` | The bet's **own** KPIs, entered directly. |
| `jtbdIds` | `string[]` | The **declared** surface area — ids from `JTBDS` ([`taxonomy.ts:61`](../src/lib/loop/taxonomy.ts)). |
| `plannedShare` | `Record<Exclude<HorizonKey, "unassigned">, number>` | Intended % of product capacity, per horizon. `HorizonKey` includes `"unassigned"` (`constants.ts:129`), for which a planned share has no meaning — exclude it in the type rather than relying on convention. |
| `killCriteria` | string | What would make us stop. |
| `nextReview` | ISO date | When we re-decide. |
| `decision` | `{ verdict, rationale, decidedAt }` | Recorded at conclusion. |
| `color` | string | Kept — drives the timeline band. |

Four of these deserve their reasoning stated — three because a reviewer will want to cut them, and
one because it's genuinely underspecified until someone decides.

**`value.magnitude` is dollars, not a T-shirt size.** A band (S/M/L) compresses away exactly the
differences the comparison exists to surface, and it makes the density ratio below decorative. The
objection — "PMs will just guess" — is real, and `value.basis` is the answer to it rather than a
reason to avoid the number.

**`value.basis` is the guardrail that makes asking for a dollar figure safe.** It mirrors the
`date_basis` convention the epic seed already uses (`planned` / `directional` / `actual`, see
[`docs/seed-redesign/3_epics.csv`](seed-redesign/3_epics.csv)). An undefendable number cannot sit
next to a modeled one unmarked, and a `guess` basis disqualifies the bet from the density ratio
entirely. The pressure this creates is the point: it's cheaper to go model the number than to have
your bet greyed out in the comparison.

**`reversibility` is the axis bets need and features don't.** It is not confidence. You can be
highly confident in an irreversible bet and moderately confident in one you can stop next month, and
those two deserve completely different evidence bars. Nothing in the existing item model captures
this.

**Kill state needs a decision `status` alone can't carry.** `Item` models this as three fields —
`killed: boolean`, `killedAt`, `killedReason` ([`types.ts:125`](../src/lib/loop/types.ts)) — whereas
the enum above folds it into `status: "killed"`. An enum value has no timestamp, and the portfolio
view below specifies a *"bets killed in the last 6–8 months"* tally, which needs one. Two options:
follow `Item` and carry `killedAt` / `killedReason` alongside `status`, or treat `decision`
(`{ verdict, rationale, decidedAt }`) as the single record for every terminal state — kill included —
with `verdict` typed `won | lost | inconclusive | killed-early`. **Recommend the second**: it keeps
one place to look for "how did this end and why," and it makes the decision-quality tally a query
over `decision`, not a scan across two competing representations. Either way the choice must be made
before the schema lands, because the tally depends on it.

### Derived — never entered

JTBDs, modules and domains actually touched · teams · date envelope · stage mix · epic count ·
funded share · reach · modernize-vs-new-value mix · ADO status rollup · every gap and health flag.

The existing helpers already do most of this and should be reused, not reimplemented:
`initiativeItems`, `initiativeTeams`, `initiativeEnvelope`, `initiativeProgress`
([`logic.ts:610-651`](../src/lib/loop/logic.ts)), `moduleJtbd` and `moduleDomainId`
([`taxonomy.ts:270-289`](../src/lib/loop/taxonomy.ts)), and the fiscal-quarter helpers
`FISCAL_START_MONTH` / `fiscalQuarterIndex` / `fiscalQuarterLabel`
([`logic.ts:464-500`](../src/lib/loop/logic.ts)).

## Nesting: Bet → JTBD → Epic

Two levels, and they are two *different kinds* of link. The difference is the whole payload of this
section.

- **JTBD = declared scope, top-down.** `Bet.jtbdIds`, hand-picked. This is the strategy
  statement: "this bet reshapes Registrations, Payments and Custom Fields."
- **Epic = actual investment, bottom-up.** `Item.betIds` — the existing `Item.initiativeIds` link,
  renamed (see Implementation). Every epic already carries `moduleId`, and `moduleJtbd()` rolls it up
  to a JTBD, so epics group under JTBDs for free. No re-tagging, no join table, no new taxonomy.

Below is the seeded Parent Experience Convergence initiative rendered as a bet. Everything unmarked
is real data from `seed-data.json`; the two `[illustrative]` lines are invented to show what the
flags look like, because nothing in the current seed triggers them.

```
Bet — Parent Experience Convergence        grow · foundational · Active · Now
  value  $1.4M retained ARR (basis: modeled)  [illustrative]
  KPI    parent-app WAU  0 → 12,000  (current 0)  [illustrative]
  planned 25% [illustrative]  ·  funded 6.5% (6 epics · 6 epic-qtrs of 93)  ·  5 teams
  Q2 FY27 → Q2 FY28

  ├─ Community & Media    declared   4 epics   1 Building, 1 Solutioning, 2 Capture
  │     Community — Family Engagement & Comms Service
  ├─ Registrations        declared   1 epic    Building         Core — Admin Workflows
  ├─ Custom Fields        declared   1 epic    Solutioning      Platform — Data & Integrations
  ├─ Payments             declared   1 epic    Solutioning      Core — Financial Services
  ├─ People & Orgs        declared   1 epic    Solutioning      Platform — Identity & Core Services
  └─ Alerts & Automation  ⚠ declared, 0 epics   ← claimed, nothing staffed   [illustrative]
```

Two notes on what the seed can and cannot show. The unstaffed-claim flag on `Alerts & Automation`
requires declaring a sixth JTBD nobody has staffed — invented here, though the Registration
worked example below fires the same flag on real data. And a *shared platform dependency* (one epic
enabling three or more bets) cannot occur in the current seed at all: there are only two
initiatives, so no epic can enable three. That signal is real but unexercisable until the portfolio
has more bets in it.

The tree is the easy half. The **reconciliation** is what makes it worth building — comparing the
declared JTBDs against where the epics actually landed produces two signals that exist nowhere
today:

- **Unstaffed claim** — a declared JTBD with zero linked epics. *"We say we're betting here and
  we've staffed nothing."*
- **Undeclared spend** — linked epics whose JTBD isn't declared. Scope drift, or the declaration
  went stale.

Both advisory, never blocking. That matches every other guardrail in Loop: the horizon-mismatch
badge (`horizonMismatch`, [`logic.ts:512`](../src/lib/loop/logic.ts)), dependency conflicts, and
ADO stage disagreement, which all flag and explain rather than prevent.

## Investment

### Planned

`plannedShare[horizon]` — an integer 0–100, the intended share of product capacity. Across all bets
in a horizon, warn when the sum exceeds 100 and render the remainder as **run-the-business**. That
single bar is the "visible accounting of what's competing for the same engineering resources" the
org is currently missing.

**PMs edit this. No lock, no approval gate.** What keeps it honest is visibility, not permission:
every bet's share sits on one bar against the run-the-business remainder, and the sum-past-100
warning is public. The consequence is worth naming — because anyone can raise their own share,
over-commitment is only ever detectable in aggregate, which makes the portfolio view load-bearing
rather than a nice-to-have.

**Apply the allocation math only to `foundational` bets.** With 4–5 bets per PM the portfolio runs to
roughly twenty, every share rounds to 5%, and the bar becomes twenty indistinguishable slivers.
Experiments carry a size and a review date but no share. This is the pyramid doing useful work
rather than being decoration.

### Actual, derived

- **Epic-quarter share.** Sum each funded epic's scheduled duration in fiscal quarters, then divide
  by the **total scheduled epic-quarters across the whole roadmap — bet and non-bet alike.** Reuse
  `fiscalQuarterIndex`. This weights a three-quarter epic above a one-quarter one, which the epic
  count doesn't.

  **Work still in the Capture inbox costs nothing**, dates or not. Capture is a holding lane, not a
  plan, and a parked idea carrying a speculative date would otherwise dilute the denominator every
  bet is measured against — filling the inbox would quietly shrink the apparent investment in
  everything real. Same reasoning that excludes killed items. See `itemQuarters` and `costedItems`
  ([`logic.ts`](../src/lib/loop/logic.ts)).

  **The denominator is the whole roadmap, not the sum of the bets.** Getting this wrong inverts the
  headline number: normalized against bets only, Parent Experience Convergence — the sole initiative
  with any links — is 100%, versus 6.5% of the portfolio. The portfolio denominator is the one that
  makes the run-the-business remainder coherent and keeps funded shares summing to ≤100.
- **Epic-count share.** Cruder, instant, worth showing beside it.
- **Per-team share.** For each team, what fraction of its dated work each bet consumes. This is the
  over-allocation view at the resolution where the trade-off actually bites.
- **Eng-quarter share** — the recommended follow-on. `docs/seed-redesign/4_teams.csv` has a `size`
  column (`"4 eng"`, `"5* eng"`) that `gen_taxonomy.py` currently drops; `Team` has no `size` field.
  Carrying it through turns "6.5% of epics" into "6.5% of engineers," which is the number an exec can
  act on. Caveat: the values are free text and need parsing, and one is asterisked.

Free from fields that already exist: every bet can show its **modernize / new-value / both** mix from
`Item.type` ([`constants.ts:23`](../src/lib/loop/constants.ts)). A foundational bet made entirely of
`modernize` epics is a modernization program, and it should be legible as one.

### The remainder is the headline

Run the numbers on today's seed and the point makes itself. 136 epics, all scheduled, of which 63
are still parked in the Capture inbox and cost nothing. That leaves **93 epic-quarters** of real
capacity. Parent Experience Convergence — the only initiative with any links at all — accounts for
**6 of them, 6.5%**. The other **93.5% belongs to no bet**.

That figure is not a data-quality gap to be cleaned up before the view is useful. It *is* the
finding: the roadmap is overwhelmingly run-the-business, and the strategic bets are a thin slice on
top. Label it *run-the-business*, never *unassigned*, and put it on the same bar as the bets. You
cannot see what's competing for engineering capacity until the baseline load is visible next to the
things competing with it.

## Comparing bets against one another

Bets have to be comparable. Choosing the 1–3 foundational ones is a comparison, and so is deciding
whether to move share from one to another.

**Do not lift `computeRank` ([`logic.ts`](../src/lib/loop/logic.ts)) up a level.** It was written to
sort ideas in a lane, not bets in a portfolio. (This argument originally led with `votes` — an intake
popularity signal that means nothing at portfolio level, since an exec bet doesn't get upvoted. Voting
was removed from Loop on 2026-08-07 and is no longer in the formula; the reason below is the one that
still decides it.) 1–5 integers tuned to sort twenty ideas inside one team's lane will cluster every
bet between 3.8 and
4.2, which launders judgment as arithmetic and decides nothing. That is precisely the failure the
Annie Duke framing in `Claude.md` is trying to avoid.

Comparison happens three ways instead, in increasing order of usefulness.

### 1. A table of axes, not a single score

One row per bet, sortable on any column, most of it derived:

| Bet | Value | Type | Basis | Time-to-value | Planned | Funded | Confidence | Reversibility | Evidence | Epics / epic-qtrs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Reading across a row *is* the comparison. A bet with a guessed magnitude, 2/5 evidence and 30% of
capacity is visibly a different animal from a benchmarked, prototype-backed bet at 10%, and no
arithmetic was required to see it.

### 2. One transparent ratio: value density

Base shape `(value.magnitude × confidence) ÷ plannedShare`, with each input carrying a **weight the
CPO can tune** — reusing the pattern already established for items: a weights blob in `settings`,
edited in a modal beside the existing ranking weights, formula rendered on the page.

Tunable rather than fixed because what makes a good bet genuinely changes. A defensive year weights
`reversibility` and `evidence` far above raw magnitude; an expansion year does the opposite. Making
that an explicit, visible, dated choice beats hard-coding a definition nobody agreed to.

Rules, stated on the page next to the number:

- It only compares bets sharing a `value.type`.
- It is greyed out when `basis` is `guess`.
- It sorts and provokes the conversation. **It never selects the foundational bets.**

Precedent for both halves already exists: the Loop README's *"the formula is shown; it isn't a black
box"*, and [`src/lib/ai/features/explain-rank.ts`](../src/lib/ai/features/explain-rank.ts), which
narrates a score rather than asserting it. A bet-level equivalent of that narrator is a cheap,
high-value follow-on.

### 3. The trade-off itself — already built

The real question is never "rank twenty bets." It's *"would you move 10% from Registration to Parent
Experience?"* `Scenario` already forks the entire `LoopState` and `diffStates`
([`logic.ts:721`](../src/lib/loop/logic.ts)) already diffs it, so a side-by-side allocation trade-off
needs no new machinery — only the bet fields added to the diff list (see Implementation). Two
scenarios beside each other, each with a valid allocation bar, is a better comparison than any
leaderboard.

### And the comparison that matters most is retrospective

Planned-vs-funded drift, plus KPI current-against-target over time, compares a bet to **its own
earlier claim**. That is the Annie Duke point: judge the decision, not just the outcome. Up-front
comparison decides the allocation; retrospective comparison decides whether the allocation was any
good, and it's the one that compounds.

## Resolving the double-count: funded vs. enabling links

`Item.initiativeIds` is plural and the modal happily puts one epic on several parents. The moment a
capacity share hangs off a bet, that becomes a correctness bug: an epic on three bets inflates
apparent portfolio investment threefold.

**The framing to reject first.** A multi-bet epic is not an accounting nuisance to suppress. It is
usually a shared platform module, and it's the most strategically interesting epic on the board —
several bets resting on one piece of work. The fix should make that visible, not hide it.

### One funder, many beneficiaries

Keep `Item.betIds` as-is for visibility. Add **`Item.fundedBetId: string | null`** — the single bet
whose budget this epic's quarters count against. Every other bet in `betIds` is *enabled by* the
epic rather than paying for it.

Store it on the **epic, not the bet.** A `bet.fundedEpicIds` list would let two bets claim the same
epic and reintroduce the conflict; one field on the epic makes exclusivity structural rather than
something validation has to police forever.

### Defaults, so nobody has to think about it

This is what kills the "nobody will maintain it" objection that sank fractional weights:

- Epic linked to exactly one bet → `fundedBetId` **auto-sets** to it. The overwhelmingly common case
  needs zero human input.
- Epic gains a second bet link → the modal asks once, pre-selected to the current funder. One click.
- Epic with no bet → `fundedBetId` stays null and its quarters roll into **run-the-business**. The
  default state is therefore honest rather than broken, and it populates the baseline number above.

**Invariant:** `fundedBetId`, when set, must appear in `betIds`. Enforce it where this repo already
enforces this kind of thing — `migrateItems` ([`logic.ts:82`](../src/lib/loop/logic.ts), which
already backfills `initiativeIds` at line 111) clears a dangling value on read. Unlinking the funding
bet in the UI clears the field and falls back to the auto-set rule.

### Two numbers per bet, never blended

- **Funded share** — epic-quarters where `fundedBetId === bet.id`, over the whole-roadmap denominator
  above. Sums to ≤100 across bets, with run-the-business making up the difference. This is *the*
  allocation number, and the only one ever compared against `plannedShare`.
- **Reach** — every epic in `betIds`, enabling ones included. Can exceed the funded share, and is
  labelled to say so: *"funded 12% · reaches work totalling 19%."*

An exec wants both: what this bet costs, and how much work it leans on.

### Then the bug becomes two signals worth having

- An epic enabling three or more bets is a **shared platform dependency** — surface it on all three
  bet details ("three bets rest on this epic"). Concentration risk that is completely invisible today.
- It's also a hygiene nudge. Sometimes an epic serving three bets is simply too big and wants
  splitting. Sometimes — a unified household model, say — it genuinely is one piece of leverage and
  splitting it would manufacture fake work items. Flag it, let a human judge, never auto-split.

Two notes for whoever builds this. Keep enabling links **distinct from `Item.dependsOn`** — that is
epic→epic sequencing, this is epic→bet value contribution, and conflating them will put nonsense on
the timeline. And note the latent bug this also fixes: `initiativeTeams` and `initiativeProgress`
already double count across initiatives today. Nobody has noticed because there are two initiatives
and eight links.

## Bet detail — the six blocks

Ordered so that reading top to bottom answers *"should we keep funding this?"*

1. **The claim** — thesis, why now, tier, theme, goal area, sponsor and owner, status, horizon,
   confidence, reversibility, evidence strength.
2. **The measure** — the value statement with its type, magnitude and basis; and the bet's own KPIs
   as baseline → current → target.
3. **The scope** — declared JTBDs with epic counts, the unstaffed-claim and undeclared-spend flags,
   domains and modules touched, shared platform dependencies called out.
4. **The investment** — planned vs funded per horizon, reach beside it, epic-quarters, the
   per-quarter shape of the spend, teams and each one's share.
5. **The delivery state** — epics by stage as a bar, the derived date envelope, ADO status rolled up
   across epics and their sub-items, and an at-risk count (unscheduled epics, horizon mismatches,
   dependency conflicts).
6. **The decision** — kill criteria, next review date, and once concluded the verdict and rationale,
   plus `whatWeLearned` / `whatWeDoDifferently` / `nextBet` rolled up from the linked epics
   ([`types.ts:122`](../src/lib/loop/types.ts)).

### A bet's value does not aggregate from its epics

Block 2 states the bet's own KPIs, entered directly on the bet. They are never rolled up from the
linked epics' KRs, and this is deliberate: an epic KR measures whether one piece of work moved its
own metric, and summing a dozen of them does not produce a portfolio-legible number. Different
denominators, different time horizons, different units. The two layers sit side by side and neither
derives from the other.

Epic-KR coverage is still worth knowing — *"3 of 8 linked epics have no KR"* is a real framing-quality
signal. It belongs in the health strip as hygiene, not in the bet's measure.

## Portfolio view — what an exec sees before opening anything

- Bets ranked by planned share, with the pyramid check (warn above 3 foundational).
- One horizon allocation bar: every bet, plus the run-the-business remainder.
- Theme mix — protect / grow / new logos — as a share of planned investment.
- Modernize vs new-value mix across the portfolio.
- A health strip per bet: has a KPI · has kill criteria · review overdue · unstaffed claims ·
  planned-vs-funded delta · share of linked epics carrying their own KR.
- A decision-quality tally: bets killed in the last 6–8 months, against `Claude.md`'s "at least one
  losing bet" target. A portfolio where nothing has ever been killed is not a portfolio of bets.

## Implementation notes

Verified against the code as of this writing. These are the things that will otherwise be
rediscovered the hard way.

- **Rename `Initiative` → `Bet` and `Item.initiativeIds` → `betIds`,** but keep the `initiatives`
  table ([`schema.ts:34`](../src/lib/schema.ts)) and the `/api/initiatives` routes. Rows are lossless
  JSON blobs, so new fields need **no DB migration**. Backfill `betIds` in `migrateItems`
  (`logic.ts:82`, where `initiativeIds` is already defaulted at line 111), the same way
  `STAGE_MIGRATION` handles retired stage names.
- **`normalizeInitiatives` ([`logic.ts:582`](../src/lib/loop/logic.ts)) whitelists fields explicitly
  and silently drops everything else** — that's how a legacy `segments` blob was retired. Every new
  bet field must be added there or it will work in memory and vanish on reload or import. This is
  the single easiest thing to get wrong.
- **`diffStates` ([`logic.ts:721`](../src/lib/loop/logic.ts)) diffs initiatives against a hardcoded
  inline list** — `["title", "description", "color"]` at line 741. Bet fields must be added there or
  scenario compare goes blind to exactly the changes that matter, which would quietly break the
  allocation trade-off described above. Items use a separate whitelist, `DIFF_ITEM_FIELDS` at line
  670 — `fundedBetId` and `betIds` belong in it. `CompareDrawer.tsx:125` already labels added items
  "New bets", so the vocabulary is half there already.
- **Bet weights are the one piece needing a real DB migration.** Everything else rides in existing
  `jsonb` blobs, but `settings` ([`schema.ts:82`](../src/lib/schema.ts)) has exactly one typed column,
  `weights: jsonb().$type<Weights>()`, consumed by `computeRank`. Add a separate `betWeights` column
  (`npm run db:generate && npm run db:push`) rather than widening `Weights` — conflating them would
  leak bet fields into the item ranking type. `/api/settings/route.ts` and `SettingsModal.tsx` extend
  to carry it.
- **New `ViewKey: "bets"`** for the portfolio view (`ViewKey` at
  [`constants.ts:172`](../src/lib/loop/constants.ts), wired through `LoopApp.tsx:52` and the view
  switch at 563–566). Rename `GroupByKey`'s `"initiative"` to `"bet"` (`constants.ts:177`), which
  touches `TimelineView.tsx:177-196`, `TeamView`, `GROUP_BYS` at `LoopApp.tsx:65`, and
  `store.tsx`'s `initialGroupBy`.
- **`taxonomy.ts` and `seed-data.json` are generated — do not hand-edit.** Both say so at the top.
  Bet seed data belongs in the `INITIATIVES` literal and `INIT_BY_TITLE` map inside
  [`docs/seed-redesign/build_import.py`](seed-redesign/build_import.py); `Team.size` belongs in
  `gen_taxonomy.py`. Anything edited in the output is lost on the next regeneration.
- **Rebuild `InitiativeModal.tsx` as `BetModal.tsx`.** Reuse the `ModuleSelect.tsx` pattern for
  the JTBD multi-picker, and the existing `dep-chips` / `dep-search` markup for epic linking — the
  initiative modal already has both.
- **`/api/import` has a deliberate guard that the rename interacts with.** It replaces initiatives
  only when the payload carries them, so legacy exports that predate the feature don't wipe existing
  rows (`src/app/api/import/route.ts`, lines 27–31). Preserve that behaviour for bets, and note that
  `Loop/loop-data.json` is a `loop-v2` export with no `initiatives` key at all — it's the case the
  guard exists for.

### Complete list of files referencing initiatives

`grep -rl initiative src` returns 25 files. All of them are in scope for the rename; the list is
here so it can be worked through rather than rediscovered:

| Area | Files |
| --- | --- |
| Types & schema | `lib/loop/types.ts`, `lib/schema.ts`, `lib/loop/constants.ts` |
| Logic | `lib/loop/logic.ts`, `lib/loop/store.ts`, `lib/loop/seed.ts` |
| API | `api/initiatives/route.ts`, `api/initiatives/[id]/route.ts`, `api/import/route.ts` |
| Pages | `app/page.tsx`, `app/share/[token]/page.tsx` |
| Components | `LoopApp.tsx`, `store.tsx`, `mutations.ts`, `InitiativeModal.tsx`, `DetailModal.tsx`, `CaptureModal.tsx`, `TimelineView.tsx`, `TeamView.tsx`, `CompareDrawer.tsx` |
| Integrations | `lib/aha/map.ts` |
| Tests | `lib/loop/seed.test.ts`, `lib/loop/logic.test.ts`, `components/loop/mutations.test.ts`, `lib/ado/sync.test.ts` |

`app/preview/page.tsx` is not on the list — it passes `groupBy="domain"` and so is untouched by the
`"initiative"` → `"bet"` grouping rename, but it renders `seed-data.json` directly and will show
whatever the regenerated seed contains.

### Tests the new behaviour needs

The existing suites assert the current shape and will need updating; these are the cases that don't
exist yet and carry the actual risk:

- **Funded-share math** — the whole-roadmap denominator, including that funded shares across bets
  sum to ≤100 and that run-the-business makes up the remainder exactly.
- **The `fundedBetId ∈ betIds` invariant** — a dangling funder is cleared on read by `migrateItems`.
- **The auto-set default** — one bet link sets the funder; a second link leaves the existing funder
  untouched rather than reassigning it; unlinking the funder falls back to auto-set.
- **Reach vs funded** — an epic enabling two bets counts once in funded and twice in reach.
- **Reconciliation flags** — unstaffed claim fires on a declared JTBD with no epics; undeclared
  spend fires on a linked epic whose JTBD isn't declared.
- **`normalizeInitiatives` / `normalizeBets` round-trip** — every new field survives export → import,
  which is the failure mode the whitelist creates.
- **`diffStates`** — a changed `plannedShare` or `fundedBetId` shows up in a scenario diff.
- **Epic-quarter arithmetic against the fiscal calendar** — an epic spanning a fiscal-year boundary
  (e.g. `2027-12-01` → `2028-02-29`, which is Q2 FY28) counts as one quarter, not five.
- **`Claude.md` is duplicated end to end** (lines 1–329 and 331–682, the second copy adding an
  Organizational Structure section). If bet vocabulary lands there, fix the duplication first rather
  than writing everything twice.

## Worked examples

Both seeded initiatives, restated as bets. Values marked *illustrative* are placeholders for a PM to
fill; everything else is real data from the current seed.

### Parent Experience Convergence — a foundational bet

| | |
| --- | --- |
| Thesis | Families are split across Camp inTouch and Campanion, and neither is a coherent product. Converging on one parent app raises engagement enough to protect renewal at the parent-perception layer. |
| Why now | Both apps need modernization regardless; doing it twice is the expensive path. |
| Tier / theme / goal | foundational · protect · product-strategy |
| Status / horizon | active · now |
| Value | retained ARR *(illustrative — needs a modeled basis)* |
| KPI | parent-app WAU: baseline 0 → target 12,000 *(illustrative)* |
| Reversibility | 2/5 — retiring Camp inTouch is a one-way door |
| Declared JTBDs | `community-media`, `registrations`, `custom-fields`, `payments`, `people-orgs` — the five its epics actually land in, so no unstaffed-claim flag fires. (The tree above adds `alerts-automation` as an invented sixth to show the flag.) |
| **Derived** | 6 epics · 6 epic-quarters · **funded 6.5%** of 93 · 5 teams · Q2 FY27 → Q2 FY28 (2 further linked epics are still in Capture and cost nothing yet) |
| Teams | Community — Family Engagement & Comms Service · Core — Admin Workflows · Platform — Data & Integrations · Core — Financial Services · Platform — Identity & Core Services |
| Type mix | 3 modernize · 1 new-value · 4 both |
| Kill criteria | *(to be written — currently absent, and its absence is the point)* |

This bet is already in decent shape structurally: five JTBDs, five teams, a coherent phasing from
Deliver work now through retirement of Camp inTouch in Q2 FY28. What it lacks is every field that
makes it a bet — no thesis on record, no value magnitude, no KPI, no kill criteria, no review date.
The description does the work of all of them in prose.

### Registration — the unstaffed-claim example

Seeded description: *"Umbrella initiative modernizing registration end to end — forms, payment, and
additional options/sessions — coordinated across teams."*

**Linked epics: zero.** Declare `registrations`, `payments` and `custom-fields` on it and every
declared JTBD fires the unstaffed-claim flag on day one. Funded share: 0%. Planned share: whatever
someone types.

This is not a contrived example — it's the current state of the roadmap, and it's the single clearest
illustration of why the reconciliation matters. Today an initiative with no work under it looks
identical to one with eight epics: same chip, same color, same band on the timeline. Under this
model it reads as *"claimed, nothing staffed."*

## Decisions

### Settled

- **JTBDs are declared on the bet** and reconciled against where the epics land, rather than purely
  derived. Derivation alone can't express intent, so there'd be no gap to detect.
- **Investment is planned share vs derived actual**, not team-quarter bookkeeping and not timesheets.
- **`plannedShare` is PM-editable.** Visibility keeps it honest, not permission.
- **A bet carries its own value and KPIs**, entered directly, never aggregated from epic KRs. Bets
  stay outside the item-level weighted-sum rank but remain fully comparable to each other on the
  structured axes and the density ratio.
- **Value magnitude is dollars with a required basis.** Not bands.
- **The density formula runs on CPO-tunable weights**, displayed wherever the ratio appears.
- **One funder per epic (`fundedBetId`), auto-defaulted**, with other links recorded as enabling.

### Still open

- **Reclaiming stranded data.** `stance` (Must Win / Differentiator / Table Stakes /
  Optional-Deferable / Nice-to-Have) exists only in `docs/seed-redesign/*.csv`; `build_import.py`
  compresses it into `strategicFit` via `STANCE_FIT` and narrates the rest into the `activity` log. A
  bet that could show its stance mix — a "foundational" bet made entirely of Table Stakes epics is a
  catch-up program, not a bet — would be sharper. That needs re-plumbing into `Item`. (The JTBD layer
  itself is no longer stranded: it is `JTBDS` in `taxonomy.ts`, and an epic's `moduleId` rolls up to
  it via `moduleJtbd()`.) **Recommend deferring**: the bets layer is
  useful without them, and each is its own change with its own seed-pipeline implications.
- **Whether bets get an ADO counterpart.** **Recommend no.** Loop items already sit at the ADO epic
  level and sub-items carry the work-item links. A bet is strategy, and
  [`Loop/INTEGRATIONS.md`](../../Loop/INTEGRATIONS.md) is explicit that Loop references other systems
  rather than duplicating them.
- **Whether `plannedShare` is per-horizon or per-fiscal-quarter.** Per-horizon is proposed above
  because it matches how the rest of Loop thinks. Per-quarter would line up with the Rhythm of
  Business calendar and the `quarter` column in the epic seed, at the cost of far more upkeep.
