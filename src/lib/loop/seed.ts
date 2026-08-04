import seedJson from "./seed-data.json";
import {
  migrateItems,
  normalizeBets,
  normalizeMilestones,
} from "./logic";
import type { Bet, Item, Milestone, Weights } from "./types";

// The two-year roadmap shipped with Loop, generated from the Architecture-Aligned
// Org Chart plus the Epic Seed sheet by docs/seed-redesign/build_import.py: one
// epic per outcome, each anchored to a module so it lands in the right
// domain/JTBD, tagged Modernize / New value / Both, and assigned to one of the
// nine delivery teams. Spans the already-shipped AskCamp surfaces, the in-flight
// Summer '26 work (Registration modernization, the enrollment-reporting MVP, the
// Customer Love team, the UltraCamp payments rollout) and the FY27-Q1 → FY28-Q4
// window beyond it. Regenerate rather than hand-edit. Seeds an empty DB.
export const SEED_WEIGHTS: Weights = seedJson.weights as Weights;

export function seedItems(): Item[] {
  return migrateItems(
    JSON.parse(JSON.stringify(seedJson.items)) as Item[],
  );
}

// The cross-team bets. Registration starts with no items linked — a user
// links the work that makes it up. Parent Experience Convergence ships linked,
// because it is the worked example of why bets exist: no single team owns
// the parent experience, so its epics sit on Community Engagement, Custom Fields
// & Forms, Family Billing, Applications & Registration and People &
// Relationships, and only the bet shows them as one program.
export function seedBets(): Bet[] {
  return normalizeBets(
    JSON.parse(JSON.stringify(seedJson.bets ?? [])) as Bet[],
  );
}

// The cross-team milestones — the program-level markers (Registration + Payments GA, enrollment opening on the
// modern flow, the ~Apr-2028 modernization-complete flag, and so on) drawn as
// pinned flags across the top of the timeline. Seeds an empty database.
export function seedMilestones(): Milestone[] {
  return normalizeMilestones(
    JSON.parse(JSON.stringify(seedJson.milestones ?? [])) as Milestone[],
  );
}
