# Aligning Loop to the AI-Native Product Process

Status: **superseded on the rename (Aug 2026); the rest still stands.**

> **What actually happened to the board states.** Objection 3 was answered, but not with the six
> guild-vocabulary columns proposed below. The stages were instead aligned to the **Headlights**
> process — the monthly rolling 3-month planning review product and engineering leadership already
> runs: `Discovery / Solutioning / Building / Releasing`, with the existing **Capture** lane kept
> ahead of them as an inbox rather than promoted into the lifecycle. Old stages map
> `Frame + Validate → Solutioning`, `Deliver → Building`, `Learn → Releasing`; Capture stays put.
> That keeps the answer to objection 2 (intake) visible as its own lane, explicitly outside the
> board leadership forecasts against, and costing no capacity until someone promotes it. The reasoning is the same one this document argues from — the board should
> speak a vocabulary the company already agreed, not one a tool invented — applied to the ceremony
> leadership actually reviews the portfolio in. Read the rename table below as the option that was
> considered and not taken; everything else here (voting, capture-as-intake, the deferred items) is
> unaffected.

This is the model to argue with before any code is written.

**Scope of this document.** It answers the three objections raised against rolling Loop out, and
nothing else. An earlier draft grew into a seven-change program — enforced validation gates, a new
Opportunities Register integration, WIP limits, a parked state, StatsBar retargeting, a Learn-loop
write path — much of it dependent on a repo Loop does not own and on a cross-functional process
decision nobody has made. That was scope creep past the brief. Those ideas are recorded at the bottom
as deferred rather than deleted, and none of them should be built as a condition of the rename.

The three objections:

1. **Voting** — "I generally don't like the concept."
2. **Capture as intake** — concern about "dysfunctions getting systemized."
3. **Board states** — the stages read as "an entirely new outline" for the product process.

## Why

Loop's board runs on five stages that exist nowhere else in the company:

```ts
export const STAGES = ["Capture", "Frame", "Validate", "Deliver", "Learn"] as const;
```

([`src/lib/loop/constants.ts:6`](../src/lib/loop/constants.ts))

That is the substance of objection 3. `Capture → Frame → Validate → Deliver → Learn` reads as a new
outline for the product process, proposed by a tool rather than agreed by the company.

The useful discovery is that Loop did not invent this process. It is a near-match for one the
Product/Technology Guild published in July 2026: [The AI-Native Product
Process](https://app.notion.com/p/39ed23fa124b81a98dd5d48dd0426c39). Four of Loop's five stages map
onto its phases, one phase is missing from Loop, and the vocabulary differs. Aligning to it converts
"we invented a process" into "we built a working surface for the process the guild already wrote,"
which is a materially different conversation.

## The decision underneath this one

Campminder has two written processes, and they are not two descriptions of the same thing.

| | [Unified SDLC v2.0](https://app.notion.com/p/2b5d23fa124b80e68887e20dbd50d141) (Dec 2025, Delivery Ops) | [AI-Native Product Process](https://app.notion.com/p/39ed23fa124b81a98dd5d48dd0426c39) (Jul 2026, Product/Tech Guild) |
| --- | --- | --- |
| Phases | Discover → Define → Planning → Deliver → Deploy → Release → Monitor | Signal→Mountains→Discovery → Prototype→Validate → Design→Handoff → GTM→Outcomes |
| Prototyping before build | Not modeled. Define produces requirements, Planning sequences them. | The centre of the process. 3–5 throwaway prototypes precede any ADO ticket. |
| Launch Control / Go-No-Go / Deploy | Mandatory, explicitly non-tailorable | Absent |
| Status | Settled, cross-functional, has RACI | Summary page "Maintained"; most concept pages "Draft" |

Loop cannot align to both as peers. It can align to both if they are scoped as complementary:

> **The AI-Native Product Process owns Phases 1–2 — signal through customer validation. The Unified
> SDLC owns everything from Planning and Launch Control onward. Loop is the working surface for the
> first half and a read-only mirror of the second.**

The AI-Native process already describes itself this way — as "the product-side front-end to the
existing [AI-Native Workflow](https://app.notion.com/p/36dd23fa124b812798f5e90fe94ccc08) engineering
pipeline, which it feeds without modifying," entering at the Phase 3 seam.

This section stays because objection 3's answer depends on it: claiming the board renders the guild's
process is only true if we can say how that process relates to the SDLC. **It is a cross-functional
call between the CPO, the guild, and Delivery Ops.** If the answer is instead "the Unified SDLC
governs end to end," the rename below is wrong and the board should read `Discover / Define`.

## Objection 3 — the rename

| Loop stage today | AI-Native Product Process | Proposed stage |
| --- | --- | --- |
| Capture | Phase 1 pre-promotion — the Opportunities Register ("mountains") | **Signal** |
| Frame | Phase 1 post-promotion — `/discovery-brief` | **Discovery** |
| Validate | Phase 2 — `divergent-prototyping` + Product-Led Customer Validation | **Validation** |
| *(nothing)* | Phase 3a — `design-finalize`, refinement to production fidelity | **Design** |
| Deliver | Phase 3b — ADO handoff and the engineering pipeline | **Delivery** |
| Learn | Phase 4 — GTM, outcomes re-entering `/synthesize-opportunities` | **Outcome** |

Six columns rather than five. The added Design column is deliberate: Gate 2 (Design-final) in [The
Three Validation Gates](https://app.notion.com/p/39ed23fa124b81188e87e595f533723a) is a defined human
checkpoint with nowhere to live in Loop today, and `design-finalize` is flagged in the source as not
yet implemented. A visible column makes that gap legible instead of hiding it.

**Alternative considered:** keep five columns and fold Design into Delivery. Rejected — it puts a
product gate inside a column Loop only mirrors from ADO, and it re-hides the exact seam that most
needs to be explicit.

An empty Design column early is correct, not a gap. Design enters only after convergence, per
Product-Led Customer Validation — product carries the divergent prototypes to customers itself.
Worth stating explicitly so nobody reads the emptiness as a staffing problem.

This is a rename plus one new column. It is not a re-plumbing of what the columns do.

## Objection 1 — voting is removed from the product, the data is kept

**Resolved 2026-08-07: voting is gone from Loop.** Every affordance — the card `+1`, the detail
modal's Votes field, the share-link count, the `+1` celebration, the Votes weight slider — is removed,
and the `votes × w` term is out of `computeRank`. The two configuration toggles below were never
built, and are not going to be.

What changed since the configurable design: nobody wanted the setting. A toggle defaulting to
off, hidden, and out-of-rank is a feature whose recommended state is "invisible," which is a
maintenance surface (a config table, a second context, ten conditional touchpoints, a share-link
default) bought to preserve an option no one asked to exercise. Removing the affordances outright
reaches the same shipped behavior with less code and no migration.

**The data layer is untouched, deliberately.** `Item.votes` and `Weights.votes` still exist and the
Aha! webhook still syncs endorsements into `votes` by delta. Aha! owns that number; discarding it
would make it unrecoverable, and keeping it means this removal is losslessly reversible. Nothing in
the UI reads or writes it.

**The one thing that had to reach past the UI:** hiding the input while leaving `votes × w` in the
formula would leave the roadmap driven by a signal nobody can see, which is worse than showing it. So
the term is dropped from the score and from the `explain-rank` payload, and `logic.test.ts` carries a
guard asserting that neither `item.votes` nor a stored `weights.votes` can move a rank.

**Weights survive as a concept.** The tuning UI is what lets someone answer "why is this ranked
here?", so reach / confidence / strategic fit keep their sliders — only the Votes slider goes. The
stored `weights.votes` value is left as-is rather than zeroed, so the tuning returns intact if voting
ever does.

This also lands where the [Opportunities Register](https://app.notion.com/p/39ed23fa124b81a2b2e0fb0bb9b5fa11)
rubric already was: additive reach + pain + fit, no vote term, so "no single loud account can fake a
mountain's score."

### Superseded — the configurable design (2026-08-04)

Kept for the reasoning, not as a plan of record. An earlier draft deleted voting *and* the `Weights`
tuning UI outright; that was reversed in favour of two settings specified in
[`settings-tab.md`](./settings-tab.md), on the grounds that the objection is that a popularity number
quietly drives the roadmap, not that the number must be destroyed:

- **`votingEnabled`** — whether anyone can click +1 at all.
- **`voteCountsVisible`** — whether counts render anywhere, including on a shared link.

Recommended default: voting off, counts hidden, votes out of rank. The 2026-08-07 decision keeps that
end state and drops the toggles that would have made it optional. The part of the argument that
survived intact is the data-retention one — never destroy the Aha! count on a display decision.

The field-input intent behind voting still needs a home, and the process already supplies one: the
Gate 1 review is the forum for Sales, CX, and Support leadership. They attend bringing customer
evidence, not votes. That preserves the original reason voting existed — getting the field involved
at a roadmap readout — while attaching it to a checkpoint the process mandates.

## Objection 2 — Signal is a promotion decision, not a front door

Loop's Capture column is a place ideas are born. That makes it an additional intake alongside ones
that already exist: Aha!/ProductBoard, the Feedback Ingestion Pipeline → Prioritization Rubric →
Triage Board chain, and the Opportunities Register itself. Campminder's own wiki flags the
unreconciled overlap as an open question, and it is the substance behind this objection.

The answer does not require building anything. It requires being clear about what the column is for:

> **Signal → Discovery is the promotion decision.** Phase 1 names exactly one human judgment — a PM
> picking a mountain off the ranked list — and Loop's board is the UI for it.

Three commitments, in descending order of how cheap they are:

1. **Signal is renamed and reframed as a queue to promote from, not a form to fill in.** Copy change
   plus intent, no integration.
2. **Direct capture survives as a marked exception.** A genuine idea with no upstream home will
   occur. Keep it, mark such items visibly as register-less, and treat the count of them as a metric —
   if it climbs, the upstream register is not doing its job.
3. **Reading the register is deferred.** Making Signal display canonical mountains from
   `product/opportunities/opportunities.yaml` in `campminder-product-os` would be the strongest
   version of this, and it is an L-effort integration against a repo Loop does not own. It is not a
   precondition for answering the objection.

**The residual is real and worth stating plainly:** `POST /api/webhooks/aha`
([`route.ts`](../src/app/api/webhooks/aha/route.ts)) creates Loop items directly from a
customer-facing portal, bypassing PM/UX. Until that is re-pointed upstream — a change to a repo owned
elsewhere — capture is not PM/UX-only in practice, whatever the board says.

## What this does to the three objections

| Objection | Resolution | Residual |
| --- | --- | --- |
| **Voting** — "I generally don't like the concept" | Removed from the product (2026-08-07): no affordances, and the votes term is out of the rank score. `votes` stays in the data layer so the Aha! endorsement count keeps syncing and the removal is reversible. | The field-input intent moves to Gate 1, as evidence. |
| **Capture** — "dysfunctions getting systemized" | Signal is reframed as the promotion decision; direct capture becomes a marked, counted exception. | The Aha! webhook still writes directly into Loop. Must be re-pointed upstream. |
| **Board states** — "an entirely new outline" | Not new. Four of five stages map to published phases; adopting the phase names and adding Design makes the board a rendering of the guild's process. | The guild's process is itself mostly `Draft` and does not cover Launch Control. Hence the scoping decision above. |

## Decisions

### Settled

- **Six columns, not five.** `Signal / Discovery / Validation / Design / Delivery / Outcome`. The
  Design column exists to give Gate 2 a home and to make the unimplemented `design-finalize` visible.
- **Voting is removed from the product; the data is kept.** *(Revised 2026-08-07 — this bullet
  previously read "configurable, not deleted." The toggles were never built.)* No vote affordances
  anywhere, and the votes term is out of the rank formula, not just the UI. `Item.votes`,
  `Weights.votes`, and the Aha! delta sync stay, so Aha!'s number survives and the removal is
  reversible. Reach / confidence / strategic fit keep their weight sliders.
- **Signal is the promotion decision.** The column is a queue to promote from, not an intake form.
- **Direct capture survives as a marked exception**, and the count of register-less items is itself a
  metric.
- **This document is a rename plus one column.** Anything that changes what a column *does* is out of
  scope for it.

### Deferred, not rejected

Recorded so the thinking is recoverable. Each was specified in the earlier draft; none is a response
to the three objections, and none should gate the rename.

- **Enforcing the three validation gates as transition conditions**, including hard-blocking `adoUrl`
  behind Gate 1 with a logged override. The strongest idea in the earlier draft — it converts [Only
  Customer-Validated Prototypes Enter ADO](https://app.notion.com/p/39ed23fa124b81418f0dce0d4cd47fe3)
  from a written decision into a mechanism. Worth its own doc.
- **Adopting the additive reach + pain + fit rubric**, which would add the missing `pain` axis and
  drop `confidence`. Genuinely better alignment; blocked behind rescaling seeded values to 1–5 and now
  in tension with keeping weights configurable.
- **Reading the Opportunities Register** to populate Signal. Depends on `campminder-product-os` access.
- **An `axis` field on prototypes**, to record the single dimension a prototype set varies. Cheap (S)
  and the actual discipline of divergent prototyping; nothing in Loop records it today.
- **A parked state distinct from `killed`**, plus a discovery WIP limit of 3. Parked items must be
  excluded from `killRate` or they pollute the kill-rate metric.
- **Retargeting StatsBar at the process's 80% kill-rate target**, scoped to items actually prototyped.
- **Writing outcomes back to `feedback/summaries/`** so the Learn loop closes. Depends on the same repo
  access.

### Still open

- **Which process governs which phase.** The scoping above — AI-Native for Phases 1–2, Unified SDLC
  from Planning onward — is what this document rests on. Nothing should be built until it is made.
- **Re-pointing the Aha! webhook**, which is the live residual under objection 2.
- **Whether the shared roadmap view uses these stage names at all.** It should almost certainly show
  no stage vocabulary whatsoever — that is the point of separating publish from share. Specified in
  [`settings-tab.md`](./settings-tab.md); noted here so the two designs do not contradict each other.
  Practically, this means the rename gates the internal board, not the shared view.
