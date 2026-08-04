# Aligning Loop to the AI-Native Product Process

Status: design, not built. This is the model to argue with before any code is written.

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

## Objection 1 — voting becomes configurable, not deleted

An earlier draft resolved this by deleting voting *and* the `Weights` tuning UI outright, on the
grounds that the [Opportunities Register](https://app.notion.com/p/39ed23fa124b81a2b2e0fb0bb9b5fa11)
rubric is additive reach + pain + fit with no vote term. That over-answered the objection: the
concern is that a popularity number quietly drives the roadmap, not that the number must be
destroyed.

**Votes and weights stay in the model and become configurable.** Two settings, specified in
[`settings-tab.md`](./settings-tab.md) — a sibling design doc landing on its own branch, so this link
resolves once both are merged:

- **`votingEnabled`** — whether anyone can click +1 at all.
- **`voteCountsVisible`** — whether counts render anywhere, including on a shared link.

And the part that makes it a real answer rather than a cosmetic one: **when vote counts are hidden,
the votes term drops out of the rank score.** Hiding the input while leaving `votes × w` in the
formula would leave the roadmap driven by a signal nobody can see, which is worse than showing it.
The Votes weight slider disables with a note when counts are hidden.

Why configure rather than delete:

- **The rubric's argument survives intact.** The additive design exists so "no single loud account can
  fake a mountain's score." Defaulting a Campminder workspace to votes-hidden and votes-out-of-rank
  honors that instinct exactly, without a feature removal.
- **Nothing is destroyed, so nothing needs migrating.** Aha! endorsements keep syncing into `votes` by
  delta, invisibly. A display toggle that discarded them would make Aha!'s number unrecoverable.
- **Weights stay defensible.** The tuning UI is what lets someone answer "why is this ranked here?"
  Deleting it to prevent misuse removes the mechanism that makes rank arguable.

**Recommended default: voting off, counts hidden, votes out of rank.** That is the CPO's position as
the shipped default — the difference is that it is a setting, and reversible, rather than a deletion.

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
| **Voting** — "I generally don't like the concept" | Configurable, defaulting to off and out of the rank score. The rubric's anti-distortion argument is honored as a default rather than enforced by deletion. | The field-input intent moves to Gate 1, as evidence. |
| **Capture** — "dysfunctions getting systemized" | Signal is reframed as the promotion decision; direct capture becomes a marked, counted exception. | The Aha! webhook still writes directly into Loop. Must be re-pointed upstream. |
| **Board states** — "an entirely new outline" | Not new. Four of five stages map to published phases; adopting the phase names and adding Design makes the board a rendering of the guild's process. | The guild's process is itself mostly `Draft` and does not cover Launch Control. Hence the scoping decision above. |

## Decisions

### Settled

- **Six columns, not five.** `Signal / Discovery / Validation / Design / Delivery / Outcome`. The
  Design column exists to give Gate 2 a home and to make the unimplemented `design-finalize` visible.
- **Votes and weights are configurable, not deleted.** Default off, counts hidden, votes out of the
  rank score. Hiding counts must drop the votes term from the formula, not just the UI.
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
