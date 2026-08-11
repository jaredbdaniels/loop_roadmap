# Decisions to make before writing code

**Gates:** [`bet-detail.md`](./bet-detail.md) and [`narrative-view.md`](./narrative-view.md)
**Drafted:** 2026-08-11 · **Status: open** — every recommendation below is mine, none is confirmed.

Twelve decisions, each with a recommendation and the code it gates. **D1–D3 block the first line of
PR 1**; everything else can be answered while PR 1 is in flight. Same format as
[`2026-08-05-purple-sticky-change-proposal.md`](../../roadmap-review/2026-08-05-purple-sticky-change-proposal.md),
which is how this repo has settled decisions before.

---

## First, what the rules actually say about today's data

The sixteen tension rules in `narrative-view.md` were specified against the model, not against the
roadmap. Run against the current corpus, **nine fire, four are silent, and one is unbuildable as
written.** That result decides D5, D6 and D7, and it hands us our test fixtures.

| # | Rule | Today | Reading |
| --- | --- | --- | --- |
| R1 | Unbet capacity | **fires** | 87.1% of committed capacity (62 of 73 epics) belongs to no bet |
| R2 | Undefended value | **fires** ×2 | Both bets: `basis: guess`, no magnitude |
| R3 | Thin evidence | **fires** ×2 | Both bets: evidence 1/5 |
| R4 | No kill criteria | **fires** ×1 | Parent Experience Convergence |
| R5 | No review date | **fires** ×2 | Neither bet has one |
| R6 | Unstaffed claim | **fires** ×1 | Registration declares Payments and Custom Fields, staffs neither |
| R7 | Undeclared spend | silent | Both bets' epics land inside their declarations |
| R8 | Planned/funded drift | **unbuildable** | Every bet declares 0% — see D7 |
| R9 | Over-allocated horizon | silent | Totals are 0 for the same reason |
| R10 | Pyramid breach | silent | 2 foundational, limit 3 |
| R11 | No losing bet | **fires** | Zero bets carry a recorded verdict |
| R12 | Unmeasured work | **fires** | 95% of committed epics (69 of 73) have no KR target |
| R13 | Team concentration | **borderline** | Data & Integrations holds 24% of all committed epic-quarters — see D6 |
| R14 | Shared platform dependency | silent | No epic is linked to more than one bet |
| R15 | Season collision | **fires** | 22 starts in FY27 Q3, the peak, in the quarter camps stop absorbing anything |
| R16 | Unowned surface | **fires** | Events & Rentals is owned by no team; 1 item has no owner |

Two things worth reading off that table before deciding anything.

**The silent rules are silent because the portfolio is thin, not because the rules are wrong.** R7,
R9, R10 and R14 all need more than two bets to have anything to say. They are correct and untestable
against real data, so they need synthetic fixtures — which is fine, but it means they carry more risk
per line than the nine that fire.

**Six of the nine that fire are hygiene on two bets.** R2–R6 and R11 all say versions of "the bets
aren't filled in." That is true and worth saying once, but a narrative whose tension section is six
bullets about empty fields reads as a linter, not an argument. This is the real content of D5:
**collapse the bet-hygiene rules into one finding with a per-bet breakdown**, so the section leads
with R1, R12, R15 and R16 — the four that say something about the *plan* rather than about the
*paperwork*.

---

## The twelve decisions

| # | Decision | Gates | My recommendation |
| --- | --- | --- | --- |
| **D1** | Is `BetDetail` a modal or a route? | **PR 1, first file** | **Route** (`/bets/<id>`) |
| **D2** | Does the bet read surface show Intake-linked epics internally? | **PR 1** | **Yes**, separated and labelled as costing nothing |
| **D3** | Does `Bet.activity` ship in PR 1 or later? | **PR 1** | **PR 1** |
| **D4** | `Team.size` — now or later, and what does the asterisk mean? | PR 4 | **Later.** Need a human answer on the asterisk first |
| **D5** | Which tension rules ship in v1? | PR 3 | **The nine that fire**, with R2–R6 + R11 collapsed into one |
| **D6** | What are the threshold values? | PR 3 | Proposed block below |
| **D7** | R8 is unbuildable — replace it? | PR 3 | **Yes** — "no bet has declared a planned share" |
| **D8** | Do tensions appear in the `team` register? | PR 3 | **Findings only**, no decisions |
| **D9** | Do `sales` / `customer` registers ship in v1? | PR 3 | **No.** Defer until GTM reviews the content gate |
| **D10** | How do acts get their names? | PR 3 | **A third sticky human field** |
| **D11** | Can a narrative be pinned to a scenario? | — | **Defer.** Good idea, doubles v1 |
| **D12** | Does the ShareModal summariser go away in the same PR? | PR 3 | **Yes**, same PR |

---

### D1 — Modal or route *(blocks PR 1)*

A modal matches `DetailModal` and costs nothing. A route is linkable.

**Recommend the route.** Three things want to link to a bet within a month: the narrative view's
section 4, Slack, and the timeline band. Retrofitting linkability after `BetDetail` exists as a modal
means touching every call site twice. The cost is one `app/bets/[id]/page.tsx` and passing the bet
through, against a routing change we would otherwise pay for later at a worse moment.

The counter-argument is real and worth stating: every other detail surface in Loop is a modal, and a
route makes `BetDetail` the odd one out. If that consistency matters more than linkability, take the
modal — but decide now, not after the component exists.

### D2 — Intake-linked epics on the read surface *(blocks PR 1)*

Intake costs nothing and is excluded from every share and every share-visible roll-up. But hiding it
entirely means a PM cannot see what they have parked against a bet.

**Recommend showing them internally, in a separate labelled group, excluded from every number.** The
board already does exactly this with the Intake lane, so the pattern exists and the vocabulary is
established. The rule that must hold: **an internal reader and a share reader never see different
epic counts** — which means the counts come from `costedItems` in both cases and the Intake group is
visibly outside them.

### D3 — `Bet.activity` in PR 1 or later *(blocks PR 1)*

**Recommend PR 1.** Not because it is urgent, but because `normalizeBets`
([`logic.ts:832`](../src/lib/loop/logic.ts)) is a strict field-by-field whitelist and touching it is
the highest-risk edit in either spec — a field missing from it works in memory and vanishes on
reload. Doing that edit once, with the read surface that displays the result, is safer than doing it
twice.

It also changes what PR 1 is *for*. Without an activity log, the read surface shows a bet's current
state. With one, it shows how the bet got there, which is the whole argument for splitting read from
edit.

### D4 — `Team.size`

`docs/seed-redesign/4_teams.csv` has values like `"4 eng"` and `"5* eng"`. Nobody has said what the
asterisk means, and a parser that silently discards it will encode a guess as data.

**Recommend deferring** until someone answers. Everything in both specs works without it; it only
upgrades "6.5% of 93 epic-quarters" into "about half a team for three quarters."

### D5 — Which rules ship in v1

**Recommend the nine that fire, restructured.** Collapse R2–R6 and R11 into a single
**bet-hygiene** finding with a per-bet breakdown, so the section reads:

1. 87% of committed capacity belongs to no bet *(R1)*
2. 95% of committed work carries no target *(R12)*
3. Your heaviest quarter is your worst quarter to be heavy *(R15)*
4. Events & Rentals is on the roadmap and owned by nobody *(R16)*
5. Neither bet is filled in far enough to be judged *(R2–R6, R11 collapsed)*
6. Registration claims Payments and Custom Fields and has staffed neither *(R6 detail)*

The seven silent rules stay in the table and ship dark — implemented, tested against fixtures, firing
when the portfolio grows into them. They cost little once the rule harness exists; what they cost is
review attention in v1, which is why they should not be part of the first output anyone sees.

### D6 — Thresholds

Proposed, as one reviewable block beside the rules, the way `seasons.ts` holds its curves:

| Threshold | Value | Why |
| --- | --- | --- |
| Unbet capacity fires above | **50%** | "More than half the roadmap is unbet" is a claim; 87% is the current reading, so any value up to ~80 fires today |
| Thin evidence | **≤ 2 of 5** | Already stated in the spec |
| Unmeasured work fires above | **50%** | Current reading is 95% |
| Team concentration fires above | **25%** of committed epic-quarters | **Live decision.** Data & Integrations is at 24% — one epic either way flips it |
| A bet consuming one team fires above | **50%** of that team's dated work | Uncalibrated; no bet is close today |
| Planned/funded drift fires above | **10 points** | Uncalibrated until D7 lands and someone types a planned share |
| Decision-quality window | **8 months** | Matches `recentlyKilledBets`' default and the Rhythm of Business |
| Season collision | Peak-start quarter overlapping a Campminder curve month at **≥ 0.8** | The curves are normalized to 1 at their own peak |

**The team-concentration threshold is the one to actually decide.** At 25% it fires on nothing today
and would fire on one more epic landing in Data & Integrations. At 20% it fires now. Either is
defensible; picking it by accident is not.

### D7 — R8 is unbuildable as written

Planned-versus-funded drift cannot fire, because **every bet declares a planned share of 0** across
every horizon. R9 (over-allocated horizon) is silent for the same reason.

**Recommend replacing R8 with a rule that fires on the real condition:** *"No bet has declared a
planned share, so intended and actual investment cannot be compared."* Keep the drift rule in the
table, dark, for when someone types a number. The current state is more interesting than the rule we
specified for it: the allocation bar that `strategic-bets.md` calls load-bearing has nothing to draw.

### D8 — Tensions in the `team` register

**Recommend findings only.** A rule set that cries wolf in an all-hands gets switched off
permanently, and the decision-framed tensions are addressed to people who can act on them. Revisit
once the thresholds have been tuned against a real quarter — the counter-argument, that people on the
critical path are best placed to challenge a threshold, is good and may win later.

### D9 — Outward-facing registers in v1

**Recommend no.** `sales` and `customer` carry the most value and all of the risk: a directional date
on a Solutioning epic, repeated to a camp, becomes a commitment. Ship `board` / `exec` / `team`,
then add the outward registers once someone in GTM has reviewed the content gate as a spec rather
than as generated output.

### D10 — Act names

Section 3 groups by horizon and bounds each band with milestones, but *"The front door"* is a human
phrase. **Recommend a third sticky human field** alongside the spine and why-now: an act label per
horizon. A story whose chapters are called Now, Next and Later is not a story.

### D11 — Scenario-pinned narratives

`Scenario` already forks the whole `LoopState`, so generating a narrative for a proposed allocation
is nearly free and makes the trade-off conversation concrete. **Recommend deferring** — it is a good
idea and it doubles the surface area of v1.

### D12 — Removing the ShareModal summariser

**Recommend removing it in the same PR that adds the narrative view.** Two generators in one product
will disagree, and the one that disagrees will be the one someone pastes into a board deck. Replace
the button with a link into the view.

---

## The build sequence

| PR | Contents | Gate | Size |
| --- | --- | --- | --- |
| **1** | `BetDetail` read surface + `Bet.activity` + `normalizeBets` whitelist + route/modal wiring + `TimelineView` `onEdit` → `onOpen` | **D1, D2, D3** | ~1 component, 1 route, 2 logic edits |
| **2** | `narrativeFacts(state)` in `logic.ts` — the pure fact assembler, no UI | none | 1 function, heavily tested |
| **3** | Narrative view: `ViewKey`, deterministic sections, rule engine, thresholds block, registers, ShareModal summariser removed | **D5, D6, D7, D8, D9, D10, D12** | the big one |
| **4** | `/api/ai/narrative` + per-section prose + numeric fidelity check | none | small; view already works without it |
| **5** | `narratives` table + `/narrative/<token>` snapshot sharing | none | the only real migration |

**PR 2 before PR 3 is deliberate.** The fact assembler is the most test-worthy code in either spec
and the only part that must be callable from an API route without a React tree. Writing it first, in
isolation, with the nine firing rules as its test suite, means PR 3 is assembly rather than
invention.

**PR 4 is genuinely optional.** The narrative view renders complete and correct with `aiEnabled()`
false. If the prose layer slips, nothing else does.

---

## Fixtures this hands us

The nine firing rules give real test data, which is worth more than synthetic:

- **R6** — Registration declaring `payments` and `custom-fields` with zero epics in either is a real
  unstaffed-claim case, not a contrived one.
- **R1 / R12** — 87.1% and 95% are stable readings off the committed corpus; assert on them directly
  and a regression in `itemQuarters` or `costedItems` breaks the narrative test suite loudly.
- **R15** — 22 starts in FY27 Q3 against the Campminder enablement curve is the season-collision case.
- **R16** — `events-rentals` is a genuinely unowned JTBD in `taxonomy.ts`.

The seven silent rules need fixtures built by hand. Build them as a separate `bets-portfolio` fixture
rather than distorting the seed — `seed-data.json` is generated and hand-edits are lost on the next
regeneration.
