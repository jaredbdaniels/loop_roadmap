# Narrative view — the roadmap as a story, shareable

Status: **design.** Nothing here is built. One piece of it — a roadmap summariser — exists, is
buried, and cannot see strategy.

Companion to [`strategic-bets.md`](./strategic-bets.md) (the model) and
[`bet-detail.md`](./bet-detail.md) (how one bet is read). This specifies how the **whole roadmap** is
read, by someone who was not in the room. Where this document and the code disagree, the code is
authoritative.

---

## Why

Loop can already answer *what are we building.* Four views cut the same 136 epics by lane, by time,
by horizon and by team ([`LoopApp.tsx:48`](../src/components/loop/LoopApp.tsx)). None of them answers
*why, in what order, and what has to be true for it to work* — which is every question an exec, a
board, a new hire, and a CSM actually arrive with.

There is one narrative generator today and three things are wrong with it:

- **It cannot see strategy.** `/api/ai/summary` receives `title, mission, stage, horizon, kr, window`
  per item ([`ShareModal.tsx:44`](../src/components/loop/ShareModal.tsx)). Bets are not in the
  payload. The one component in Loop that writes prose is structurally incapable of mentioning a bet.
- **It is buried inside the share dialog**, where you go to manage a link, not to write anything.
- **Its output goes nowhere.** It renders into local state and is lost on close. You cannot send it,
  cite it, or compare it against what you said last quarter.

The prompt itself is sound — *"group by horizon, lead with outcomes, call out risks, no invented
status"* ([`summary.ts:22`](../src/lib/ai/features/summary.ts)). It is aimed at the wrong altitude
and starved of the data that would make it interesting.

---

## The governing principle

> **The structure is code. The prose is AI. The numbers are injected, never generated.**

A model must never decide the *shape* of the narrative, because the shape is the argument. It must
never produce a *number*, because a plausible wrong number in a board document is the worst failure
this feature can have.

Three consequences, all load-bearing:

1. **Every section has a deterministic rendering that is correct without AI.** `aiEnabled()` already
   gates every AI route ([`handler.ts`](../src/lib/ai/handler.ts)); with the flag off, the narrative
   still renders — plainer, complete, correct. AI improves prose. It is never structural.
2. **Facts are injected as pre-rendered tokens** and the model is told to reproduce them verbatim.
3. **A numeric fidelity check runs on every generation.** Extract every numeric literal from the
   generated prose; assert each appears in the injected fact set. On failure, discard the generation
   and fall back to the deterministic text. This is a cheap, testable guard against the one failure
   mode that would make the feature unusable.

---

## What a human owns, and what regenerates

This is the decision that makes the narrative a **shared artifact the team argues about** rather than
a button that produces text. Get it wrong in either direction and the feature fails: all-generated
and nobody trusts it; all-authored and it goes stale in a fortnight.

| Part | Owner | Behaviour |
| --- | --- | --- |
| **The spine** — one sentence | Human | Sticky. Survives every regeneration. Versioned with a date and an author. |
| **Why now** — the forces | Human | Sticky, same treatment. |
| The acts / horizon grouping | Derived | Recomputed from horizons and milestones every time. |
| Bet summaries | Derived | The lede from [`bet-detail.md`](./bet-detail.md), quoted verbatim. |
| What people see and when | Derived | Milestones, ordered. |
| The tensions | Rules | Deterministic detection; generated framing. |
| The numbers | Derived | Always. Never generated, never editable. |

The spine and the why-now are the two things a model genuinely cannot know, and the two things a
leadership team should have argued about. Making them human-authored and sticky is what turns
"generate a summary" into "we agreed what our story is, and the system keeps the evidence beneath it
current."

---

## The sections

Ordered so that reading top to bottom is the argument. Each is deterministic in structure; the prose
column says what AI is allowed to touch.

| # | Section | Built from | AI writes |
| --- | --- | --- | --- |
| 1 | **The spine** | Human field | Nothing |
| 2 | **Why now** | Human field | Nothing |
| 3 | **The shape of the plan** | Horizons × milestones × `betEnvelope`; acts are the horizon bands, named by their bounding milestones | Connective prose per act |
| 4 | **What we're betting on** | `allocatingBets` ([`logic.ts:1208`](../src/lib/loop/logic.ts)), each rendered as its bet-detail lede, plus `runTheBusinessShare` ([`logic.ts:1096`](../src/lib/loop/logic.ts)) as the remainder | One linking sentence per bet |
| 5 | **What people see, and when** | `milestones`, sorted; nothing else | Nothing |
| 6 | **What this story has to survive** | The tension rules below | The "so what" per tension |
| 7 | **The numbers** | Derived totals | Nothing |

Section 5 writes nothing on purpose. A milestone list is already prose, and a model asked to
embellish it will invent confidence that isn't in the data.

**Section 4 is the one that changes the tool's centre of gravity.** Bets currently exist as colored
bands on a timeline and a form. Putting them at the middle of the narrative, with the
run-the-business remainder on the same bar, is what makes "what are we actually betting on" a
question the roadmap answers rather than one it dodges.

---

## The tension engine

Anyone can generate a summary. What makes a narrative credible is that it names what is uncomfortable
before the reader finds it — and **every tension worth naming is computable from data already in the
model.** This is the differentiating half of the feature and it involves no AI at all.

Each rule declares a `kind`: **`finding`** (state it, no action implied) or **`decision`** (someone
has to make a call). Only `decision` rules get the "the decision" framing.

| Rule | Fires when | Reads | Kind |
| --- | --- | --- | --- |
| Unbet capacity | `runTheBusinessShare().share` above threshold | [`logic.ts:1096`](../src/lib/loop/logic.ts) | decision |
| Undefended value | A foundational bet with `value.basis === "guess"` or a null magnitude | `Bet` | decision |
| Thin evidence | Foundational bet with `evidence.strength ≤ 2` | `Bet` | finding |
| No kill criteria | Empty `killCriteria` on a committed / active / scaling bet | `Bet` | decision |
| Review overdue | `nextReview` in the past, status not terminal | `Bet` | decision |
| Unstaffed claim | `betUnstaffedClaims(b)` non-empty | [`logic.ts:1165`](../src/lib/loop/logic.ts) | decision |
| Undeclared spend | `betUndeclaredSpend(b)` non-empty | [`logic.ts:1173`](../src/lib/loop/logic.ts) | finding |
| Planned/funded drift | `\|plannedShare[h] − fundedShare\|` above threshold | derived | decision |
| Over-allocated horizon | `plannedShareTotal(bets, h) > 100` | [`logic.ts:1218`](../src/lib/loop/logic.ts) | decision |
| Pyramid breach | `allocatingBets().length > MAX_FOUNDATIONAL_BETS` | `constants.ts` | finding |
| No losing bet | `recentlyKilledBets(bets, 8)` empty | [`logic.ts:1228`](../src/lib/loop/logic.ts) | finding |
| Unmeasured work | Share of costed items with no `kr.target` above threshold | `Item` | decision |
| Team concentration | A `betTeamShares` entry above threshold, or one team above a share of all committed epic-quarters | [`logic.ts:1113`](../src/lib/loop/logic.ts) | decision |
| Shared platform dependency | `sharedPlatformItems(items)` non-empty | [`logic.ts:1182`](../src/lib/loop/logic.ts) | finding |
| Season collision | The quarter with the most committed starts coincides with a high-intensity month on a Campminder season curve | [`seasons.ts:268`](../src/lib/loop/seasons.ts) | decision |
| Unowned surface | Items with an empty `owner`, or a JTBD carrying work that no team owns | `Item`, `taxonomy.ts` | decision |

Three notes on building this.

**Thresholds live in `constants.ts` as a reviewable block**, the way `seasons.ts` holds its curves —
"these numbers are meant to be argued with in a planning meeting." A threshold buried in a component
is a threshold nobody will ever revisit.

**Each rule owns its claim sentence, including the numbers.** The model may reframe for register and
add the consequence; a fidelity check asserts the figures survived. The rule says *"87% of committed
capacity belongs to no bet."* The model may say why that matters to a board. It may not say 84%.

**Season collision is the rule that justifies `seasons.ts` existing.** The curves are already
authored and drawn as timeline lanes; nothing yet *checks the plan against them*. Comparing committed
start-load per fiscal quarter against the Campminder enablement and support curves turns a decorative
lane into a planning check, and it is the one tension in this table that no other tool in the company
could produce.

---

## Audience registers

`summaryBody` already carries `audience: "exec" | "team"`
([`summary.ts:16`](../src/lib/ai/features/summary.ts)). Extend it. Same facts, same tensions, five
registers:

| Register | Leads with | Tensions |
| --- | --- | --- |
| `board` | The asset and the external dates | All, named first by you |
| `exec` | Decisions outstanding | All |
| `team` | Order and why your work sits where it does | Findings only |
| `sales` | What is safe to say, and when | Suppressed |
| `customer` | One promise and the commitments under it | Suppressed |

**The two outward-facing registers need a hard content gate, and it is not a matter of tone.**
`getPublicState` and the existing summary snapshot both already exclude Intake, for the stated reason
that a captured-but-unpromoted idea would be read as a plan. Extend that rule rather than reinventing
it:

- `sales` and `customer` see nothing in Intake — the existing rule.
- They carry **no dates for anything not yet in Building**. A Solutioning epic has a directional date,
  and a directional date repeated to a camp becomes a commitment.
- Bet theses, kill criteria, value magnitudes and every tension are internal. None appear.

That gate belongs in the data assembly, not in the prompt. A prompt instruction is a request; a
filter is a guarantee.

---

## Sharing: a narrative is a snapshot, not a live view

Today, sharing is one global bearer token granting anonymous read-only access to the whole live app
([`share.ts:39`](../src/lib/loop/share.ts), [`share/[token]/page.tsx`](../src/app/share/[token]/page.tsx)).
That is right for the tool and wrong for a narrative.

**A shared narrative must be frozen at the moment it was sent.** What you gave the board in August
has to still say what it said in August, or you cannot have a conversation about a roadmap that has
since moved — and that is most conversations. A live-regenerating narrative also means the tensions
section can change under a reader mid-discussion, which is worse than useless.

So: **generate, store, share the stored copy.** Regenerating produces a *new* narrative, not an
update to the old one. The old one keeps its link and its date.

One new table — the only genuine migration in either spec. Everything else in both documents rides in
existing `jsonb` blobs.

```
narratives
  id            text primary key
  title         text
  audience      text                 -- the register
  spine         text                 -- human-authored, carried forward
  whyNow        text                 -- human-authored, carried forward
  facts         jsonb                -- the injected fact set, stored for audit
  sections      jsonb                -- rendered output, frozen
  generatedAt   timestamptz
  generatedBy   text
  token         text unique          -- nullable until shared
  enabled       boolean
  revokedAt     timestamptz
  expiresAt     timestamptz
```

Reuse the `isLive` semantics from [`share.ts:16`](../src/lib/loop/share.ts) verbatim — enabled, not
revoked, not expired — rather than writing a second, subtly different rule. Unlike `shareLinks`,
**many narratives are live at once**; the single-active-link constraint is a property of sharing the
tool, not of sharing a document.

`/narrative/<token>` is public, anonymous and **static**: it renders stored `sections` and never calls
`getPublicState`. An invalid token 404s uniformly, leaking nothing about whether it ever existed —
same rule as the existing share page.

Storing `facts` alongside `sections` costs almost nothing and buys the thing that makes a narrative
defensible six months later: you can show what was true when you said it.

---

## Where it lives in the app

- **New `ViewKey: "narrative"`** ([`constants.ts:237`](../src/lib/loop/constants.ts)), added to
  `VIEWS` ([`LoopApp.tsx:48`](../src/components/loop/LoopApp.tsx)) and the view switch at
  [`LoopApp.tsx:550`](../src/components/loop/LoopApp.tsx). It is a view, not a dialog: it is a way of
  looking at the roadmap, and burying it in a modal is exactly what went wrong with the current
  summariser.
- **The register selector sits in the view**, not in settings. Switching audience is the primary
  interaction.
- **`ShareModal`'s summary button is removed**, replaced by a link into the narrative view. Leaving
  two generators in the product guarantees they will disagree.
- **New `/api/ai/narrative`** using `aiTextRoute` with `role: "reasoning"`, matching the existing
  summary route. Per-section calls rather than one whole-document call: sections fail independently
  and fall back independently, and a single 30-second `maxDuration` across seven sections is a
  timeout waiting to happen.

## Implementation notes

- **Build the fact assembler as a pure function in `logic.ts`**, not in the component:
  `narrativeFacts(state): NarrativeFacts`. It is the most test-worthy code in this spec and it must be
  callable from the API route without a React tree.
- **The tension rules are a data table, not a chain of conditionals.** An array of
  `{ id, kind, test(facts), claim(facts) }` is testable rule-by-rule and lets the threshold block sit
  next to it.
- **Do not add narrative fields to `diffStates`.** A narrative is an artifact *about* a state, not
  part of one. Scenario compare should stay blind to it.
- **`seed.ts` seeds no narratives.** An empty narrative view that says "write your spine" is a correct
  first-run state; a seeded example would be read as a template and copied.
- **`bet-detail.md` ships first.** Section 4 quotes the bet lede, so the composition rules need to
  exist in one place rather than being written twice and drifting.

## Tests the new behaviour needs

- **Numeric fidelity** — a generation containing a number absent from the fact set is rejected and
  the deterministic fallback is used. This is the test that makes the feature safe to send to a board.
- **AI-disabled rendering** — with `aiEnabled()` false, every section renders complete and correct.
- **Each tension rule, individually** — fires on a fixture that should trip it, stays silent on one
  that shouldn't. Sixteen small tests, and they are the feature's actual logic.
- **Register gating** — `sales` and `customer` outputs contain no Intake item, no date for anything
  below Building, and no bet thesis, kill criterion or value magnitude. Assert on the assembled facts,
  not the prose, so the test cannot be defeated by a model that happens to omit them.
- **Snapshot immutability** — mutating an item after generating a narrative does not change what the
  stored narrative renders.
- **Spine stickiness** — regenerating carries `spine` and `whyNow` forward unchanged.
- **Token liveness** — revoked, expired and unknown tokens all 404 identically.

---

## What not to build

- **No chat.** "Ask questions about the roadmap" is a different product, and AskMinder is already on
  the roadmap to be it.
- **No free-text editing of generated sections.** Edit the data or edit the spine; regenerate for
  everything else. An editable generated section is a section that will silently contradict the
  numbers below it.
- **No auto-publish and no scheduled regeneration.** A narrative goes out because a person decided to
  send it.
- **No second scoring or ranking layer.** The tensions are the judgment.

---

## Decisions

### Settled

- **Structure in code, prose from AI, numbers injected**, with a fidelity check and a deterministic
  fallback.
- **The spine and why-now are human-authored and sticky.**
- **Shared narratives are frozen snapshots**, many live at once, reusing `isLive`.
- **Tension detection is rule-based**, with thresholds in a reviewable constants block.
- **Outward-facing registers are gated in the data**, not in the prompt.
- **It is a view, not a dialog**, and it replaces the ShareModal summariser rather than joining it.

### Still open

- **Whether tensions appear in the `team` register.** Findings yes, decisions arguably yes — the
  people on the critical path are the ones best placed to challenge a threshold. **Recommend findings
  only at first**, and revisit once the rules have been tuned against a real quarter, because a rule
  set that cries wolf in an all-hands will be switched off permanently.
- **Whether a narrative can be pinned to a scenario** rather than to live state. `Scenario` already
  forks the whole `LoopState`, so generating a narrative for a proposed allocation is nearly free and
  would make the trade-off conversation concrete. **Recommend deferring** — it is a genuinely good
  idea and it doubles the surface area of the first build.
- **How acts get their names.** Section 3 groups by horizon and bounds each band with milestones, but
  *"The front door"* is a human phrase, not a derived one. Either a third sticky human field
  (act labels) or accept horizon names and let the prose carry it. **Lean toward the sticky field** —
  a story whose chapters are called Now, Next and Later is not yet a story.
- **Whether `sales` and `customer` registers ship in v1 at all.** They carry the most risk and the
  most value. Shipping `board` / `exec` / `team` first and adding the outward registers once the
  content gate has been reviewed by someone in GTM is the cautious path, and probably the right one.
