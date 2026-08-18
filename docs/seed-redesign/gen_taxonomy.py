#!/usr/bin/env python3
"""Emit src/lib/loop/taxonomy.ts from new-map.json + 4_teams.csv.

Generated rather than hand-edited so the code's spine cannot drift from the
review CSVs. Run after parse_lucid.py and remap.py.

Naming: the app speaks Domain → JTBD → Module, matching the Notion Jobs To Be
Done and Modules databases. The Lucid map and the vendored CSVs still use the
older words for the same two layers — a map "module" is a JTBD here, and a map
"capability" is a Module. The rows below translate on the way out; the vendored
inputs are left in their original wording so they stay diffable against the
export they came from.
"""
import csv, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", ".."))
NEW = json.load(open(os.path.join(HERE, "new-map.json")))

LABEL_FIX = {"Opperational AI": "Operational AI"}
MODULE_ID_OVERRIDE = {"Luggage Services": "luggage-services"}

# Domain labels on the map carry an explanatory parenthetical; the id and the
# display label drop it. Owners come from the org-chart page of the same export:
# Jared is Head of Product Platform, and Ali's block is the one nested inside the
# UltraCamp container. Core (Ellen) and Community (Anna) are not drawn on the map
# — they are the product owners named on the org-chart page.
#
# The map's Admin Workflows container is the Core domain: Admin Workflows is now
# one team inside it rather than the whole domain, sitting alongside Financial
# Services (whose Payments JTBD moves across from Product Platform — see
# JTBD_DOMAIN_OVERRIDE). Keys stay in the map's wording so the file remains
# diffable against the Lucid export.
DOMAIN_META = {
    "Product Platform":  ("product-platform", "Product Platform", "Jared"),
    "Admin Workflows (impacts mostly just the admin)":
                         ("core", "Core", "Ellen"),
    "Community (impacts to non-admin people)":
                         ("community", "Community", "Anna"),
    "UltraCamp":         ("ultracamp", "UltraCamp", "Ali"),
    "Unclaimed Property": ("unclaimed", "Unclaimed Property", ""),
}

# JTBDs whose domain differs from the container they sit in on the map, by JTBD
# id. Payments moved to Core with the Financial Services team: the money work is
# camp-operations work, not platform substrate. Kept here rather than in
# new-map.json so that file stays diffable against the Lucid export.
JTBD_DOMAIN_OVERRIDE = {"payments": "core"}

# Modules added beyond the map, and the JTBD they belong to.
EXTRA_MODULES = [
    ("Luggage Services", "Transportation"),
    # Migration is not on the Lucid map — the map draws the product, and moving
    # camps onto it is a program alongside. Added here rather than in
    # new-map.json so that file stays diffable against the Lucid export.
    ("Migration Cohorts", "Migration"),
    ("Migration Tooling", "Migration"),
]
# The lone Unclaimed module has no JTBD frame on the board; give it one so every
# module resolves through the same two hops.
EXTRA_JTBDS = [
    ("Events & Rentals", "Unclaimed Property"),
    ("Migration", "Product Platform"),
]
JTBD_OVERRIDE = {"Events and Rentals": "Events & Rentals"}


def slug(s):
    s = s.lower().replace(" & ", " ").replace(" / ", " ").replace("/", " ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def module_id(label):
    return MODULE_ID_OVERRIDE.get(label, slug(label))


# `NEW["modules"]` are JTBDs here and `NEW["capabilities"]` are Modules — the
# map's wording, translated on the way out (see the module docstring).
domains, map_jtbds = NEW["domains"], NEW["modules"]

jtbd_rows = []         # (id, label, domain_id)
seen_jtbd = {}
for jid, j in map_jtbds.items():
    dlabel = domains[j["domain_id"]].strip()
    did = JTBD_DOMAIN_OVERRIDE.get(slug(j["label"]), DOMAIN_META[dlabel][0])
    jtbd_rows.append((slug(j["label"]), j["label"], did))
    seen_jtbd[jid] = slug(j["label"])
for label, dlabel in EXTRA_JTBDS:
    jtbd_rows.append((slug(label), label, DOMAIN_META[dlabel][0]))

module_rows = []       # (id, label, jtbd_id)
for c in NEW["capabilities"]:
    label = LABEL_FIX.get(c["label"], c["label"])
    if c["module_id"]:
        jtbd = seen_jtbd[c["module_id"]]
    else:
        jtbd = slug(JTBD_OVERRIDE.get(c["label"], c["label"]))
    module_rows.append((module_id(label), label, jtbd))
for label, jlabel in EXTRA_MODULES:
    module_rows.append((module_id(label), label, slug(jlabel)))

# Teams, with the JTBDs each owns and its eng lead. The CSV column is still
# named `owns_modules_inferred`; those ids are JTBD ids in the app's wording.
teams = list(csv.DictReader(open(os.path.join(HERE, "4_teams.csv"))))
TEAM_DOMAIN_BY_NAME = {
    "Platform — Identity & Core Services": "product-platform",
    "Platform — Data & Integrations": "product-platform",
    "Platform — AI Platform": "product-platform",
    "Platform — Migration": "product-platform",
    "Platform — DevOps": "product-platform",
    "Core — Admin Workflows": "core",
    "Core — Financial Services": "core",
    "Core — Customer Love": "core",
    "Community — Staffing": "community",
    "Community — Family Engagement & Comms Service": "community",
    "UltraCamp": "ultracamp",
}
team_rows = []         # (id, label, domain_id, lead, [jtbd ids])
for t in teams:
    name = t["proposed_name"]
    jtbds = [slug(x.strip()) for x in t["owns_modules_inferred"].split(";") if x.strip()]
    if name == "UltraCamp":
        jtbds = ["ultracamp"]
    team_rows.append((slug(name), name, TEAM_DOMAIN_BY_NAME[name],
                      t["eng_lead"], jtbds))

jtbd_ids = {j[0] for j in jtbd_rows}
for _, _, _, _, jtbds in team_rows:
    for j in jtbds:
        assert j in jtbd_ids, j
owned = {j for _, _, _, _, jtbds in team_rows for j in jtbds}
unowned = sorted(jtbd_ids - owned)


def ts(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


out = ['''// The JTBD map — a stable ownership taxonomy the roadmap can group by:
//
//   Domain → JTBD → Module      (structure; durable)
//   Team                        (delivery; reassignable, spans JTBDs)
//
// The two lower layers mirror the Notion "Jobs To Be Done" and "Modules"
// databases, which are canonical for this language. Generated from the
// Architecture-Aligned Org Chart by docs/seed-redesign/gen_taxonomy.py — edit
// the map and re-run rather than hand-editing this file. The Lucid export and
// the vendored CSVs still use the older wording (a map "module" is a JTBD here,
// a map "capability" is a Module); the generator translates.
//
// Work items anchor to a Module (the stable unit). A Team is NOT a JTBD: there
// are more JTBDs than teams and a team spans several, so an item's team is
// stored on the item and never derived from its module. A re-org re-draws which
// team owns which JTBDs; the work on the timeline follows without being
// re-tagged.

export interface Domain {
  id: string;
  label: string;
  owner: string; // product owner; "" where the map records none
}

// A Job To Be Done — the customer-value roll-up a Module sits under.
export interface Jtbd {
  id: string;
  label: string;
  domainId: string;
}

export interface Module {
  id: string;
  label: string;
  jtbdId: string;
}

// A delivery team. `jtbdIds` is what it owns today — the reassignable half of
// the model. `lead` is the engineering manager; product ownership sits on the
// Domain.
export interface Team {
  id: string;
  label: string;
  domainId: string;
  lead: string;
  jtbdIds: string[];
}

// The catch-all domain. Any item whose module (or team fallback) maps to no
// known domain surfaces here instead of silently disappearing from a view.
export const UNCLAIMED_DOMAIN_ID = "unclaimed";

export const DOMAINS: Domain[] = [''']
# DOMAIN_META declaration order is the display order — single source, so the
# emitted list and the `order` index below can never drift.
for dlabel in DOMAIN_META:
    did, label, owner = DOMAIN_META[dlabel]
    idexpr = "UNCLAIMED_DOMAIN_ID" if did == "unclaimed" else f'"{did}"'
    out.append(f'  {{ id: {idexpr}, label: "{ts(label)}", owner: "{ts(owner)}" }},')
out.append("];\n")

out.append("export const JTBDS: Jtbd[] = [")
order = {d[0]: i for i, d in enumerate(
    [DOMAIN_META[k] for k in DOMAIN_META])}
for jid, label, did in sorted(jtbd_rows, key=lambda r: (order[r[2]], r[1])):
    idexpr = "UNCLAIMED_DOMAIN_ID" if did == "unclaimed" else f'"{did}"'
    out.append(f'  {{ id: "{jid}", label: "{ts(label)}", domainId: {idexpr} }},')
out.append("];\n")

jtbd_by_id = {j[0]: j for j in jtbd_rows}
out.append("export const MODULES: Module[] = [")
for mid, label, jtbd in sorted(
        module_rows,
        key=lambda r: (order[jtbd_by_id[r[2]][2]], jtbd_by_id[r[2]][1], r[1])):
    out.append(f'  {{ id: "{mid}", label: "{ts(label)}", jtbdId: "{jtbd}" }},')
out.append("];\n")

out.append('''// The delivery teams. Order drives the team bands in the Team and timeline
// views, so it is grouped by domain.
export const TEAMS: Team[] = [''')
for tid, label, did, lead, jtbds in sorted(
        team_rows, key=lambda r: (order[r[2]], r[1])):
    js = ", ".join(f'"{j}"' for j in jtbds)
    out.append(f'  {{\n    id: "{tid}",\n    label: "{ts(label)}",\n'
               f'    domainId: "{did}",\n    lead: "{ts(lead)}",\n'
               f'    jtbdIds: [{js}],\n  }},')
out.append("];\n")

if unowned:
    out.append("// JTBDs no team owns yet: "
               + ", ".join(sorted(unowned)) + ".")

out.append('''
// Which domain a team's work belongs to when an item has no module yet.
// resolveDomain uses it as the fallback; anything unlisted falls through to
// "unclaimed", the safety net.
export const TEAM_DOMAIN: Record<string, string> = Object.fromEntries(
  TEAMS.map((t) => [t.label, t.domainId]),
);

// JTBD → owning team label. Used to migrate legacy rows whose stored team no
// longer exists: the module's JTBD says which team inherited the work.
export const TEAM_BY_JTBD: Record<string, string> = Object.fromEntries(
  TEAMS.flatMap((t) => t.jtbdIds.map((j) => [j, t.label])),
);

// Lookup indexes (built once) for the resolver helpers in logic.ts.
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const JTBD_BY_ID = new Map(JTBDS.map((j) => [j.id, j]));
const DOMAIN_BY_ID = new Map(DOMAINS.map((d) => [d.id, d]));

export function getModule(id: string | null | undefined): Module | undefined {
  return id ? MODULE_BY_ID.get(id) : undefined;
}

export function getJtbd(id: string | null | undefined): Jtbd | undefined {
  return id ? JTBD_BY_ID.get(id) : undefined;
}

export function getDomain(id: string | null | undefined): Domain | undefined {
  return id ? DOMAIN_BY_ID.get(id) : undefined;
}

// The domain a module rolls up to (via its JTBD), or null if the module id is
// unknown/unset.
export function moduleDomainId(
  moduleId: string | null | undefined,
): string | null {
  const mod = getModule(moduleId);
  if (!mod) return null;
  const jtbd = JTBD_BY_ID.get(mod.jtbdId);
  return jtbd ? jtbd.domainId : null;
}

// The JTBD a module belongs to, or undefined if the id is unknown/unset.
export function moduleJtbd(
  moduleId: string | null | undefined,
): Jtbd | undefined {
  const mod = getModule(moduleId);
  return mod ? JTBD_BY_ID.get(mod.jtbdId) : undefined;
}

// Team ids, for interfaces that need a stable ASCII token rather than a display
// label — notably the AI capture enum, where the em dash in a label like
// "Core — Financial Services" is easy for a model to get wrong (hyphen, en dash)
// and would fail schema validation.
export const TEAM_IDS: string[] = TEAMS.map((t) => t.id);

const TEAM_LABEL_BY_ID = new Map(TEAMS.map((t) => [t.id, t.label]));

// The display label for a team id, or "" if the id is unknown.
export function teamLabel(id: string | null | undefined): string {
  return id ? (TEAM_LABEL_BY_ID.get(id) ?? "") : "";
}

// The team that owns a module's JTBD, or "" when no team owns it yet. Not the
// item's team — an item stores its own — but the default a migration or a fresh
// capture can fall back to.
export function moduleTeam(
  moduleId: string | null | undefined,
): string {
  const jtbd = moduleJtbd(moduleId);
  return jtbd ? (TEAM_BY_JTBD[jtbd.id] ?? "") : "";
}
''')

dest = os.path.join(APP, "src/lib/loop/taxonomy.ts")
open(dest, "w").write("\n".join(out))
print(f"wrote {dest}")
print(f"domains {len(DOMAIN_META)}  jtbds {len(jtbd_rows)}  "
      f"modules {len(module_rows)}  teams {len(team_rows)}")
print(f"jtbds with no team: {unowned or 'none'}")
