#!/usr/bin/env python3
"""Generate the normalized seed-review CSVs from the Epic Seed sheet plus the
vendored pre-rebuild snapshots (old-taxonomy.json, old-seed.json).

Reads nothing the pipeline writes, so it is safe to re-run.

Emits three files:
  1_jtbds.csv         31 jobs-to-be-done (the customer-value roll-up)
  2_capabilities.csv  the capability spine: sub-domain/domain owner + JTBD + stance
  3_epics.csv         one row per epic, anchored to a capability
"""
import csv, json, re, collections, os

OUT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(OUT, "..", ".."))
SRC = os.path.join(OUT, "epic-seed-source.csv")

# ---------------------------------------------------------------- taxonomy
# Read from the vendored pre-rebuild snapshot, NOT from src/lib/loop/taxonomy.ts.
# gen_taxonomy.py overwrites that file later in the pipeline, so reading it live
# made this script work exactly once. The fold table below only needs the old map,
# and the old map never changes again.
_old = json.load(open(os.path.join(OUT, "old-taxonomy.json")))
EXISTING_CAPS = {c["id"]: (c["label"], c["subdomainId"]) for c in _old["capabilities"]}
SUBDOMAINS = {s["id"]: (s["label"], s["domainId"]) for s in _old["subdomains"]}
DOMAINS = {d["id"]: (d["label"], d["owner"]) for d in _old["domains"]}
assert (len(EXISTING_CAPS), len(SUBDOMAINS), len(DOMAINS)) == (73, 16, 5)

# Campminder's own business operations (product ops, support tooling, RevOps,
# B2B sales) get their own top-level domain rather than a sub-domain parked in
# Unclaimed Property — it is a real domain, it just has no owner yet. Mirrors the
# UltraCamp shape: one domain, one sub-domain of the same name.
NEW_DOMAINS = {
    "campco": ("CampCo Ops", ""),   # owner deliberately empty — unowned
}
NEW_SUBDOMAINS = {
    "campco-ops": ("CampCo Ops", "campco"),
}
DOMAINS.update(NEW_DOMAINS)
SUBDOMAINS.update(NEW_SUBDOMAINS)

# Capabilities the Epic Seed needs that taxonomy.ts doesn't have yet.
NEW_CAPS = {
    "staff-scheduling-assignments": ("Staff Scheduling & Assignments", "staff"),
    "staff-onboarding-training":    ("Staff Onboarding & Training", "staff"),
    "staff-time-attendance":        ("Time & Attendance (staff clock-in/out)", "staff"),
    "staff-travel":                 ("Staff Travel", "staff"),
    "privacy-retention":            ("Privacy / Retention / Data Rights", "access"),
    "integrations-catalog":         ("Integrations Catalog", "integration"),
    "camper-location":              ("Camper Location Tracking", "camp-ops"),
    "facilities-maintenance":       ("Facilities & Maintenance (incl. off-season)", "camp-ops"),
    "inventory-supply":             ("Inventory & Supply", "camp-ops"),
    "food-service":                 ("Food Service Operations", "camp-ops"),
    "vendor-contracts":             ("Vendor & Contract Management", "camp-ops"),
    "incident-safeguarding":        ("Incident / Safeguarding Management", "camp-ops"),
    "risk-emergency-planning":      ("Risk, Safety & Emergency Planning", "camp-ops"),
    "compliance-licensing":         ("Compliance, Licensing & Accreditation", "camp-ops"),
    "product-ops":                  ("Product Ops (flags, tenant toggles, config)", "campco-ops"),
    "support-operations":           ("Support Operations (internal tools)", "campco-ops"),
    "campco-billing-revops":        ("Billing / RevOps (Campminder business)", "campco-ops"),
    "campco-sales-marketing":       ("Sales & Marketing (Campminder B2B)", "campco-ops"),
    # Split out of All Things UltraCamp so the convergence lane and the new-segment
    # adjacency don't have to share one JTBD.
    "independent-schools":          ("Independent Schools (adjacency)", "all-ultracamp"),
}
ALL_CAPS = dict(EXISTING_CAPS)
ALL_CAPS.update(NEW_CAPS)

# ------------------------------------------------- module -> capability map
# Most are pure label drift. A handful are judgment calls, flagged in NOTES.
MODULE_CAP = {
    "Payment Processing": "payments-processing",
    "Staff Recruiting & Hiring": "staff-recruiting-hiring",
    "Staff Scheduling & Assignments": "staff-scheduling-assignments",
    "Staff Onboarding & Training": "staff-onboarding-training",
    "Time & Attendance (staff clock-in/out)": "staff-time-attendance",
    "Payroll / Stipends / Disbursements": "payroll-disbursements",
    "Staff Travel": "staff-travel",
    "International Staff Management": "international-staff-management",
    "Staff Payroll Management": "staff-payroll-management",
    "Applications & Registration Management": "applications-registration",
    "Attendee / Camper Management": "attendee-camper-management",
    "Waitlists & Capacity Management": "waitlists-capacity",
    "Media (Photos/Albums/Video)": "media",
    "People, Households & Organizations": "people-households-orgs",
    "Authentication": "authentication",
    "Permissions": "permissions",
    "Entitlements": "entitlements",
    "Privacy / Retention / Data Rights": "privacy-retention",
    "Audit Logging": "audit-logging",
    "Family Communication": "ad-hoc-comms",
    "Notifications": "delivery-providers",
    "Custom Fields & Custom Forms": "forms",
    "Document Center": "documents",
    "Workflow / Automation Substrate": "workflow-automation-substrate",
    "Branding & White-Label Experience": "branding-whitelabel",
    "Integrations Runtime": "integrations",
    "API Platform": "api-platform",
    "Webhooks Platform": "webhooks-platform",
    "Search Platform": "search",
    "Menu Navigation": "navigation",
    "Data Movement (Import/Export/Bulk Ops)": "import-export",
    "Integrations Catalog": "integrations-catalog",
    "Camp Setup & Season/Session Configuration": "season",
    "Program & Activity Planning": "offering-setup",
    "Attendance & Check-in/out": "attendance-checkin",
    "Housing, Bunking & Grouping": "housing-bunking",
    "Scheduling (Activity scheduling + roster mgmt)": "activity-scheduling",
    "Scheduling Substrate (time primitives)": "scheduling-primitives",
    "Camper Location Tracking": "camper-location",
    "Overnight Travel": "overnight-travel",
    "Day Travel": "day-travel",
    "Camp Productivity (bulletins, tasks, notes)": "camp-productivity",
    "Facilities & Maintenance (incl. off-season)": "facilities-maintenance",
    "Inventory & Supply (general)": "inventory-supply",
    "Food Service Operations": "food-service",
    "Camp Store / POS": "camp-store-pos",
    "Vendor & Contract Management": "vendor-contracts",
    "Medical / Health Operations": "medical-health",
    "Incident / Safeguarding Management": "incident-safeguarding",
    "Risk, Safety & Emergency Planning": "risk-emergency-planning",
    "Compliance, Licensing & Accreditation": "compliance-licensing",
    "Family Billing": "family-billing",
    "Camp Accounting": "camp-accounting",
    "Fundraising Management": "fundraising-management",
    "Alumni Management": "alumni-management",
    "Marketing & Recruitment": "marketing-recruitment",
    "Tenant & SaaS Administration": "tenant-saas-admin",
    "Product Ops (Feature flags, tenant toggles, config)": "product-ops",
    "Support Operations (internal tools)": "support-operations",
    "Billing / RevOps (Campminder business)": "campco-billing-revops",
    "Sales & Marketing (Campminder B2B)": "campco-sales-marketing",
    "Independent Schools (new adjacency)": "independent-schools",
}

# Modules that fan out to more than one capability — resolved per epic title.
EPIC_CAP = {
    # Reporting Platform splits across the three reporting capabilities.
    "Data lake & AI-reporting V1": "analytical-reporting",
    "Enrollment dashboard + scheduled reports": "operational-reporting",
    "Self-serve operational reporting + search": "operational-reporting",
    "Real-time operational reporting": "operational-reporting",
    "Intelligent insights & benchmarks": "intelligent-insights",
    # Community Engagement: the parent dashboard + convergence epics are Family
    # Portal work, not in-camp social. Deviates from the sheet — see notes.
    "Task-driven parent dashboard": "family-portal",
    "Parent Experience Convergence pt 1": "family-portal",
    "Parent Experience Convergence pt 2": "family-portal",
    "Parent Experience Convergence complete": "family-portal",
    # Financial Setup carries two distinct capabilities.
    "Financial setup self-serve": "financial-setup",
    "Promotion / offering / pricing setup": "promotion-setup",
    # Family Communication (submodule).
    "2-way conversations + external comms capture": "two-way-convos",
    "Agentic comms (AI drafts/answers)": "automated-comms",
    # AI Platform (new).
    "LLM orchestration + AskCamp": "ai-platform-cap",
    "MCP, skills & internal AI tooling": "ai-enablement",
    "AskMinder (natural-language query)": "ai-enablement",
}

NOTES = {
    "entitlements": "DECIDED: stays in Access (Platform), despite the sheet filing it under CampCo Business. It is a platform capability CampCo Ops consumes.",
    "tenant-saas-admin": "DECIDED: stays in Access (Platform), despite the sheet filing it under CampCo Business.",
    "offering-setup": "Sheet says team=Pre-Camp/Enrollment; capability lives in Financials ('define and price offerings'). Confirm the owning team.",
    "family-portal": "DECIDED: the parent dashboard + all 3 convergence epics move off Community Engagement to Family Portal — domain stays Community & Communications, team is Family.",
    "audit-logging": "Sheet says team=People & Identity; capability lives in Data & Analytics. Confirm.",
    "all-ultracamp-cap": "Absorbs the Independent Schools adjacency epic plus the whole UltraCamp lane carried over from the app seed.",
    "delivery-providers": "Sheet module was 'Notifications'; mapped to Delivery Providers (the epic is provider consolidation), not Notification Preferences.",
    "ad-hoc-comms": "Sheet module was 'Family Communication'; mapped to Ad Hoc Comms (the reusable send service).",
    "forms": "Sheet module was 'Custom Fields & Custom Forms'; mapped to Forms. Fields Config stays a separate capability.",
    "import-export": "Sheet module was 'Data Movement (Import/Export/Bulk Ops)'; Mass Actions remains a separate capability.",
    "integrations": "Sheet module was 'Integrations Runtime'. The partner-connector catalog is split out as a new capability.",
    "season": "Sheet module was 'Camp Setup & Season/Session Configuration'.",
}
for cid in NEW_CAPS:
    NOTES.setdefault(cid, "NEW capability — does not exist in taxonomy.ts yet.")
NOTES["staff-onboarding-training"] = (
    "NEW capability. DECIDED: absorbs Staff Background Checks, Staff Reference Checks "
    "and Staff Contracts, which are retired into it."
)
# DECIDED: onboarding takes these over. Kept as rows (not deleted) because they
# exist in taxonomy.ts today and any item anchored to them needs re-pointing.
DEPRECATED = {
    "staff-background-checks": "staff-onboarding-training",
    "staff-reference-checks": "staff-onboarding-training",
    "staff-contracts": "staff-onboarding-training",
}
# Two capability pairs in taxonomy.ts cover the same ground. Rather than invent
# an epic to justify each, flag the duplicate for a merge.
MERGE_CANDIDATES = {
    "mass-actions-data": "mass-actions-productivity",
    "notification-preferences": "comms-preferences",
}
for cid, into in DEPRECATED.items():
    NOTES[cid] = (f"RETIRE — folded into {ALL_CAPS[into][0]} per review. Any item "
                  f"anchored here must be re-pointed before the capability is removed.")
for cid, into in MERGE_CANDIDATES.items():
    NOTES[cid] = (f"Duplicate of {ALL_CAPS[into][0]} — same ground, two ids. Recommend "
                  f"merging rather than authoring an epic to justify it.")
NOTES["independent-schools"] = (
    "NEW capability, split out of All Things UltraCamp so the convergence lane keeps "
    "its own JTBD and the new-segment adjacency gets its own."
)
NOTES["product-ops"] = NOTES["support-operations"] = NOTES["campco-billing-revops"] = \
    NOTES["campco-sales-marketing"] = (
        "NEW capability in the NEW 'CampCo Business' sub-domain — parked in Unclaimed "
        "Property; needs a domain owner."
    )

# ------------------------------------------------------- fiscal calendar
# Campminder FY starts September 1. Q1 Sep-Nov, Q2 Dec-Feb, Q3 Mar-May, Q4 Jun-Aug.
# FY is named for the calendar year it ends in.
QUARTER_DATES = {
    "FY26-Q3 Spring'26":  ("2026-03-01", "2026-05-31"),
    "FY26-Q4 Summer'26":  ("2026-06-01", "2026-08-31"),
    "FY27-Q1 Fall'26":    ("2026-09-01", "2026-11-30"),
    "FY27-Q2 Winter'26":  ("2026-12-01", "2027-02-28"),
    "FY27-Q3 Spring'27":  ("2027-03-01", "2027-05-31"),
    "FY27-Q4 Summer'27":  ("2027-06-01", "2027-08-31"),
    "FY28-Q1 Fall'27":    ("2027-09-01", "2027-11-30"),
    "FY28-Q2 Winter'27":  ("2027-12-01", "2028-02-29"),
    "FY28-Q3 Spring'28":  ("2028-03-01", "2028-05-31"),
    "FY28-Q4 Summer'28":  ("2028-06-01", "2028-08-31"),
}

def quarter_for(start):
    for q, (s, e) in QUARTER_DATES.items():
        if s <= start <= e:
            return q
    return ""

def horizon_for(start):
    if start < "2027-03-01":
        return "now"
    if start < "2027-09-01":
        return "next"
    return "later"

TYPE_MAP = {"Modernize": "modernize", "New value": "new-value", "Both": "both"}

def unit_for(signal):
    s = signal.lower()
    if "%" in s or "rate" in s or "conversion" in s or "lift" in s:
        return "%"
    if "time" in s or "days" in s or "speed" in s:
        return "days"
    if any(w in s for w in ("incidents", "count", "logos", "consumers", "runs",
                            "reports", "automations", "connectors", "queries")):
        return "count"
    return ""

# ------------------------------------------------------------ the sheet
rows = [r for r in csv.DictReader(open(SRC)) if r.get("Epic (outcome-named)")]

# JTBD per capability (1:1 in the sheet, verified) and stance per capability.
cap_jtbd, cap_stance, cap_sheet_team = {}, {}, {}
for r in rows:
    title = r["Epic (outcome-named)"]
    cid = EPIC_CAP.get(title) or MODULE_CAP[r["Module (parent)"]]
    cap_jtbd.setdefault(cid, r["JTBD (parent)"])
    cap_stance.setdefault(cid, r["Stance"])
    cap_sheet_team.setdefault(cid, r["Owning Team"])

# Tidy the two placeholder JTBD labels from the sheet.
JTBD_RENAME = {
    "(new JTBD - adjacency)": "Expanding into Adjacent Segments",
    "(cross-cutting)": "Running AI Across the Platform",
}
cap_jtbd = {k: JTBD_RENAME.get(v, v) for k, v in cap_jtbd.items()}

# ----------------------------------------------- app seed carry-forward
# From the vendored pre-rebuild seed, not from src/lib/loop/seed-data.json —
# build_import.py overwrites that file later in the pipeline, so reading it live
# meant these carry-forward lookups worked exactly once.
_old_seed = json.load(open(os.path.join(OUT, "old-seed.json")))
by_title = {i["title"]: i for i in _old_seed["items"]}

# Items the sheet has no equivalent for: in-flight/shipped work with real dates
# and real KR readings, the whole UltraCamp lane, and a few lanes the sheet drops.
# (app title, capability override or None, jtbd override for caps the sheet misses)
CARRY = [
    ("Ask Camp", "two-way-convos"),
    ("AskCamp", "ai-platform-cap"),
    ("AskCamp polish + public launch", "ai-platform-cap"),
    ("Registration Modernization — MVP → GA", "applications-registration"),
    ("Enrollment reporting MVP on Databricks", "analytical-reporting"),
    ("Customer Love Tiger Team (Summer '26)", "camp-productivity"),
    ("UltraCamp new payment processor rollout", "all-ultracamp-cap"),
    ("No-regrets work + convergence assessment", "all-ultracamp-cap"),
    ("Shared-service adoption begins", "all-ultracamp-cap"),
    ("UltraCamp new registration", "all-ultracamp-cap"),
    ("In-season stability", "all-ultracamp-cap"),
    ("UltraCamp fundraising", "all-ultracamp-cap"),
    ("Modernization phase 3", "all-ultracamp-cap"),
    ("Modernization phase 4 / convergence", "all-ultracamp-cap"),
    ("Conference Center / Rentals & Events — needs an owner", "rentals-events-cap"),
    ("Family Portal modern", "family-portal"),
    ("Per-child visibility + self-service household", "missing-family-things"),
    ("Custom module names / vocabulary", "custom-module-names"),
    ("Automated + scheduled comms", "automated-comms"),
    ("Canonical schema + pipelines; Fields config", "fields-config"),
    ("Mass actions across records", "mass-actions-productivity"),
    ("Homepage rebuild", "homepage"),
]
# JTBD + stance for capabilities that only appear via carry-forward.
CARRY_CAP_META = {
    "rentals-events-cap":        ("Running Rentals & Events", "Optional/Deferable"),
    "missing-family-things":     ("Engaging Families & Community", "Table Stakes"),
    "custom-module-names":       ("Presenting the Camp's Brand Identity", "Nice-to-Have"),
    "fields-config":             ("Building Custom Fields, Forms & Documents", "Table Stakes"),
    "mass-actions-productivity": ("Navigating the Product", "Differentiator"),
    "camp-productivity":         ("Coordinating Internal Communication", "Nice-to-Have"),
    "two-way-convos":            ("Communicating with Families", "Table Stakes"),
    "ai-platform-cap":           ("Running AI Across the Platform", "Differentiator"),
    "analytical-reporting":      ("Building Reports", "Differentiator"),
    "family-portal":             ("Engaging Families & Community", "Optional/Deferable"),
    "automated-comms":           ("Communicating with Families", "Table Stakes"),
    "all-ultracamp-cap":         ("Converging UltraCamp", "Must Win"),
    "applications-registration": ("Managing Registrations", "Must Win"),
    "homepage":                  ("Navigating the Product", "Table Stakes"),
}
for cid, (j, s) in CARRY_CAP_META.items():
    cap_jtbd.setdefault(cid, j)
    cap_stance.setdefault(cid, s)

# Capabilities that exist in taxonomy.ts but have no epic on the two-year
# roadmap. They still need a JTBD + stance, or the model has holes in it — these
# are first-pass calls to react to, not decisions.
UNSCHEDULED_CAP_META = {
    "luggage-services":          ("Managing Transportation", "Optional/Deferable"),
    "people-households-orgs-ui": ("Managing People & Relationships", "Table Stakes"),
    "pricing-service":           ("Collecting & Managing Payments", "Table Stakes"),
    "lists":                     ("Navigating the Product", "Table Stakes"),
    "mass-actions-data":         ("Navigating the Product", "Differentiator"),
    "comms-preferences":         ("Communicating with Families", "Table Stakes"),
    "external-comms-capture":    ("Communicating with Families", "Table Stakes"),
    "notification-preferences":  ("Managing Alerts & Automated Actions", "Table Stakes"),
    "community-engagement":      ("Engaging Families & Community", "Optional/Deferable"),
    "telemetry-support":         ("Managing Your Software Account & Service", "Table Stakes"),
    "staff-background-checks":   ("Managing Staff", "Table Stakes"),
    "staff-contracts":           ("Managing Staff", "Table Stakes"),
    "staff-reference-checks":    ("Managing Staff", "Table Stakes"),
}
for cid, (j, s) in UNSCHEDULED_CAP_META.items():
    cap_jtbd.setdefault(cid, j)
    cap_stance.setdefault(cid, s)

# ------------------------------------------------------------- build epics
epics = []
seq = collections.Counter()

def add(cid, title, typ, persona, delivery, outcome, signal, quarter,
        start, end, basis, stage, source, note, kr=None):
    seq[cid] += 1
    label, subid = ALL_CAPS[cid]
    sub_label, dom_id = SUBDOMAINS[subid]
    dom_label, dom_owner = DOMAINS[dom_id]
    b = t = c = ""
    if kr:
        b = "" if kr.get("baseline") is None else kr["baseline"]
        t = "" if kr.get("target") is None else kr["target"]
        c = "" if kr.get("current") is None else kr["current"]
    epics.append({
        "epic_id": f"ep-{cid}-{seq[cid]:02d}",
        "title": title,
        "capability_id": cid,
        "capability_label": label,
        "team_subdomain": sub_label,
        "domain": dom_label,
        "domain_owner": dom_owner,
        "jtbd": cap_jtbd.get(cid, ""),
        "stance": cap_stance.get(cid, ""),
        "type": typ,
        "persona": persona,
        "delivery_what_ships": delivery,
        "outcome_so_that": outcome,
        "kr_metric": signal,
        "kr_unit": unit_for(signal),
        "kr_baseline": b,
        "kr_target": t,
        "kr_current": c,
        "quarter": quarter,
        "target_start": start,
        "target_end": end,
        "date_basis": basis,
        "horizon": horizon_for(start),
        "stage": stage,
        "source": source,
        "gaps": "",           # filled below
        "review_notes": note,
    })
    e = epics[-1]
    gaps = []
    if e["kr_baseline"] == "" or e["kr_target"] == "":
        gaps.append("kr-baseline+target")
    if not e["kr_metric"]:
        gaps.append("kr-metric")
    if not e["persona"]:
        gaps.append("persona")
    if not e["outcome_so_that"]:
        gaps.append("outcome")
    if not e["type"]:
        gaps.append("type")
    e["gaps"] = ", ".join(gaps)

# 1. carry-forward first, so real dates/KRs claim their ids before sheet rows
for title, cid in CARRY:
    it = by_title[title]
    start, end = it["targetStart"], it["targetEnd"]
    basis = "actual"
    note = "Carried from the app seed — real dates"
    if it.get("shippedAt"):
        note += " and a shipped KR reading"
    note += "; not in the Epic Seed sheet. Do not overwrite from a quarter label."
    add(cid, title, it.get("type") or "", "", it.get("description", ""),
        "", (it.get("kr") or {}).get("metric", ""), quarter_for(start),
        start, end, basis, it.get("stage", ""), "app-seed", note,
        kr=it.get("kr"))

# 2. the sheet's 92 epics
for r in rows:
    title = r["Epic (outcome-named)"]
    cid = EPIC_CAP.get(title) or MODULE_CAP[r["Module (parent)"]]
    q = r["Quarter"]
    start, end = QUARTER_DATES[q]
    basis = "planned" if r["Status"] == "Planned" else "directional"
    stage = {"now": "Building", "next": "Solutioning", "later": "Capture"}[horizon_for(start)]
    notes = []
    sheet_team = r["Owning Team"]
    label, subid = ALL_CAPS[cid]
    if cid in NOTES:
        notes.append(NOTES[cid])
    if r["Module (parent)"] in ("Reporting Platform (BI / Ops reporting)",
                                "Community Engagement (in-camp social)",
                                "Financial Setup", "Family Communication (submodule)",
                                "AI Platform (new)"):
        notes.append(f"Sheet module '{r['Module (parent)']}' fans out across capabilities; "
                     f"this epic anchored to {label}.")
    add(cid, title, TYPE_MAP[r["Type"]], r["Persona"], r["Delivery (what ships)"],
        r["Outcome (so that…)"], r["Leading signal"], q, start, end, basis,
        stage, "epic-seed-sheet", " ".join(notes))

# 3. epics drafted for capabilities that had none. Written in the sheet's
#    outcome-named voice, but these are proposals — nobody has agreed to them.
DRAFTED = [
    ("people-households-orgs-ui", "Manage people & households in a modern UI", "modernize",
     "Admin", "Modern admin UI over the UPR — person/household/org records and the "
     "relationships between them",
     "admins edit family and org records without dropping into a legacy screen",
     "records edited in the modern UI", "FY28-Q1 Fall'27",
     "Follows the UPR service epic — the service ships first, this is the surface on top of it."),
    ("lists", "Work from live lists instead of exports", "modernize",
     "Admin", "Saved, filterable, permission-aware record lists with bulk selection",
     "admins work from a live list instead of exporting to a spreadsheet",
     "lists saved & reused; exports down", "FY27-Q3 Spring'27",
     "The app seed bundles Lists into the navigation epic; split out so the capability has its own outcome."),
    ("pricing-service", "Price every offering from one service", "modernize",
     "Bookkeeper", "Shared pricing engine behind tuition, store and add-ons",
     "a price or fee change lands everywhere at once instead of in three places",
     "% of priced surfaces on the shared service", "FY28-Q1 Fall'27", ""),
    ("comms-preferences", "Let families control how they're contacted", "new-value",
     "Parent", "Per-channel, per-topic contact preferences, honored by every sender",
     "families get the messages they want and camps stay compliant",
     "opt-out honored rate; preference set rate", "FY28-Q1 Fall'27",
     "Absorbs Notification Preferences if that merge is approved."),
    ("external-comms-capture", "Capture external email threads on the record", "new-value",
     "Admin", "Inbound email and forwarded threads captured onto the camper/family record",
     "the full conversation lives with the record instead of in someone's inbox",
     "threads captured; % of family comms in-app", "FY28-Q2 Winter'27",
     "Splits the sheet's '2-way conversations + external comms capture' epic, which bundles two capabilities."),
    ("community-engagement", "Give camp families a shared social space", "new-value",
     "Parent", "In-camp social feed, groups and reactions inside the unified parent app",
     "families feel part of the camp community between sessions, not just during them",
     "active families in the feed", "FY28-Q4 Summer'28",
     "The capability the parent-convergence epics were moved off of — this is what actually belongs here."),
    ("telemetry-support", "See product telemetry behind every support case", "new-value",
     "Support", "Usage and error telemetry surfaced to support in the context of a camp",
     "support diagnoses a camp's issue without scheduling a screen share",
     "cases resolved without a screen share", "FY28-Q2 Winter'27",
     "Sits in the Communication sub-domain today, which looks wrong now that CampCo Ops exists — "
     "consider moving it next to Support Operations."),
    ("luggage-services", "Get every trunk to the right cabin", "new-value",
     "Admin", "Luggage manifests, tagging and delivery tracking",
     "camps move camper luggage without a clipboard and a manual list",
     "luggage tracked; misdeliveries", "FY28-Q3 Spring'28", ""),
]
for cid, title, typ, persona, delivery, outcome, signal, q, note in DRAFTED:
    start, end = QUARTER_DATES[q]
    basis = "planned" if start < "2027-09-01" else "directional"
    stage = {"now": "Building", "next": "Solutioning", "later": "Capture"}[horizon_for(start)]
    n = "DRAFTED to give this capability an epic — proposed, not agreed."
    if note:
        n += " " + note
    add(cid, title, typ, persona, delivery, outcome, signal, q, start, end,
        basis, stage, "drafted", n)

# ---------------------------------------------------------------- write out
EPIC_COLS = list(epics[0].keys())
with open(f"{OUT}/3_epics.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=EPIC_COLS)
    w.writeheader()
    for e in sorted(epics, key=lambda x: (x["domain"], x["team_subdomain"],
                                          x["capability_label"], x["target_start"])):
        w.writerow(e)

used = collections.Counter(e["capability_id"] for e in epics)
with open(f"{OUT}/2_capabilities.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["capability_id", "capability_label", "team_subdomain", "domain",
                "domain_owner", "jtbd", "stance", "taxonomy_status", "replaced_by",
                "epic_count", "sheet_owning_team", "review_notes"])
    for cid, (label, subid) in sorted(
            ALL_CAPS.items(),
            key=lambda kv: (SUBDOMAINS[kv[1][1]][1], SUBDOMAINS[kv[1][1]][0], kv[1][0])):
        sub_label, dom_id = SUBDOMAINS[subid]
        dom_label, dom_owner = DOMAINS[dom_id]
        if cid in DEPRECATED:
            status, replaced = "retire", DEPRECATED[cid]
        elif cid in MERGE_CANDIDATES:
            status, replaced = "merge-candidate", MERGE_CANDIDATES[cid]
        elif cid in NEW_CAPS:
            status, replaced = "NEW", ""
        else:
            status, replaced = "existing", ""
        note = NOTES.get(cid, "")
        if not used[cid] and status == "existing":
            note = ("No epic on the two-year roadmap — capability exists but is "
                    "unscheduled. " + note).strip()
        w.writerow([cid, label, sub_label, dom_label, dom_owner,
                    cap_jtbd.get(cid, ""), cap_stance.get(cid, ""), status, replaced,
                    used[cid], cap_sheet_team.get(cid, ""), note])

jt = collections.defaultdict(lambda: {"caps": set(), "epics": 0, "teams": set()})
for e in epics:
    if not e["jtbd"]:
        continue
    j = jt[e["jtbd"]]
    j["caps"].add(e["capability_label"])
    j["epics"] += 1
    j["teams"].add(e["team_subdomain"])
with open(f"{OUT}/1_jtbds.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["jtbd_id", "jtbd", "capability_count", "epic_count",
                "teams_touched", "capabilities", "review_notes"])
    for j in sorted(jt, key=lambda x: -jt[x]["epics"]):
        d = jt[j]
        jid = re.sub(r"[^a-z0-9]+", "-", j.lower()).strip("-")
        note = ("Spans more than one team — this is the JTBD roll-up doing work "
                "the org chart can't." if len(d["teams"]) > 1 else "")
        w.writerow([jid, j, len(d["caps"]), d["epics"], "; ".join(sorted(d["teams"])),
                    "; ".join(sorted(d["caps"])), note])

print(f"epics: {len(epics)}  (sheet {sum(1 for e in epics if e['source']=='epic-seed-sheet')}, "
      f"carried {sum(1 for e in epics if e['source']=='app-seed')})")
print(f"capabilities: {len(ALL_CAPS)} ({len(NEW_CAPS)} new)   unscheduled: {sum(1 for c in ALL_CAPS if not used[c])}")
print(f"jtbds: {len(jt)}")
