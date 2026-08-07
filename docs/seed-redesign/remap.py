#!/usr/bin/env python3
"""Re-key the seed-review artifacts onto the Architecture-Aligned map.

The Lucid export is now the source of truth for the spine (Domain -> Module ->
Capability). This maps the 92 capabilities from the previous pass onto the new
68, carries JTBD + stance across the fold, re-derives every epic's domain and
module, and lists what has no home so it can't be lost silently.

Run parse_lucid.py first (writes new-map.json), then generate.py, then this.
"""
import csv, json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
NEW = json.load(open(os.path.join(HERE, "new-map.json")))
DOMAINS, MODULES = NEW["domains"], NEW["modules"]

# Tidy the two labels the export carries verbatim.
LABEL_FIX = {"Opperational AI": "Operational AI"}

# old capability_id -> new capability label. Several old ids fold into one new
# capability; that consolidation is the point of the new map.
FOLD = {
    # --- Product Platform ---
    "payments-processing": "Payment Processing",
    "family-billing": "Family Billing",
    "camp-accounting": "Camp Accounting",
    "financial-setup": "Financial Setup",
    "promotion-setup": "Financial Setup",
    "pricing-service": "Financial Setup",
    "entitlements": "Entitlements",
    "tenant-saas-admin": "Tenant Admin",
    "product-ops": "Product Ops",
    "support-operations": "Support Operations",
    "telemetry-support": "Support Operations",
    "campco-billing-revops": "Billing / RevOps",
    "campco-sales-marketing": "CampCo Sales & Marketing",
    "authentication": "Authentication",
    "permissions": "Permissions",
    "people-households-orgs": "People & Relationships",
    "people-households-orgs-ui": "People & Relationships",
    "privacy-retention": "Privacy & Retention",
    "audit-logging": "Audit Logging",
    "workflow-automation-substrate": "Workflow Substrate",
    "notification-preferences": "Notifications",
    "delivery-providers": "Notifications",
    "branding-whitelabel": "Branding Experience",
    "custom-module-names": "Branding Experience",
    "forms": "Custom Fields & Forms",
    "fields-config": "Custom Fields & Forms",
    "documents": "Document Center",
    "integrations": "Integrations Runtime",
    "integrations-catalog": "Integrations Catalog",
    "api-platform": "API Platform",
    "webhooks-platform": "Webhooks Platform",
    "import-export": "Data Movement",
    "mass-actions-data": "Data Movement",
    "mass-actions-productivity": "Data Movement",
    "navigation": "Menu Navigation",
    "homepage": "Menu Navigation",
    "lists": "Menu Navigation",
    "search": "Search Platform",
    "operational-reporting": "Reporting Platform",
    "analytical-reporting": "Reporting Platform",
    "intelligent-insights": "Reporting Platform",
    "vendor-contracts": "Vendor Management",
    "ai-platform-cap": "Productized AI",
    "ai-enablement": "Operational AI",
    # --- Admin Workflows ---
    "applications-registration": "Applications & Registration",
    "attendee-camper-management": "Attendee Management",
    "waitlists-capacity": "Waitlists & Capacity",
    "season": "Camp Setup",
    "offering-setup": "Program Planning",
    "camp-productivity": "Camp Productivity",
    "activity-scheduling": "Scheduling",
    "scheduling-primitives": "Scheduling Substrate",
    "medical-health": "Medical Operations",
    "housing-bunking": "Housing & Grouping",
    "attendance-checkin": "Attendance Check-in",
    "camper-location": "Location Tracking",
    "overnight-travel": "Overnight Travel",
    "day-travel": "Day Travel",
    "staff-travel": "Staff Travel",
    "food-service": "Food Service Ops",
    "facilities-maintenance": "Facilities & Maintenance",
    "inventory-supply": "Inventory & Supply",
    # --- Community ---
    "staff-recruiting-hiring": "Recruiting & Hiring",
    "staff-scheduling-assignments": "Staff Scheduling & Assignments",
    "staff-onboarding-training": "Onboarding & Training",
    "staff-background-checks": "Onboarding & Training",
    "staff-reference-checks": "Onboarding & Training",
    "staff-contracts": "Onboarding & Training",
    "international-staff-management": "International Staff",
    "staff-time-attendance": "Time & Attendance",
    "payroll-disbursements": "Payroll Disbursements",
    "staff-payroll-management": "Staff Payroll",
    "ad-hoc-comms": "Family Communication",
    "automated-comms": "Family Communication",
    "two-way-convos": "Family Communication",
    "external-comms-capture": "Family Communication",
    "comms-preferences": "Family Communication",
    "marketing-recruitment": "Marketing & Recruitment",
    "media": "Media",
    "community-engagement": "Community Engagement",
    "camp-store-pos": "Camp Store / POS",
    "alumni-management": "Alumni Management",
    "fundraising-management": "Fundraising Management",
    "incident-safeguarding": "Incident Management",
    "compliance-licensing": "Compliance & Licensing",
    "risk-emergency-planning": "Risk & Emergency Plans",
    # --- UltraCamp / Unclaimed ---
    "all-ultracamp-cap": "UltraCamp",
    "independent-schools": "UltraCamp",
    "rentals-events-cap": "Events and Rentals",
}

# Old capabilities with no sticky on the new map. Their epics are re-cut below
# (REHOME) rather than anchored to an invented capability.
ORPHANS = {
    "family-portal": "parent experience — decomposed across capabilities",
    "missing-family-things": "parent experience — decomposed across capabilities",
    "luggage-services": "kept in Admin Workflows under Transportation",
}

# Capability ids that don't follow the slug rule (they predate it in taxonomy.ts).
CAP_ID_OVERRIDE_IDS = {"Luggage Services": "luggage-services"}

# Luggage stays in the same domain, so it needs a capability under Transportation.
ADDED_CAPS = {
    "Luggage Services": {"module": "Transportation",
                         "domain": "Admin Workflows (impacts mostly just the admin)"},
}

# Parent experience is not one team's to own — a "Family Portal" capability would
# have implied it was. Instead the six parent-experience epics are re-cut against
# the capabilities that actually deliver each piece (forms are owned by Custom
# Fields, money by Payments, household by People & Orgs), held together by the
# JTBD and by one cross-team initiative.
PARENT_INITIATIVE = "Parent Experience Convergence"
FQ = {
    "FY27-Q2 Winter'26": ("2026-12-01", "2027-02-28"),
    "FY27-Q3 Spring'27": ("2027-03-01", "2027-05-31"),
    "FY27-Q4 Summer'27": ("2027-06-01", "2027-08-31"),
    "FY28-Q1 Fall'27":   ("2027-09-01", "2027-11-30"),
    "FY28-Q2 Winter'27": ("2027-12-01", "2028-02-29"),
    "FY28-Q3 Spring'28": ("2028-03-01", "2028-05-31"),
}
# (capability, title, type, persona, delivery, outcome, kr_metric, quarter,
#  initiative, replaces, note)
REHOME = [
    ("Community Engagement", "Show parents what's due, per child", "both", "Parent",
     "Parent dashboard organised by 'what's due', per child",
     "parents see exactly what to do next for each kid; fewer support calls",
     "task completion; support tickets down", "FY27-Q2 Winter'26", PARENT_INITIATIVE,
     "Task-driven parent dashboard",
     "The dashboard surface only. The things it surfaces — forms, money, registration "
     "status — are separate epics on their owning capabilities."),
    ("Custom Fields & Forms", "Let families complete forms in the parent app", "both",
     "Parent", "Family-facing form completion and e-sign inside the parent app",
     "parents finish paperwork on their phone instead of chasing a PDF",
     "form completion rate; e-sign completion", "FY27-Q3 Spring'27", PARENT_INITIATIVE,
     "Family Portal modern",
     "Split out because most of what parents experience as 'the portal' is forms, "
     "owned by Custom Fields rather than by a parent-experience team."),
    ("Family Billing", "Show families what they owe and let them pay in-app", "both",
     "Parent", "Household balance, statements and pay-now inside the parent app",
     "parents settle a balance without calling the camp office",
     "in-app payment rate; AR days", "FY27-Q3 Spring'27", PARENT_INITIATIVE,
     "Family Portal modern",
     "The money half of the parent experience, owned by Payments."),
    ("Applications & Registration", "Show families their registration & session status",
     "both", "Parent",
     "Registration, session and waitlist status surfaced to families",
     "families know where they stand without emailing the registrar",
     "status views; registrar emails down", "FY27-Q2 Winter'26", PARENT_INITIATIVE,
     "Task-driven parent dashboard",
     "Registration status is owned by Registrations, not by the dashboard that shows it."),
    ("People & Relationships", "Let families manage their own household", "new-value",
     "Parent", "Self-service household: caregivers, contacts and relationships",
     "families fix their own household data instead of asking staff to do it",
     "self-service edits; staff edits down", "FY27-Q3 Spring'27", PARENT_INITIATIVE,
     "Per-child visibility + self-service household",
     "Household structure is a People & Orgs capability; the parent app is a consumer."),
    ("Community Engagement", "Merge Camp inTouch + Campanion (phase 1)", "modernize",
     "Parent", "First phase of the unified parent app",
     "parents start using one app instead of two",
     "features consolidated", "FY27-Q3 Spring'27", PARENT_INITIATIVE,
     "Parent Experience Convergence pt 1", ""),
    ("Community Engagement", "Move the parent journey onto one app (phase 2)",
     "modernize", "Parent", "Convergence phase 2",
     "more of the parent journey lives in the single app",
     "features migrated", "FY28-Q1 Fall'27", PARENT_INITIATIVE,
     "Parent Experience Convergence pt 2", ""),
    ("Community Engagement", "Retire Camp inTouch", "modernize", "Parent",
     "Convergence complete; legacy Camp inTouch decommissioned",
     "one unified modern parent app end to end",
     "legacy CIT retired", "FY28-Q2 Winter'27", PARENT_INITIATIVE,
     "Parent Experience Convergence complete", ""),
    ("Luggage Services", "Get every trunk to the right cabin", "new-value", "Admin",
     "Luggage manifests, tagging and delivery tracking",
     "camps move camper luggage without a clipboard and a manual list",
     "luggage tracked; misdeliveries", "FY28-Q3 Spring'28", "",
     "Get every trunk to the right cabin",
     "Kept in Admin Workflows under Transportation; needs a Luggage Services "
     "capability added to the map."),
]

# ------------------------------------------------------- new capability index
cap_index = {}   # label -> {module, domain}
for c in NEW["capabilities"]:
    label = LABEL_FIX.get(c["label"], c["label"])
    mod = MODULES.get(c["module_id"], {}).get("label", "(no module)")
    cap_index[label] = {
        "module": mod,
        "domain": DOMAINS.get(c["domain_id"], "??").strip(),
    }
cap_index.update(ADDED_CAPS)
missing = sorted(set(FOLD.values()) - set(cap_index))
assert not missing, f"FOLD targets not on the map: {missing}"

# ------------------------------------------------------ read previous pass
caps_old = {r["capability_id"]: r for r in
            csv.DictReader(open(os.path.join(HERE, "2_capabilities.csv")))}
epics = list(csv.DictReader(open(os.path.join(HERE, "3_epics.csv"))))

unmapped = sorted(set(caps_old) - set(FOLD) - set(ORPHANS))
assert not unmapped, f"old capabilities with no fold and no orphan note: {unmapped}"

# ------------------------------------------------------------ rewrite epics
kept = []
for e in epics:
    old = e["capability_id"]
    e["initiative"] = ""
    if old in ORPHANS:
        continue                       # re-cut below instead of re-anchored
    new_label = FOLD[old]
    idx = cap_index[new_label]
    e["new_domain"], e["new_module"], e["new_capability"] = (
        idx["domain"], idx["module"], new_label)
    moved = idx["domain"] != e["domain"]
    e["migration"] = ("domain change: %s -> %s" % (e["domain"], idx["domain"])
                      if moved else "same domain")
    kept.append(e)

# The re-cut epics. Each inherits its capability's JTBD and stance like any other.
replaced = {e["title"]: e for e in epics if e["capability_id"] in ORPHANS}
cap_jtbd = {}
cap_stance = {}
for cid, r in caps_old.items():
    if cid in FOLD:
        cap_jtbd.setdefault(FOLD[cid], r["jtbd"])
        cap_stance.setdefault(FOLD[cid], r["stance"])
seq = collections.Counter()
for (cap, title, typ, persona, delivery, outcome, metric, q, init, from_title,
     note) in REHOME:
    idx = cap_index[cap]
    start, end = FQ[q]
    src = replaced.get(from_title, {})
    slug = cap.lower().replace(" & ", "-").replace(" / ", "-").replace(" ", "-")
    seq[slug] += 1
    horizon = ("now" if start < "2027-03-01"
               else "next" if start < "2027-09-01" else "later")
    kept.append({
        **{k: "" for k in epics[0]},
        "epic_id": f"ep-{slug}-p{seq[slug]:02d}",
        "title": title,
        "capability_id": "", "capability_label": cap,
        "team_subdomain": "", "domain": "", "domain_owner": "",
        "jtbd": cap_jtbd.get(cap, src.get("jtbd", "")),
        "stance": cap_stance.get(cap, src.get("stance", "")),
        "type": typ, "persona": persona,
        "delivery_what_ships": delivery, "outcome_so_that": outcome,
        "kr_metric": metric, "kr_unit": "", "kr_baseline": "", "kr_target": "",
        "kr_current": "",
        "quarter": q, "target_start": start, "target_end": end,
        "date_basis": "planned" if start < "2027-09-01" else "directional",
        "horizon": horizon,
        "stage": {"now": "Building", "next": "Solutioning", "later": "Discovery"}[horizon],
        "source": "re-cut",
        "gaps": "kr-baseline+target",
        "review_notes": (f"Re-cut from '{from_title}', which had no capability on the "
                         f"new map. {note}").strip(),
        "new_domain": idx["domain"], "new_module": idx["module"],
        "new_capability": cap,
        "initiative": init,
        "migration": "re-cut onto the new map",
    })
epics = kept

# One id convention for every epic, derived from the capability it actually ends
# up on. Previously sheet epics kept an id built from their pre-migration
# capability ("ep-payments-processing-01" anchored to "payment-processing") while
# re-cut ones used the new slug — two conventions, and the older one named a
# capability that no longer exists. Ordered by date then title so the numbering is
# reproducible across runs.
def cap_slug(label):
    if label in CAP_ID_OVERRIDE_IDS:
        return CAP_ID_OVERRIDE_IDS[label]
    t = label.lower().replace(" & ", " ").replace(" / ", " ").replace("/", " ")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


renumber = collections.Counter()
for e in sorted(epics, key=lambda x: (x["new_capability"], x["target_start"],
                                      x["title"])):
    slug = cap_slug(e["new_capability"])
    renumber[slug] += 1
    e["epic_id"] = f"ep-{slug}-{renumber[slug]:02d}"
assert len({e["epic_id"] for e in epics}) == len(epics), "epic ids must be unique"

cols = list(epics[0].keys())
with open(os.path.join(HERE, "3_epics.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for e in sorted(epics, key=lambda x: (x["new_domain"] or "zz", x["new_module"],
                                          x["new_capability"], x["target_start"])):
        w.writerow(e)

# ------------------------------------------------- rewrite the capability spine
folded = collections.defaultdict(list)
for old, new_label in FOLD.items():
    folded[new_label].append(old)
epic_count = collections.Counter(
    e["new_capability"] for e in epics if e["new_capability"])

with open(os.path.join(HERE, "2_capabilities.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["capability", "module", "domain", "jtbd", "stance", "epic_count",
                "folds_in_old_capabilities", "jtbd_conflict", "review_notes"])
    for label in sorted(cap_index, key=lambda l: (cap_index[l]["domain"],
                                                  cap_index[l]["module"], l)):
        idx = cap_index[label]
        olds = sorted(folded.get(label, []))
        jtbds = sorted({caps_old[o]["jtbd"] for o in olds if caps_old.get(o, {}).get("jtbd")})
        stances = sorted({caps_old[o]["stance"] for o in olds if caps_old.get(o, {}).get("stance")})
        conflict = "; ".join(jtbds) if len(jtbds) > 1 else ""
        notes = []
        if len(olds) > 1:
            notes.append(f"Consolidates {len(olds)} previous capabilities.")
        if len(stances) > 1:
            notes.append("Stance differs across the folded capabilities: "
                         + "; ".join(stances) + " — pick one.")
        if not olds:
            notes.append("On the new map with no predecessor — new capability.")
        if not epic_count[label]:
            notes.append("No epic yet.")
        w.writerow([label, idx["module"], idx["domain"],
                    jtbds[0] if jtbds else "", stances[0] if stances else "",
                    epic_count[label], ", ".join(olds), conflict, " ".join(notes)])

# ------------------------------------------------------------------- teams
# Eng leads read off the org-chart page of the same export.
LEAD = {"UltraCamp": "Mike Hart", "Apollo": "Dani", "Alpha": "Jeremy",
        "Data Team": "David", "AI Platform Team": "Rob (Eng Director, Platform)",
        "FANCY TEAM 1": "Dani", "FANCY TEAM 2": "Tracie", "FANCY TEAM 3": "Tracie",
        "Customer Love": ""}
# Modules each team appears over on the board, read off the screenshot's geometry
# (the export carries containment, not position — see review_notes). Names are
# proposed from what the team owns.
# Naming convention: "<Domain> — <Scope>", with the qualifier only where a domain
# holds more than one team. The name should say where the team sits on the map,
# not be a codename you have to look up.
OWNS = {
    "FANCY TEAM 2": (["Account & Service", "Access Control", "People & Orgs",
                      "Alerts & Automation", "Branding", "Policies & Consent",
                      "Navigation"], "Platform — Identity & Core Services",
                     "Access Control, Account & Service, People & Orgs and Policies & "
                     "Consent are one coherent identity/account scope. Alerts & "
                     "Automation, Branding and Navigation ride along and are the loose "
                     "ends in this name."),
    "FANCY TEAM 3": (["Payments"], "Platform — Payments",
                     "One module, end to end. Named for it."),
    "FANCY TEAM 1": (["Registrations", "Program Offerings", "Internal Comms",
                      "Scheduling", "Health & Medical", "Housing", "Camper Location",
                      "Transportation", "Food Services", "Facilities"],
                     "Admin Workflows",
                     "Owns the entire Admin Workflows domain, so it takes the domain "
                     "name with no qualifier."),
    "Data Team": (["Reporting", "Custom Fields", "Integrations", "Vendors"],
                  "Platform — Data & Integrations",
                  "Reporting, data movement and every inbound/outbound connection."),
    "AI Platform Team": (["AI Platform"], "Platform — AI",
                         "One module. Prefixed for consistency with the other three "
                         "Product Platform teams."),
    "Apollo": (["Staff", "Family Comms"], "Community — Staff & Family Comms",
               "Both modules named directly; they are the two people-facing comms "
               "surfaces in the Community domain."),
    "Alpha": (["Community & Media", "Camp Store", "Alumni", "Fundraising",
               "Safety & Incidents"], "Community — Engagement & Advancement",
              "Community & Media plus Alumni and Fundraising are engagement and "
              "advancement. Camp Store and Safety & Incidents sit outside that name — "
              "a scope question, not a naming one."),
    "Customer Love": ([], "Admin Workflows — Customer Love",
                      "Placed inside Admin Workflows on the map. A standing team now, "
                      "not the Summer '26 tiger team. Keeps its name because it is a "
                      "function, not a domain slice."),
    "UltraCamp": ([], "UltraCamp",
                  "Owns the whole UltraCamp domain; takes the domain name."),
}
with open(os.path.join(HERE, "4_teams.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["team_on_map", "proposed_name", "size", "eng_lead",
                "placed_in_on_map", "owns_modules_inferred", "naming_rationale",
                "review_notes"])
    for t in NEW["teams"]:
        placed = ", ".join(
            DOMAINS.get(p, MODULES.get(p, {}).get("label", p)).strip()
            for p in t["parents"])
        mods, proposed, why = OWNS.get(t["team"], ([], t["team"], ""))
        note = ("" if placed else
                "Ownership inferred from the screenshot's geometry — the Lucid export "
                "carries containment, not position, so this needs confirming.")
        w.writerow([t["team"], proposed, t["size"], LEAD.get(t["team"], ""), placed,
                    "; ".join(mods), why, note])

print(f"epics {len(epics)}  |  needing a home: "
      f"{sum(1 for e in epics if not e['new_capability'])}")
print(f"capabilities {len(cap_index)} (from {len(caps_old)})")
print("\ndomain moves:")
for k, v in collections.Counter(
        e["migration"] for e in epics if e["migration"].startswith("domain")).most_common():
    print(f"  {v:>3}  {k}")
print("\nepics needing a home:")
for e in epics:
    if not e["new_capability"]:
        print(f"  [{e['capability_id']}] {e['title']}")
