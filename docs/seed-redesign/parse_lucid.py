#!/usr/bin/env python3
"""Parse the Architecture-Aligned Org Chart Lucid export into the new
Domain -> Module -> Capability map, plus the team roster.

Lucid encodes nesting in `Contained By`: a module names its domain id, a
capability sticky names "<domain id>|<module id>". Page 2 ("Horse Yard") is the
domain map; page 136 ("Org Chart") is the eng org chart and is ignored here.
"""
import csv, json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "org-chart-source.csv")
MAP_PAGE = "2"

# Capabilities that sit in a domain band with no module frame around them, so
# containment alone cannot tell them apart from a person card.
UNMODULED_CAPABILITIES = {"Events and Rentals"}

rows = list(csv.DictReader(open(SRC)))
by_id = {r["Id"]: r for r in rows}


def name(r):
    return (r["Text Area 1"] or "").strip()


def parents(r):
    return [p for p in (r["Contained By"] or "").split("|") if p]


domains, modules, caps, teams, people = {}, {}, [], [], []
for r in rows:
    if r["Page ID"] != MAP_PAGE:
        continue
    kind, n = r["Name"], name(r)
    if kind == "Rectangle container":
        domains[r["Id"]] = n
    elif kind == "SparkFrameBlock":
        p = parents(r)
        modules[r["Id"]] = {"label": n, "domain_id": p[0] if p else None}
    elif kind == "Sticky note":
        # Classify by containment, not by author. A capability sticky is nested in
        # a module (domain|module, two parents); a person card sits loose on the
        # board or directly in a domain band. Keying off the author's name meant a
        # person card drawn by anyone else became a phantom capability.
        p = parents(r)
        if len(p) < 2 and n not in UNMODULED_CAPABILITIES:
            people.append({"name": n, "parents": p})
        else:
            caps.append({
                "label": n,
                "domain_id": p[0] if p else None,
                "module_id": p[1] if len(p) > 1 else None,
                "comment": r["Comments"] or "",
            })
    elif kind == "Block":
        m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", n, re.S)
        if m and ("eng" in m.group(2) or "contractor" in m.group(2)):
            teams.append({"team": m.group(1).strip(), "size": m.group(2).strip(),
                          "parents": parents(r)})

# ---------------------------------------------------------------- report
print(f"domains {len(domains)}  modules {len(modules)}  capabilities {len(caps)}  teams {len(teams)}\n")
tree = collections.defaultdict(lambda: collections.defaultdict(list))
for c in caps:
    d = domains.get(c["domain_id"], "??")
    m = modules.get(c["module_id"], {}).get("label", "(no module)")
    tree[d][m].append(c)
# modules with no capability sticky
for mid, m in modules.items():
    d = domains.get(m["domain_id"], "??")
    tree[d].setdefault(m["label"], [])

for d in sorted(tree):
    print(f"### {d}")
    for m in sorted(tree[d]):
        cs = tree[d][m]
        label = ", ".join(c["label"] for c in cs) if cs else "— EMPTY —"
        print(f"  {m:<24} {label}")
    print()

print("### teams")
for t in teams:
    where = ", ".join(domains.get(p, modules.get(p, {}).get("label", p)) for p in t["parents"]) or "—"
    print(f"  {t['team']:<20} {t['size']:<26} placed in: {where}")

print("\n### comments on the map")
for c in caps:
    if c["comment"]:
        try:
            for thread in json.loads(c["comment"]):
                for cm in thread["Comments"]:
                    print(f"  {c['label']}: \"{cm['Content']}\" — {cm['Creator']}")
        except Exception:
            print(f"  {c['label']}: {c['comment'][:120]}")

json.dump({"domains": domains, "modules": modules, "capabilities": caps,
           "teams": teams},
          open(os.path.join(HERE, "new-map.json"), "w"), indent=1)
