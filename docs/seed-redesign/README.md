# Seed redesign — review artifacts

**This is now wired into the app.** `taxonomy.ts` and `seed-data.json` are
generated from these files — edit the sources and re-run the pipeline rather than
hand-editing either. The CSVs remain the reviewable form of the same data.

## The model

> **Naming.** The app now speaks **Domain → JTBD → Module**, matching the Notion
> "Jobs To Be Done" and "Modules" databases, which are canonical. The Lucid map,
> the Epic Seed sheet and the CSVs below still use the older wording for the same
> two layers — what they call a *module* is a **JTBD**, and what they call a
> *capability* is a **Module**. `gen_taxonomy.py` and `build_import.py` translate
> on the way into the app; the vendored inputs keep their original words so they
> stay diffable against the exports they came from. Read the rest of this file in
> the CSVs' wording.

The spine now comes from the **Architecture-Aligned Org Chart** (Lucid), parsed
directly from its export — 5 domains, 31 modules, 68 capabilities. The Epic Seed
sheet's "Module" is the same layer as a capability on that map, so the two
hierarchies share a middle and only differ in the roll-up above it:

```
JTBD ─────────────┐
                  ├── Capability ── Epic ── SubItem (ADO)
Domain → Module ──┘

Team ── assigned across modules, not derived from them
```

JTBD and stance are properties of the **capability**, never of the epic — epics
inherit them. That holds empirically: in the Epic Seed sheet all 67 modules sat
under exactly one JTBD, and every module had a single stance across its epics.

**Team is a separate axis.** The new map has 31 modules and 9 delivery teams, and
teams span modules. This is a change from the previous model, where a team *was*
a sub-domain and an item's team was derived from its capability. `Item.mission`
already anticipates it ("volatile — a reassignable label, not the durable
anchor"); what has to decouple is the derivation in `constants.ts` /
`migrateItems`.

## The files

| File | Rows | What it is |
|---|---|---|
| `1_jtbds.csv` | 34 | The customer-value roll-up. 13 span more than one team. |
| `2_capabilities.csv` | 71 | The spine, keyed on the new map. `folds_in_old_capabilities` records the consolidation from the previous 92. |
| `3_epics.csv` | 136 | One row per epic. 92 from the sheet, 22 carried from the app seed, 8 drafted, 12 added at the 2026-07-31 roadmap review. |
| `4_teams.csv` | 10 | The delivery teams, eng counts and leads. Named `<Domain> — <Scope>`, qualified only where a domain holds more than one team. |
| `5_subitems.csv` | 40 | The breakdown layer — one row per child, keyed to its parent `epic_id`. Added at the 2026-07-31 roadmap review; every epic carried an empty `subItems` before it. |
| `parse_lucid.py` | — | Lucid export → `new-map.json`. |
| `gen_taxonomy.py` | — | `new-map.json` + teams → `src/lib/loop/taxonomy.ts`. |
| `old-taxonomy.json` | — | The pre-rebuild taxonomy, vendored. |
| `old-seed.json` | — | The pre-rebuild seed items, vendored. |
| `seed-fixtures.json` | — | Ranking weights + milestones, vendored. |
| `generate.py` | — | Sheet + the vendored snapshots → the three CSVs. |
| `remap.py` | — | Re-keys everything onto the new map. |
| `build_import.py` | — | CSVs → `src/lib/loop/seed-data.json`. |
| `build_notion_map.py` | — | Seed + a curated match table → `notion-brief-map.csv`. Not in the pipeline; see below. |
| `notion-brief-map.csv` | 124 | Proposed `notionUrl` per item, **awaiting review**. |

Pipeline order: `parse_lucid.py` → `generate.py` → `remap.py` → `gen_taxonomy.py`
→ `build_import.py`. **Re-runnable and idempotent** — every script reads only
vendored inputs, never a file the pipeline itself writes. That is why the three
`old-*` / `*-fixtures` snapshots exist: reading the live `taxonomy.ts` and
`seed-data.json` made the pipeline work exactly once, and left the ranking
weights and milestones with no source of record.

Sources are vendored alongside: `epic-seed-source.csv`, `org-chart-source.csv`.

## Notion brief backfill — needs review before it runs

Every item carries `notionUrl` / `notionTitle`, and the app now renders a link
out to the brief from every card and bar (`NotionLink.tsx`). All 124 seeded items
ship those fields empty, so that link is inert until they're filled in.

There is **no product-brief database in Notion to join against**. Briefs are
ordinary pages named `Launch Control: <feature>`, `Positioning Brief — <feature>`
or `Mini Launch: <feature>`, sitting under the Projects / CampCo Initiatives
databases. So this is a matching exercise with a human gate, not a lookup:

1. `build_notion_map.py` pairs a hand-curated list of real brief pages against
   the items they appear to describe and writes `notion-brief-map.csv` with a
   `confidence` and the reasoning per row. Process docs and templates ("Tier 1 —
   Launch Control: For Major Releases", "Positioning Brief Template", "Launch
   Control Working Doc") are excluded — they describe the process, not work.
2. **Review the CSV.** Correct or clear rows. Only then teach `build_import.py`
   to read it in place of the hardcoded `""` it writes today, so the mapping
   survives the next regeneration instead of being a one-off patch.

Nothing in step 1 touches `seed-data.json`.

### What the first pass found

**9 of 124 items have a brief — 7% coverage.** One match is high confidence
(`Launch Control: Registration`), six medium, two low. The 115 unmatched items
are kept as blank rows rather than dropped, so the gap reads as a gap. That
number is itself a finding: it's a brief-coverage worklist, not a matching
failure.

Two things to settle during review:

- **`Launch Control: Ask Camp` has four candidate items.** The LC describes the
  parent-facing grounded-answer chat in Campanion. `ep-family-communication-01`
  ("Ask Camp") matches its description exactly, but `ep-productized-ai-01`
  ("AskCamp") is the same product seen from the AI-platform side, with `-02` and
  `-03` continuing it. One brief, four items — the roadmap may be double-counting
  a single product across two domains.
- **Several briefs are narrower than the item they'd attach to.** `Mini Launch:
  Medical Log & Treatment Attachments` is one slice of `Health center & medical
  modern`; `Launch Control: Photo Season Passes` is a pricing launch on top of
  `Photos, albums & face finder modern`. Linking them is still useful, but the
  link is "related brief", not "the brief for this item".

## Rules baked into the data

**Dates.** Quarter labels resolve against the Sept-start fiscal calendar
(`FY27-Q1 Fall'26` = 2026-09-01 → 2026-11-30), which corrects today's seed —
it uses calendar quarters that straddle fiscal boundaries. `date_basis` says how
much to trust a date:

- `actual` — real, in-flight or shipped. **Never overwrite from a quarter label.**
- `planned` — committed quarter.
- `directional` — the quarter is a placeholder.

**Merge, don't replace.** `epic_id` derives from the capability, not the title,
so it survives re-wording. On any regeneration the app wins on dates, KR
readings, ADO state and learning fields; the sheet wins on content and structure.

**Gaps are explicit.** `gaps` lists what each epic still needs; `source` says
where it came from (`epic-seed-sheet`, `app-seed`, `drafted`); `migration` records
the domain move onto the new map.

## What the new map changes

- **CampCo Ops dissolves.** Product Ops, Support Operations, Billing/RevOps and
  CampCo Sales & Marketing sit in **Product Platform → Account & Service**,
  whose name matches the JTBD "Managing Your Software Account & Service". The
  separate unowned domain we added is no longer needed.
- **Entitlements and Tenant Admin** also land in Account & Service — where the
  Epic Seed sheet wanted them, not in Access.
- **Program & Activity Planning** resolves to **Core → Program Offerings**,
  not Financials.
- **Telemetry & Support** folds into Support Operations, off Communication.
- **Financials is gone as a band** — Payments is a Core JTBD, owned by Core —
  Financial Services, and Camp Store moved to Community.
- **The staff-check capabilities** fold into Onboarding & Training, matching the
  call already made.
- Nearly every epic changes domain.

## Parent experience is decomposed, not owned

No team owns "parent experience," so there is deliberately no Family Portal
capability. The six parent-experience epics are re-cut against the capabilities
that actually deliver each piece, and held together by the JTBD plus one
cross-team initiative (`initiative` column):

| Re-cut epic | Capability | Module |
|---|---|---|
| Show parents what's due, per child | Community Engagement | Community & Media |
| Merge Camp inTouch + Campanion (phase 1) | Community Engagement | Community & Media |
| Move the parent journey onto one app (phase 2) | Community Engagement | Community & Media |
| Retire Camp inTouch | Community Engagement | Community & Media |
| Let families complete forms in the parent app | Custom Fields & Forms | Custom Fields |
| Show families what they owe and let them pay in-app | Family Billing | Payments |
| Show families their registration & session status | Applications & Registration | Registrations |
| Let families manage their own household | People & Relationships | People & Orgs |

The dashboard epic is the surface only; what it surfaces belongs to whoever owns
that data. **Luggage Services** stays with the Admin Workflows team, under
Transportation.

## Getting it into the app

**A fresh database** seeds itself — `seed-data.json` is this data, so nothing to do.

**An existing database**: `⋯ → Import JSON` → `src/lib/loop/seed-data.json`. It
**replaces the entire dataset**, so export first if the current roadmap matters.
(There is deliberately no second copy of this payload to drift from the seed.)

Either way: 124 items across 9 teams, 2 initiatives and 8 milestones, resolving
into product-platform 59, community 31, admin-workflows 24, ultracamp 9 and one
item under Unclaimed Property (Events & Rentals, the one module no team owns).
`strategicFit` comes from stance (Must Win 5 → Nice-to-Have 1) and `confidence`
from `date_basis` (actual 5, planned 4, directional 2), so "Sort by business
value" is meaningful immediately.

## What changed in the app

- `taxonomy.ts` is regenerated: `DOMAINS` (5), `JTBDS` (33, the map's "modules",
  replacing `SUBDOMAINS`), `MODULES` (71, the map's "capabilities") and a new
  `TEAMS` (10).
- **Migration is a lane, not a phase.** The `Migration` JTBD, its two modules
  (Migration Cohorts, Migration Tooling) and the `Platform — Migration` team are
  added through `gen_taxonomy.py`'s `EXTRA_JTBDS` / `EXTRA_MODULES` hooks rather
  than into `new-map.json`, so the vendored Lucid export stays diffable against
  the export it came from. The map draws the product; moving camps onto it is a
  program running alongside.
- **Three fields stopped being hardcoded.** `owner` and `dependsOn` now come from
  their own columns in `3_epics.csv`, and `subItems` from `5_subitems.csv`. All
  three were previously written as `""` / `[]` for every epic.
- **Team is decoupled from JTBD.** `MISSIONS` now derives from `TEAMS`, not from
  the JTBD list. `MISSION_DOMAIN` became `TEAM_DOMAIN`; `capabilitySubdomain`
  became `moduleJtbd`, alongside a new `moduleTeam` and `TEAM_BY_JTBD`. The
  resolvers are `getModule`, `getJtbd`, `moduleDomainId`, `moduleJtbd` and
  `moduleTeam`.
- **An item's durable anchor is `Item.moduleId`** (was `capabilityId`; the ids
  themselves are unchanged). `migrateItems` moves a legacy `capabilityId` onto
  `moduleId` and deletes the old key, so live databases keep their anchor.
- `migrateItems` migrates a stored team through: still a real team → the team
  owning its module's JTBD → the `RETIRED_TEAM` table (old codenames *and* the
  previous map's sub-domains) → `""`. Existing rows in a live database land on a
  current team instead of being stranded.
- An item whose team can't be mapped keeps `TEAM_UNASSIGNED` and surfaces in the
  Team view's trailing "Unclaimed" group rather than disappearing. That value is
  left alone by later migrations, so "no team yet" is a choice that sticks, and
  it's selectable in the item detail as "— No team yet —".
- The AI capture enum is built from team **ids**, not labels. Eight of ten labels
  contain an em dash, and a model reproducing one will sometimes emit a hyphen or
  en dash — which would fail schema validation and error the capture.

## Open decisions

1. **Team → module assignment is inferred.** This is the one guess baked into
   production code. Names in `4_teams.csv` are derived
   from what each team owns, and ownership is read off the screenshot's geometry —
   the Lucid export carries containment, not position. Only Customer Love (Admin
   Workflows) and UltraCamp (UltraCamp) are explicit containment on the map. The
   durable fix is to nest each team block inside its domain container so
   containment exports.
2. **Two names carry loose ends.** Platform — Identity & Core Services also
   holds Alerts & Automation, Branding and Navigation; Community — Family
   Engagement & Comms Service also holds Camp Store and Safety & Incidents. Both
   are scope questions surfaced by naming, not naming problems.
3. **Two people each lead two teams** (Tracie: Identity & Core Services + Financial Services;
   Dani: Admin Workflows + Staffing), and Identity & Core Services
   covers 7 modules with 4 engineers against Financial Services' 1 module with 2.
2. **Two JTBD conflicts** from consolidation, in `jtbd_conflict`: Data Movement
   (Connecting External Tools vs Navigating the Product) and UltraCamp
   (Converging UltraCamp vs Expanding into Adjacent Segments).
3. **Two ownership fields, not one.** The map's people are eng managers (Mike
   Hart, Tracie, Dani, Jeremy, David, Rob). The product owners from the org-chart
   page are separate (Jared — Head of Product Platform; Ellen — Director of
   Product; Anna, Ali — GPMs). `Domain.owner` currently holds the product side.
4. **Luggage Services** and **Events & Rentals** exist in `taxonomy.ts` but not
   on the Lucid map — Luggage under Transportation, Events & Rentals as the lone
   Unclaimed module. Add them to the map so the two stay in sync.
5. **Domain owners.** Only Product Platform (Jared) and UltraCamp (Ali) are
   evidenced by the map; Core (Ellen) and Community (Anna) come from the
   org-chart page instead. Every domain but Unclaimed Property now has one.
6. **KR baselines and targets** — owner is picking these up. The `gaps` column is
   the worklist.
7. **`Operational AI`** is spelled "Opperational AI" on the map; corrected here.
8. **`OWNERS`** in `constants.ts` is unchanged. The org-chart page lists PMs the
   roster is missing (Adrian, Alix) and includes names it no longer shows — out of
   scope for this change.
