import { describe, expect, it } from "vitest";
import { MISSIONS } from "@/lib/loop/constants";
import { TEAM_IDS, teamLabel } from "@/lib/loop/taxonomy";
import { buildRicePrompt, riceBody, riceOut } from "./rice";
import { critiqueOut } from "./critique";
import { buildExplainPrompt, explainBody } from "./explain-rank";
import { krOut } from "./kr";
import { captureOut } from "./capture";
import { buildSummaryPrompt, summaryBody } from "./summary";
import { buildThemeSummaryPrompt, themeSummaryBody } from "./theme-summary";
import { buildThemeTitlePrompt, themeTitleBody } from "./theme-title";

describe("rice", () => {
  it("requires a title", () => {
    expect(riceBody.safeParse({}).success).toBe(false);
    expect(riceBody.safeParse({ title: "X" }).success).toBe(true);
  });
  it("rejects out-of-range axis scores", () => {
    const base = {
      reach: 3,
      confidence: 3,
      strategicFit: 3,
      rationale: { reach: "a", confidence: "b", strategicFit: "c" },
    };
    expect(riceOut.safeParse(base).success).toBe(true);
    expect(riceOut.safeParse({ ...base, reach: 6 }).success).toBe(false);
    expect(riceOut.safeParse({ ...base, reach: 2.5 }).success).toBe(false);
  });
  it("prompt includes the framing", () => {
    const p = buildRicePrompt({
      title: "Faster onboarding",
      problemStatement: "Onboarding is slow",
      mission: "Alpha",
      description: "",
    });
    expect(p).toContain("Faster onboarding");
    expect(p).toContain("Onboarding is slow");
    expect(p).toContain("Alpha");
  });
});

describe("critique", () => {
  it("enforces 2–3 questions", () => {
    const ok = { score: 4, questions: ["a", "b"], rewrite: "r" };
    expect(critiqueOut.safeParse(ok).success).toBe(true);
    expect(critiqueOut.safeParse({ ...ok, questions: ["a"] }).success).toBe(false);
    expect(
      critiqueOut.safeParse({ ...ok, questions: ["a", "b", "c", "d"] }).success,
    ).toBe(false);
  });
});

describe("explain-rank", () => {
  it("defaults neighbors to empty and prompt shows contributions", () => {
    const parsed = explainBody.parse({
      title: "Item A",
      scores: { reach: 3, confidence: 4, strategicFit: 5 },
      weights: { reach: 2, confidence: 1, strategicFit: 3 },
      rank: 30,
    });
    expect(parsed.neighbors).toEqual([]);
    const p = buildExplainPrompt({
      ...parsed,
      neighbors: [{ title: "Item B", rank: 20, dir: "below" }],
    });
    expect(p).toContain("reach: 3 × weight 2 = 6");
    expect(p).toContain('below: "Item B"');
  });
});

describe("kr", () => {
  it("allows null numeric fields", () => {
    const ok = {
      statement: "s",
      metric: "m",
      unit: "days",
      baseline: null,
      target: 3,
      current: null,
    };
    expect(krOut.safeParse(ok).success).toBe(true);
    expect(krOut.safeParse({ ...ok, target: "3" }).success).toBe(false);
  });
});

describe("capture", () => {
  it("only accepts a real mission", () => {
    const base = {
      title: "t",
      description: "d",
      problemStatement: "p",
      kr: null,
    };
    // `mission` is a team id, not a display label — see capture.ts.
    expect(captureOut.safeParse({ ...base, mission: TEAM_IDS[0] }).success).toBe(true);
    expect(captureOut.safeParse({ ...base, mission: "NotATeam" }).success).toBe(false);
  });

  // Why ids and not labels: every team label with a qualifier contains an em dash,
  // and a model reproducing one by hand will sometimes emit a hyphen or en dash.
  // If the enum were built from labels, each of these would fail validation and
  // error the capture; as ids there is nothing to get subtly wrong.
  it("is not exposed to em-dash near-misses in team labels", () => {
    const base = {
      title: "t",
      description: "d",
      problemStatement: "p",
      kr: null,
    };
    const label = MISSIONS.find((m) => m.includes("—"))!;
    expect(label).toBeTruthy();
    for (const nearMiss of [label, label.replace("—", "-"), label.replace("—", "–")])
      expect(
        captureOut.safeParse({ ...base, mission: nearMiss }).success,
        `label form "${nearMiss}" must not be accepted`,
      ).toBe(false);

    // Every id round-trips to a real team label.
    for (const id of TEAM_IDS) {
      expect(captureOut.safeParse({ ...base, mission: id }).success).toBe(true);
      expect(MISSIONS).toContain(teamLabel(id));
    }
  });
});

describe("summary", () => {
  it("needs at least one item and renders the snapshot", () => {
    expect(summaryBody.safeParse({ items: [] }).success).toBe(false);
    const p = buildSummaryPrompt({
      audience: "exec",
      scope: "roadmap",
      length: "medium",
      format: "prose",
      items: [
        {
          title: "Ship X",
          mission: "Alpha",
          stage: "Building",
          horizon: "now",
          problem: "",
          description: "",
          kr: "time: 9 → 3 days",
          window: "Aug–Oct",
        },
      ],
    });
    expect(p).toContain("[Building/now] Ship X (Alpha)");
    expect(p).toContain("KR: time: 9 → 3 days");
  });

  it("threads the problem statement and description into the snapshot", () => {
    const p = buildSummaryPrompt({
      audience: "exec",
      scope: "quarter",
      scopeLabel: "Q1 FY26",
      length: "medium",
      format: "prose",
      items: [
        {
          title: "Ship X",
          mission: "Alpha",
          stage: "Building",
          horizon: "now",
          problem: "For Staff: staff answer 'where is X?' instantly",
          description: "Location tracking + history",
          kr: "time: 9 → 3 days",
          window: "Aug–Oct",
        },
      ],
    });
    expect(p).toContain("problem: For Staff: staff answer 'where is X?' instantly");
    expect(p).toContain("Location tracking + history");
    expect(p).toContain("overarching theme");
  });

  it("defaults scope, length, and format", () => {
    const parsed = summaryBody.parse({
      items: [{ title: "Ship X", mission: "Alpha", stage: "Building", horizon: "now" }],
    });
    expect(parsed.scope).toBe("roadmap");
    expect(parsed.length).toBe("medium");
    expect(parsed.format).toBe("prose");

    const roadmap = buildSummaryPrompt(parsed);
    expect(roadmap).toContain("Scope: roadmap");
    expect(roadmap).not.toContain("do not group by horizon");

    const quarter = buildSummaryPrompt({
      ...parsed,
      scope: "quarter",
      scopeLabel: "Q1 FY26 — All teams",
    });
    expect(quarter).toContain("Scope: quarter — Q1 FY26 — All teams");
    expect(quarter).toContain("do not group by");
  });

  it("threads length through the prompt", () => {
    const parsed = summaryBody.parse({
      items: [{ title: "Ship X", mission: "Alpha", stage: "Building", horizon: "now" }],
    });

    const short = buildSummaryPrompt({ ...parsed, length: "short" });
    expect(short).toContain("Length: short");
    expect(short).toContain("Be brief");
    expect(short).not.toContain("Go deeper than the default");

    const long = buildSummaryPrompt({ ...parsed, length: "long" });
    expect(long).toContain("Length: long");
    expect(long).toContain("Go deeper than the default");
    expect(long).not.toContain("Be brief");
  });

  it("threads format through the prompt", () => {
    const parsed = summaryBody.parse({
      items: [{ title: "Ship X", mission: "Alpha", stage: "Building", horizon: "now" }],
    });

    const bullets = buildSummaryPrompt({ ...parsed, format: "bullets" });
    expect(bullets).toContain("Format: bullets");
    expect(bullets).toContain("Write as a bullet list");
    expect(bullets).not.toContain("Write in plain prose paragraphs");

    const prose = buildSummaryPrompt({ ...parsed, format: "prose" });
    expect(prose).toContain("Format: prose");
    expect(prose).toContain("Write in plain prose paragraphs");
    expect(prose).not.toContain("Write as a bullet list");
  });
});

describe("theme-summary", () => {
  it("needs at least one bet and renders the snapshot", () => {
    expect(themeSummaryBody.safeParse({ theme: "Grow", bets: [] }).success).toBe(false);
    const p = buildThemeSummaryPrompt({
      theme: "Grow",
      audience: "exec",
      length: "medium",
      format: "prose",
      bets: [
        {
          title: "Expand into K-12",
          thesis: "New markets fund the next phase",
          tier: "Foundational",
          goalArea: "GTM",
          status: "Active",
          horizon: "Now",
          value: "$1.2M in new revenue (modeled)",
        },
      ],
    });
    expect(p).toContain("Theme: Grow");
    expect(p).toContain("[Active/Foundational] Expand into K-12 (GTM)");
    expect(p).toContain("worth $1.2M in new revenue (modeled)");
  });

  it("defaults length and format, and threads them through the prompt", () => {
    const parsed = themeSummaryBody.parse({
      theme: "Grow",
      bets: [
        {
          title: "Expand into K-12",
          tier: "Foundational",
          goalArea: "GTM",
          status: "Active",
          horizon: "Now",
        },
      ],
    });
    expect(parsed.length).toBe("medium");
    expect(parsed.format).toBe("prose");

    const short = buildThemeSummaryPrompt({ ...parsed, length: "short" });
    expect(short).toContain("Length: short");
    expect(short).toContain("Be brief");
    expect(short).not.toContain("Go deeper than the default");

    const bullets = buildThemeSummaryPrompt({ ...parsed, format: "bullets" });
    expect(bullets).toContain("Format: bullets");
    expect(bullets).toContain("Write as a bullet list");
    expect(bullets).not.toContain("Write in plain prose paragraphs");
  });
});

describe("theme-title", () => {
  it("requires a non-empty narrative", () => {
    expect(themeTitleBody.safeParse({}).success).toBe(false);
    expect(themeTitleBody.safeParse({ narrative: "" }).success).toBe(false);
    expect(themeTitleBody.safeParse({ narrative: "Speed up onboarding" }).success).toBe(
      true,
    );
  });
  it("prompt includes the narrative", () => {
    const p = buildThemeTitlePrompt({ narrative: "Speed up onboarding for new camps" });
    expect(p).toContain("Speed up onboarding for new camps");
  });
});
