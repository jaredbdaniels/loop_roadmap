import { describe, expect, it } from "vitest";
import { MISSIONS } from "./constants";
import {
  DOMAINS,
  JTBDS,
  MODULES,
  TEAMS,
  TEAM_BY_JTBD,
  TEAM_DOMAIN,
  moduleTeam,
} from "./taxonomy";

// The taxonomy is generated from the Architecture-Aligned map (see
// docs/seed-redesign/gen_taxonomy.py), but it is committed as a const map, so a
// bad edit — a module pointing at a JTBD that doesn't exist, a duplicate id, a
// team owning a JTBD twice — would silently route work to "Unclaimed" with no
// other signal. These tests turn that class of mistake into a CI failure.
describe("taxonomy integrity", () => {
  const domainIds = new Set(DOMAINS.map((d) => d.id));
  const jtbdIds = new Set(JTBDS.map((j) => j.id));

  it("has unique domain, JTBD, module, and team ids", () => {
    expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
    expect(new Set(JTBDS.map((j) => j.id)).size).toBe(JTBDS.length);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(TEAMS.length);
    expect(new Set(TEAMS.map((t) => t.label)).size).toBe(TEAMS.length);
  });

  it("keeps team labels free of ':' — outlookId joins mission and month on it", () => {
    // DeliveryOutlook.id is `${mission}:${month}` (see outlookId in logic.ts).
    // month is always "YYYY-MM", so a colon can only ever come from a team
    // label; two teams that differ only in where the colon falls (e.g. "R&D"
    // renamed to "R&D: Core") would collide on the same outlook id and
    // silently overwrite each other's delivery outlook.
    for (const team of TEAMS)
      expect(team.label, `team "${team.id}"`).not.toContain(":");
  });

  it("points every JTBD at a real domain", () => {
    for (const jtbd of JTBDS)
      expect(domainIds, `jtbd "${jtbd.id}"`).toContain(jtbd.domainId);
  });

  it("points every module at a real JTBD", () => {
    for (const mod of MODULES)
      expect(jtbdIds, `module "${mod.id}"`).toContain(mod.jtbdId);
  });

  it("points every team at a real domain and real JTBDs", () => {
    for (const team of TEAMS) {
      expect(domainIds, `team "${team.id}"`).toContain(team.domainId);
      for (const j of team.jtbdIds)
        expect(jtbdIds, `team "${team.id}" jtbd`).toContain(j);
    }
  });

  // The whole point of separating team from JTBD is that a team spans several
  // JTBDs — but a JTBD must have at most one owner, or TEAM_BY_JTBD silently
  // picks whichever team was declared last.
  it("never lets two teams own the same JTBD", () => {
    const seen = new Map<string, string>();
    for (const team of TEAMS) {
      for (const j of team.jtbdIds) {
        expect(seen.get(j), `jtbd "${j}" already owned`).toBeUndefined();
        seen.set(j, team.id);
      }
    }
  });

  it("keeps the team roster and its domain mapping in lockstep", () => {
    expect(MISSIONS).toEqual(TEAMS.map((t) => t.label));
    for (const [team, domainId] of Object.entries(TEAM_DOMAIN))
      expect(domainIds, `TEAM_DOMAIN["${team}"]`).toContain(domainId);
    for (const team of MISSIONS)
      expect(TEAM_DOMAIN, `team "${team}"`).toHaveProperty(team);
  });

  it("resolves a module's owning team, or empty when unowned", () => {
    for (const mod of MODULES) {
      const team = moduleTeam(mod.id);
      if (team) expect(MISSIONS, `module "${mod.id}"`).toContain(team);
      else
        expect(
          TEAM_BY_JTBD[mod.jtbdId],
          `module "${mod.id}" jtbd "${mod.jtbdId}"`,
        ).toBeUndefined();
    }
    expect(moduleTeam(null)).toBe("");
    expect(moduleTeam("does-not-exist")).toBe("");
  });

  // A team's domain should be the domain of the JTBDs it owns. A mismatch means
  // either the team is mis-filed or it has quietly grown across a domain edge.
  it("keeps each team's JTBDs inside its own domain", () => {
    const domainOfJtbd = new Map(JTBDS.map((j) => [j.id, j.domainId]));
    for (const team of TEAMS)
      for (const j of team.jtbdIds)
        expect(domainOfJtbd.get(j), `team "${team.id}" jtbd "${j}"`).toBe(
          team.domainId,
        );
  });
});
