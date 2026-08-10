#!/usr/bin/env python3
"""Build the app's seed from the review CSVs.

Output: src/lib/loop/seed-data.json — a loop-v2 payload. A fresh database seeds
itself from it; an existing one can take the same file through ⋯ → Import JSON,
which REPLACES the whole dataset (items + weights + bets + milestones), so
export first if the current roadmap matters.

Run after parse_lucid.py -> generate.py -> remap.py -> gen_taxonomy.py.

Naming: the app speaks Domain -> JTBD -> Module. The CSVs still use the older
wording for the same two layers, so a CSV "module" is a JTBD here and a CSV
"capability" is a Module. Translated on the way out; the CSVs are left alone so
they stay diffable against the sheet they came from.
"""
import csv, json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", ".."))
NOW = "2026-07-28T00:00:00Z"

epics = list(csv.DictReader(open(os.path.join(HERE, "3_epics.csv"))))
caps = {r["capability"]: r for r in
        csv.DictReader(open(os.path.join(HERE, "2_capabilities.csv")))}
teams = list(csv.DictReader(open(os.path.join(HERE, "4_teams.csv"))))
# The breakdown layer. One row per child, grouped onto its parent epic — added
# at the 2026-07-31 roadmap review, where four separate stickies asked for the
# same thing: a tile broken into the work it actually contains.
subitems = collections.defaultdict(list)
for s in csv.DictReader(open(os.path.join(HERE, "5_subitems.csv"))):
    subitems[s["epic_id"]].append({
        "id": s["subitem_id"],
        "title": s["title"],
        "targetStart": s["target_start"] or None,
        "targetEnd": s["target_end"] or None,
        "done": s["done"].strip().lower() in ("1", "true", "yes"),
        "adoUrl": s["ado_url"],
        "adoStatus": "",
    })
# Weights and milestones come from a vendored fixture, NOT from the
# seed-data.json this script also writes — reading its own output left them with
# no source of record, so a truncated or app-exported seed would silently change
# or drop them.
fixtures = json.load(open(os.path.join(HERE, "seed-fixtures.json")))

# JTBD -> team, from the (inferred) ownership in 4_teams.csv (whose column is
# still named owns_modules_inferred; those labels are JTBDs in the app's wording).
JTBD_TEAM = {}
for t in teams:
    for m in filter(None, [x.strip() for x in t["owns_modules_inferred"].split(";")]):
        JTBD_TEAM[m] = t["proposed_name"]
# The two teams placed by containment rather than position own their domain
# outright, so their JTBDs aren't listed in owns_modules_inferred.
JTBD_TEAM["UltraCamp"] = "UltraCamp"
# Events and Rentals is the lone Unclaimed Property module — no JTBD, no team.
TEAM_BY_TITLE = {
    # Customer Love is a function, not a domain slice: its epic belongs to it even
    # though the module (Camp Productivity) sits with the Admin Workflows team.
    "Customer Love Tiger Team (Summer '26)": "Core — Customer Love",
}
# Modules added to the map here rather than folded from an old one, but whose old
# taxonomy id still exists and resolves to the right domain.
MODULE_ID_OVERRIDE = {"Luggage Services": "luggage-services"}  # already a real id

# moduleId carries the new map's id, matching what gen_taxonomy.py emits into
# taxonomy.ts — the two derive their slugs the same way, and taxonomy.test.ts plus
# seed.test.ts assert every seeded id resolves.
def module_id(new_label):
    if new_label in MODULE_ID_OVERRIDE:
        return MODULE_ID_OVERRIDE[new_label]
    slug = (new_label.lower()
            .replace(" & ", " ").replace(" / ", " ").replace("/", " "))
    return re.sub(r"[^a-z0-9]+", "-", slug).strip("-")


STANCE_FIT = {"Must Win": 5, "Differentiator": 4, "Table Stakes": 3,
              "Optional/Deferable": 2, "Nice-to-Have": 1}
BASIS_CONFIDENCE = {"actual": 5, "planned": 4, "directional": 2}

BET_PARENT = "init-parent-experience"


def bet(**kw):
    """A Bet with every field defaulted — see src/lib/loop/types.ts.

    Defaults are deliberately empty rather than plausible: a seeded bet with an
    invented thesis and a made-up dollar figure would read as real. What is
    filled in below is what the roadmap actually knows; the rest is left blank so
    the health strip flags it, which is the honest starting state.
    """
    base = {
        "thesis": "", "whyNow": "", "tier": "experiment", "theme": "grow",
        "goalArea": "product-strategy", "sponsor": "", "owner": "",
        "status": "proposed", "horizon": None, "confidence": 3,
        "reversibility": 3,
        "value": {"statement": "", "type": "new-revenue", "magnitude": None,
                  "basis": "guess", "timeToValue": None},
        "evidence": {"strength": 1, "notes": "", "links": []},
        "outcomes": [], "jtbdIds": [],
        "plannedShare": {"now": 0, "next": 0, "later": 0},
        "killCriteria": "", "nextReview": None,
        "decision": {"verdict": None, "rationale": "", "decidedAt": None},
        "createdAt": NOW, "updatedAt": NOW,
    }
    base.update(kw)
    return base


BETS = [
    bet(
        id="init-registration",
        title="Registration",
        description="Umbrella bet modernizing registration end to end — "
                    "forms, payment, and additional options/sessions — coordinated "
                    "across teams.",
        color="#7A5AF8",
        tier="foundational",
        status="active",
        horizon="now",
        # Filled in at the 2026-07-31 roadmap review. It was declared but empty —
        # no thesis, no outcomes, no linked epics — which is why the sticky asking
        # for "the hotness we are targeting based on the bets" had nothing to draw
        # on. Five registration epics now link here, so the bet reconciles against
        # real work instead of firing the unstaffed-claim flag on all three JTBDs.
        thesis="We believe rebuilding registration end to end — mobile-first, "
               "multi-kid, with payment in the flow — lifts completed enrollments, "
               "because the current flow loses families at exactly the point they "
               "have decided to buy.",
        whyNow="Registration is the first thing every camp and every family "
               "touches, so it is both the biggest conversion lever and the proof "
               "that modernization is real. It also gates Summer '27 enrollment: "
               "miss the window and the next chance is a year out.",
        outcomes=[
            {"statement": "Completed registrations on the modern flow",
             "metric": "completed registrations", "unit": "percent",
             "baseline": None, "target": None, "current": None},
            {"statement": "Registration abandonment rate",
             "metric": "abandonment", "unit": "percent",
             "baseline": None, "target": None, "current": None},
        ],
        killCriteria="Modern registration does not reach GA in time for Summer '27 "
                     "enrollment opening, or completion rate fails to beat the "
                     "legacy flow across a full cycle.",
        jtbdIds=["registrations", "payments", "custom-fields"],
    ),
    bet(
        id=BET_PARENT,
        title="Parent Experience Convergence",
        description="Merging Camp inTouch and Campanion into one parent app. No "
                    "single team owns it: the dashboard and convergence phases sit "
                    "on Community Engagement, but forms belong to Custom Fields, "
                    "balances to Payments, registration status to Registrations and "
                    "household to People & Orgs.",
        color="#E8618C",
        tier="foundational",
        status="active",
        horizon="now",
        # The five JTBDs its eight epics actually land in, so this bet
        # reconciles clean — the contrast with Registration above.
        jtbdIds=["community-media", "registrations", "custom-fields",
                 "payments", "people-orgs"],
    ),
]
BET_BY_TITLE = {"Parent Experience Convergence": BET_PARENT,
                "Registration": "init-registration"}


def _bet_ids(e):
    """The bets an epic is linked to — the seed sheet names at most one."""
    title = e.get("initiative")
    return [BET_BY_TITLE[title]] if title in BET_BY_TITLE else []


def num(s):
    if s is None or str(s).strip() == "":
        return None
    try:
        return float(s) if "." in str(s) else int(s)
    except ValueError:
        return None


items = []
for e in epics:
    module = e["new_capability"]
    jtbd_label = e["new_module"]
    persona = e["persona"].strip()
    outcome = e["outcome_so_that"].strip()
    delivery = e["delivery_what_ships"].strip()

    problem = ""
    if outcome:
        problem = (f"For {persona}: {outcome}" if persona else outcome)

    metric = e["kr_metric"].strip()
    items.append({
        "id": e["epic_id"],
        "title": e["title"],
        "description": delivery,
        # Team, not JTBD — the new map keeps these separate.
        "mission": TEAM_BY_TITLE.get(e["title"]) or JTBD_TEAM.get(jtbd_label, ""),
        # The single accountable person, from the CSV's own column. Every epic
        # carried "" until the 2026-07-31 review, where three stickies turned out
        # to be asking "who owns this?" rather than anything about the work.
        "owner": e.get("owner", ""),
        "moduleId": module_id(module),
        "type": e["type"] or None,
        "stage": e["stage"] or "Intake",
        "order": None,
        "horizon": e["horizon"] or None,
        "targetStart": e["target_start"] or None,
        "targetEnd": e["target_end"] or None,
        "dependsOn": [x.strip() for x in e.get("depends_on", "").split(";") if x.strip()],
        "betIds": _bet_ids(e),
        # One bet funds an epic; the rest are enabled by it. Every seeded epic
        # has at most one bet, so the funder is unambiguous — migrateItems would
        # auto-set it anyway, but writing it here keeps the payload explicit.
        "fundedBetId": (_bet_ids(e) or [None])[0],
        "subItems": subitems.get(e["epic_id"], []),
        # Generated data, so no individual is credited as the submitter; a real
        # person here would misattribute 124 items in the Board view.
        "submitter": {"type": "human", "name": "Product"},
        "problemStatement": problem,
        "kr": {
            "statement": metric,
            "metric": metric,
            "unit": e["kr_unit"],
            "baseline": num(e["kr_baseline"]),
            "target": num(e["kr_target"]),
            "current": num(e["kr_current"]),
        },
        "votes": 0,
        "reach": 0,
        "confidence": BASIS_CONFIDENCE.get(e["date_basis"], 0),
        "strategicFit": STANCE_FIT.get(e["stance"], 0),
        "notionUrl": "", "notionTitle": "",
        "adoUrl": "", "adoStatus": "",
        "ahaUrl": "", "ahaReference": "", "ahaEndorsements": 0,
        "prototypeUrl": "", "prototypes": [],
        "outcomeReading": "",
        "whatWeLearned": "", "whatWeDoDifferently": "", "nextBet": "",
        "killed": False, "killedAt": None, "killedReason": "",
        "committedAt": None,
        "shippedAt": None,
        "createdAt": NOW, "updatedAt": NOW,
        "activity": [
            f"Seeded from the Architecture-Aligned map — {e['new_domain']} › "
            f"{jtbd_label} › {module}.",
            f"JTBD: {e['jtbd']}. Stance: {e['stance']}. Dates are {e['date_basis']}.",
        ],
    })

payload = {
    "schema": "loop-v2",
    "exportedAt": NOW,
    "items": items,
    "weights": fixtures["weights"],
    "bets": BETS,
    "milestones": fixtures["milestones"],
}
# One generated payload, not two identical ones: seed.ts reads items/weights/
# bets/milestones straight out of this file, and the same file is what you
# hand to ⋯ → Import JSON for an existing database.
seed_dest = os.path.join(APP, "src/lib/loop/seed-data.json")
json.dump(payload, open(seed_dest, "w"), indent=1)

print(f"wrote {seed_dest}")
print(f"items {len(items)}  bets {len(BETS)}  "
      f"milestones {len(payload['milestones'])}")
print(f"\nno team (jtbd unowned): "
      f"{[i['title'] for i in items if not i['mission']] or 'none'}")
print(f"no moduleId: {[i['title'] for i in items if not i['moduleId']] or 'none'}")
print("\nteams:")
for k, v in collections.Counter(i["mission"] for i in items).most_common():
    print(f"  {v:>3}  {k or '(unassigned)'}")
print("\nlinked to a bet:",
      sum(1 for i in items if i["betIds"]))
