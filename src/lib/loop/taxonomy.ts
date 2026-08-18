// The JTBD map — a stable ownership taxonomy the roadmap can group by:
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

export const DOMAINS: Domain[] = [
  { id: "product-platform", label: "Product Platform", owner: "Jared" },
  { id: "core", label: "Core", owner: "Ellen" },
  { id: "community", label: "Community", owner: "Anna" },
  { id: "ultracamp", label: "UltraCamp", owner: "Ali" },
  { id: UNCLAIMED_DOMAIN_ID, label: "Unclaimed Property", owner: "" },
];

export const JTBDS: Jtbd[] = [
  { id: "ai-platform", label: "AI Platform", domainId: "product-platform" },
  { id: "access-control", label: "Access Control", domainId: "product-platform" },
  { id: "account-service", label: "Account & Service", domainId: "product-platform" },
  { id: "alerts-automation", label: "Alerts & Automation", domainId: "product-platform" },
  { id: "branding", label: "Branding", domainId: "product-platform" },
  { id: "custom-fields", label: "Custom Fields", domainId: "product-platform" },
  { id: "integrations", label: "Integrations", domainId: "product-platform" },
  { id: "migration", label: "Migration", domainId: "product-platform" },
  { id: "navigation", label: "Navigation", domainId: "product-platform" },
  { id: "people-orgs", label: "People & Orgs", domainId: "product-platform" },
  { id: "policies-consent", label: "Policies & Consent", domainId: "product-platform" },
  { id: "reporting", label: "Reporting", domainId: "product-platform" },
  { id: "vendors", label: "Vendors", domainId: "product-platform" },
  { id: "camper-location", label: "Camper Location", domainId: "core" },
  { id: "facilities", label: "Facilities", domainId: "core" },
  { id: "food-services", label: "Food Services", domainId: "core" },
  { id: "health-medical", label: "Health & Medical", domainId: "core" },
  { id: "housing", label: "Housing", domainId: "core" },
  { id: "internal-comms", label: "Internal Comms", domainId: "core" },
  { id: "payments", label: "Payments", domainId: "core" },
  { id: "program-offerings", label: "Program Offerings", domainId: "core" },
  { id: "registrations", label: "Registrations", domainId: "core" },
  { id: "scheduling", label: "Scheduling", domainId: "core" },
  { id: "transportation", label: "Transportation", domainId: "core" },
  { id: "alumni", label: "Alumni", domainId: "community" },
  { id: "camp-store", label: "Camp Store", domainId: "community" },
  { id: "community-media", label: "Community & Media", domainId: "community" },
  { id: "family-comms", label: "Family Comms", domainId: "community" },
  { id: "fundraising", label: "Fundraising", domainId: "community" },
  { id: "safety-incidents", label: "Safety & Incidents", domainId: "community" },
  { id: "staff", label: "Staff", domainId: "community" },
  { id: "ultracamp", label: "UltraCamp", domainId: "ultracamp" },
  { id: "events-rentals", label: "Events & Rentals", domainId: UNCLAIMED_DOMAIN_ID },
];

export const MODULES: Module[] = [
  { id: "operational-ai", label: "Operational AI", jtbdId: "ai-platform" },
  { id: "productized-ai", label: "Productized AI", jtbdId: "ai-platform" },
  { id: "authentication", label: "Authentication", jtbdId: "access-control" },
  { id: "permissions", label: "Permissions", jtbdId: "access-control" },
  { id: "billing-revops", label: "Billing / RevOps", jtbdId: "account-service" },
  { id: "campco-sales-marketing", label: "CampCo Sales & Marketing", jtbdId: "account-service" },
  { id: "entitlements", label: "Entitlements", jtbdId: "account-service" },
  { id: "product-ops", label: "Product Ops", jtbdId: "account-service" },
  { id: "support-operations", label: "Support Operations", jtbdId: "account-service" },
  { id: "tenant-admin", label: "Tenant Admin", jtbdId: "account-service" },
  { id: "notifications", label: "Notifications", jtbdId: "alerts-automation" },
  { id: "workflow-substrate", label: "Workflow Substrate", jtbdId: "alerts-automation" },
  { id: "branding-experience", label: "Branding Experience", jtbdId: "branding" },
  { id: "custom-fields-forms", label: "Custom Fields & Forms", jtbdId: "custom-fields" },
  { id: "document-center", label: "Document Center", jtbdId: "custom-fields" },
  { id: "api-platform", label: "API Platform", jtbdId: "integrations" },
  { id: "data-movement", label: "Data Movement", jtbdId: "integrations" },
  { id: "integrations-catalog", label: "Integrations Catalog", jtbdId: "integrations" },
  { id: "integrations-runtime", label: "Integrations Runtime", jtbdId: "integrations" },
  { id: "webhooks-platform", label: "Webhooks Platform", jtbdId: "integrations" },
  { id: "migration-cohorts", label: "Migration Cohorts", jtbdId: "migration" },
  { id: "migration-tooling", label: "Migration Tooling", jtbdId: "migration" },
  { id: "menu-navigation", label: "Menu Navigation", jtbdId: "navigation" },
  { id: "search-platform", label: "Search Platform", jtbdId: "navigation" },
  { id: "people-relationships", label: "People & Relationships", jtbdId: "people-orgs" },
  { id: "audit-logging", label: "Audit Logging", jtbdId: "policies-consent" },
  { id: "privacy-retention", label: "Privacy & Retention", jtbdId: "policies-consent" },
  { id: "reporting-platform", label: "Reporting Platform", jtbdId: "reporting" },
  { id: "vendor-management", label: "Vendor Management", jtbdId: "vendors" },
  { id: "location-tracking", label: "Location Tracking", jtbdId: "camper-location" },
  { id: "facilities-maintenance", label: "Facilities & Maintenance", jtbdId: "facilities" },
  { id: "food-service-ops", label: "Food Service Ops", jtbdId: "food-services" },
  { id: "medical-operations", label: "Medical Operations", jtbdId: "health-medical" },
  { id: "attendance-check-in", label: "Attendance Check-in", jtbdId: "housing" },
  { id: "housing-grouping", label: "Housing & Grouping", jtbdId: "housing" },
  { id: "camp-productivity", label: "Camp Productivity", jtbdId: "internal-comms" },
  { id: "camp-accounting", label: "Camp Accounting", jtbdId: "payments" },
  { id: "family-billing", label: "Family Billing", jtbdId: "payments" },
  { id: "financial-setup", label: "Financial Setup", jtbdId: "payments" },
  { id: "payment-processing", label: "Payment Processing", jtbdId: "payments" },
  { id: "camp-setup", label: "Camp Setup", jtbdId: "program-offerings" },
  { id: "program-planning", label: "Program Planning", jtbdId: "program-offerings" },
  { id: "applications-registration", label: "Applications & Registration", jtbdId: "registrations" },
  { id: "attendee-management", label: "Attendee Management", jtbdId: "registrations" },
  { id: "waitlists-capacity", label: "Waitlists & Capacity", jtbdId: "registrations" },
  { id: "scheduling", label: "Scheduling", jtbdId: "scheduling" },
  { id: "scheduling-substrate", label: "Scheduling Substrate", jtbdId: "scheduling" },
  { id: "day-travel", label: "Day Travel", jtbdId: "transportation" },
  { id: "luggage-services", label: "Luggage Services", jtbdId: "transportation" },
  { id: "overnight-travel", label: "Overnight Travel", jtbdId: "transportation" },
  { id: "staff-travel", label: "Staff Travel", jtbdId: "transportation" },
  { id: "alumni-management", label: "Alumni Management", jtbdId: "alumni" },
  { id: "camp-store-pos", label: "Camp Store / POS", jtbdId: "camp-store" },
  { id: "inventory-supply", label: "Inventory & Supply", jtbdId: "camp-store" },
  { id: "community-engagement", label: "Community Engagement", jtbdId: "community-media" },
  { id: "media", label: "Media", jtbdId: "community-media" },
  { id: "family-communication", label: "Family Communication", jtbdId: "family-comms" },
  { id: "marketing-recruitment", label: "Marketing & Recruitment", jtbdId: "family-comms" },
  { id: "fundraising-management", label: "Fundraising Management", jtbdId: "fundraising" },
  { id: "compliance-licensing", label: "Compliance & Licensing", jtbdId: "safety-incidents" },
  { id: "incident-management", label: "Incident Management", jtbdId: "safety-incidents" },
  { id: "risk-emergency-plans", label: "Risk & Emergency Plans", jtbdId: "safety-incidents" },
  { id: "international-staff", label: "International Staff", jtbdId: "staff" },
  { id: "onboarding-training", label: "Onboarding & Training", jtbdId: "staff" },
  { id: "payroll-disbursements", label: "Payroll Disbursements", jtbdId: "staff" },
  { id: "recruiting-hiring", label: "Recruiting & Hiring", jtbdId: "staff" },
  { id: "staff-payroll", label: "Staff Payroll", jtbdId: "staff" },
  { id: "staff-scheduling-assignments", label: "Staff Scheduling & Assignments", jtbdId: "staff" },
  { id: "time-attendance", label: "Time & Attendance", jtbdId: "staff" },
  { id: "ultracamp", label: "UltraCamp", jtbdId: "ultracamp" },
  { id: "events-and-rentals", label: "Events and Rentals", jtbdId: "events-rentals" },
];

// The delivery teams. Order drives the team bands in the Team and timeline
// views, so it is grouped by domain.
export const TEAMS: Team[] = [
  {
    id: "platform-ai-platform",
    label: "Platform — AI Platform",
    domainId: "product-platform",
    lead: "Rob (Eng Director, Platform)",
    jtbdIds: ["ai-platform"],
  },
  {
    id: "platform-data-integrations",
    label: "Platform — Data & Integrations",
    domainId: "product-platform",
    lead: "David",
    jtbdIds: ["reporting", "custom-fields", "integrations", "vendors"],
  },
  {
    id: "platform-devops",
    label: "Platform — DevOps",
    domainId: "product-platform",
    lead: "",
    jtbdIds: [],
  },
  {
    id: "platform-identity-core-services",
    label: "Platform — Identity & Core Services",
    domainId: "product-platform",
    lead: "Tracie",
    jtbdIds: ["account-service", "access-control", "people-orgs", "alerts-automation", "branding", "policies-consent", "navigation"],
  },
  {
    id: "platform-migration",
    label: "Platform — Migration",
    domainId: "product-platform",
    lead: "",
    jtbdIds: ["migration"],
  },
  {
    id: "core-admin-workflows",
    label: "Core — Admin Workflows",
    domainId: "core",
    lead: "Dani",
    jtbdIds: ["registrations", "program-offerings", "internal-comms", "scheduling", "health-medical", "housing", "camper-location", "transportation", "food-services", "facilities"],
  },
  {
    id: "core-customer-love",
    label: "Core — Customer Love",
    domainId: "core",
    lead: "",
    jtbdIds: [],
  },
  {
    id: "core-financial-services",
    label: "Core — Financial Services",
    domainId: "core",
    lead: "Tracie",
    jtbdIds: ["payments"],
  },
  {
    id: "community-family-engagement-comms-service",
    label: "Community — Family Engagement & Comms Service",
    domainId: "community",
    lead: "Jeremy",
    jtbdIds: ["community-media", "camp-store", "alumni", "fundraising", "safety-incidents", "family-comms"],
  },
  {
    id: "community-staffing",
    label: "Community — Staffing",
    domainId: "community",
    lead: "Dani",
    jtbdIds: ["staff"],
  },
  {
    id: "ultracamp",
    label: "UltraCamp",
    domainId: "ultracamp",
    lead: "Mike Hart",
    jtbdIds: ["ultracamp"],
  },
];

// JTBDs no team owns yet: events-rentals.

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
