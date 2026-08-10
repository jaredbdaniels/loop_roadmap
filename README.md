# Loop — Campminder idea-to-outcome roadmap (hosted)

Loop is Campminder's internal roadmapping tool: the idea layer above Notion
(narrative), Azure DevOps (delivery), and the data stack (outcomes). It
references those systems rather than duplicating them.

This is the **hosted, shared-state** version — a port of the original
single-file `Loop/index.html` build onto a real web stack so the whole team
sees and edits one roadmap, behind Campminder login.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript
- **Drizzle ORM** + **Neon Postgres** — shared roadmap state
- **Better Auth** with Google, restricted to `@campminder.com`
- **Vercel** hosting (auto-deploy on push)

## What carried over

All four views (Board by stage, By mission, Timeline, Now / Next / Later),
the lifecycle loop with its framing + evidence gates (see below), ranking
weights, dependencies, sub-items, share mode,
and JSON import/export. The domain logic lives in `src/lib/loop/` and is shared
between the API and the UI. Data is stored per-item as a lossless JSON blob
(`loop-v2` schema), so **Export JSON** still produces the same file agents can
read.

## The board: an intake lane plus four lifecycle stages

The board's four right-hand columns are the lifecycle bands from the
**Headlights** process, Campminder's monthly rolling 3-month planning review, so
a card's lane in Loop and a sticky's band on a Headlights board mean the same
thing. **Intake** sits ahead of them as the inbox:

| Lane | What it is |
| --- | --- |
| **Intake** | *Not a Headlights band.* The inbox — ideas that have landed but that nobody has committed time to. Parked, not worked. |
| **Discovery** | Problem-space work — is the need real and worth investing in? Need-finding, not solution design. |
| **Solutioning** | Solution-space work — what should we deliver at scale? Path-finding: prototypes, spikes, flow validation. Build-to-learn lives here. |
| **Building** | Build-to-earn work — production software intended for broad, sustained customer use. |
| **Releasing** | Software in customers' hands. Beta, pilot, staged rollout and phased enablement all count; releasing is not only GA. |

Keeping Intake out of the lifecycle is what lets it exist without Loop
inventing a fifth lifecycle word for the company to learn. Headlights forecasts
the next three months; an idea nobody has committed to is not in that forecast.
So **moving a card from Intake to Discovery is a real decision** — "we are going
to spend time on this" — and until it happens the item **consumes no portfolio
capacity**, even if it carries speculative dates. Ideas arrive here from the
capture modal and the Aha! webhook; `LIFECYCLE_STAGES` in
`src/lib/loop/constants.ts` is the named boundary.

Note the split between the verb and the state: you **capture** an idea, and it
lands in **Intake**. The lane was called Capture until the two started competing
for the same word.

Two gates guard the boundary out of Solutioning, because framing and evidence
are both solution-space work: an item cannot enter **Building** (or Releasing)
without a real problem statement, a measurable KR, and at least one prototype or
evidence link. Nothing in Intake, Discovery or Solutioning is blocked.

This replaced Loop's earlier five-stage model (Capture → Frame → Validate →
Deliver → Learn); Frame and Validate collapsed into Solutioning and Capture was
renamed to Intake. Saved and imported data migrates automatically — see
`STAGE_MIGRATION` in `src/lib/loop/constants.ts`.

## Prioritization is a property, not a stage

Prioritization isn't a lane you drag cards into — it's continuous, and it lives
on every lane. Within any column you **drag cards up and down** to set priority
order by hand, and the column header's sort button **snaps the lane to
descending business-value order** (the `computeRank` blend of reach, confidence,
and strategic fit against the adjustable weights) so the highest-
value ideas jump to the top; you can then hand-tweak from there. The hand-ranked
sequence is what persists, stored as an `order` field per item. (This replaces
the old standalone "Prioritize" stage; legacy data migrates automatically —
ranked-but-not-yet-built items fold into Solutioning.)

## Divergent prototyping (multiple prototypes per idea)

An idea holds a **set of prototypes**, not a single link — the model for an
AI-native PM using the divergent-prototyping skill. For one framed problem you
(or an agent) spin up several distinct **directions**, each with its own
hypothesis, link, author (human *or* agent), status, and outcome reading; you
evaluate them against the idea's KR, then mark one **Chosen** to converge and
**Reject** the rest. The board shows an idea's state at a glance — a purple
"_N_ directions" pill when it has diverged without converging, a green
"Converged" pill once a direction is chosen. The evidence gate into Building
needs at least one linked prototype (it never hard-blocks divergence itself).

Backward compatible: the old single `prototypeUrl` field is migrated into the
`prototypes` array on load (idempotently, with a stable id), and the primary
direction is written back to `prototypeUrl` so exports and any legacy reader
stay coherent. See `Prototype` in `src/lib/loop/types.ts` and the
`itemPrototypes` / `chosenPrototype` / `divergedNotConverged` helpers in
`src/lib/loop/logic.ts`.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run db:push              # apply the schema to your database
npm run dev                  # http://localhost:3000
```

### Required environment variables

| Var | Where it comes from |
| --- | --- |
| `POSTGRES_URL` | Neon (via the Vercel Storage dashboard), pulled with `vercel env pull` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | app base URL (localhost in dev, deployed URL in prod) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth credentials |

Google OAuth **Authorized redirect URI**: `<BASE_URL>/api/auth/callback/google`

On first run against an empty database, Loop seeds the ten illustrative items
and default ranking weights (from `src/lib/loop/seed-data.json`).

## Deploy

Linked to Vercel under the `camp-co` team. Set the same env vars in the Vercel
project (Production + Preview), then `git push` to deploy. See the CampCo
`/deploy` and `/setup-vercel` skills.
