import { describe, it, expect } from "vitest";
import type { Issue, IssueType, InstrumentType, LayerId } from "@aether-spire/shared";
import {
  ISSUE_DEFINITIONS,
  calculateDamagePerSecond,
  applyIssueDamage,
  getSpawnIntervalSec,
  spawnIssue,
} from "./issues.js";

// ── Helper ──────────────────────────────────────────────────────

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue_test_1",
    type: "pressure_surge",
    x: 1600,
    y: 1200,
    layer: "deck",
    spawnTime: 0,
    baseFixTime: 15,
    fixTimeWithTool: 8,
    requiredTool: "thermal_regulator",
    stabilityReward: 5,
    status: "active",
    requiredPlayers: 1,
    fixingBy: [],
    ...overrides,
  };
}

// ── ISSUE_DEFINITIONS ───────────────────────────────────────────

describe("ISSUE_DEFINITIONS", () => {
  const ALL_TYPES: IssueType[] = [
    "pressure_surge",
    "coolant_leak",
    "mechanical_drift",
    "capacitor_overload",
    "friction_fire",
    "control_corruption",
  ];

  const VALID_TOOLS: InstrumentType[] = [
    "arcane_conduit",
    "gear_wrench",
    "thermal_regulator",
  ];

  it("contains all 6 issue types", () => {
    const keys = Object.keys(ISSUE_DEFINITIONS) as IssueType[];
    expect(keys).toHaveLength(6);
    for (const t of ALL_TYPES) {
      expect(ISSUE_DEFINITIONS).toHaveProperty(t);
    }
  });

  it("has fixTimeWithTool < baseFixTime for every type", () => {
    for (const t of ALL_TYPES) {
      const def = ISSUE_DEFINITIONS[t];
      expect(def.fixTimeWithTool).toBeLessThan(def.baseFixTime);
    }
  });

  it("has a valid requiredTool for every type", () => {
    for (const t of ALL_TYPES) {
      const def = ISSUE_DEFINITIONS[t];
      expect(VALID_TOOLS).toContain(def.requiredTool);
    }
  });

  it("has positive stabilityReward for every type", () => {
    for (const t of ALL_TYPES) {
      expect(ISSUE_DEFINITIONS[t].stabilityReward).toBeGreaterThan(0);
    }
  });
});

// ── calculateDamagePerSecond ────────────────────────────────────

describe("calculateDamagePerSecond", () => {
  it("returns 0 for non-active issues (in_progress)", () => {
    const issue = makeIssue({ status: "in_progress", spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 5000)).toBe(0);
  });

  it("returns 0 for non-active issues (fixed)", () => {
    const issue = makeIssue({ status: "fixed", spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 30000)).toBe(0);
  });

  it("returns 0.4 for age 0-10s (freshly spawned)", () => {
    const issue = makeIssue({ spawnTime: 1000 });
    expect(calculateDamagePerSecond(issue, 1000)).toBe(0.4); // age = 0s
  });

  it("returns 0.4 for age exactly at 5s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 5000)).toBe(0.4);
  });

  it("returns 0.4 at exactly 10s boundary", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 10000)).toBe(0.4);
  });

  it("returns 0.16 just past 10s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 10001)).toBe(0.16);
  });

  it("returns 0.16 for age 10-15s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 12000)).toBe(0.16);
    expect(calculateDamagePerSecond(issue, 15000)).toBe(0.16);
  });

  it("returns 0.32 for age 15-20s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 15001)).toBe(0.32);
    expect(calculateDamagePerSecond(issue, 20000)).toBe(0.32);
  });

  it("returns 0.48 for age 20-25s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 20001)).toBe(0.48);
    expect(calculateDamagePerSecond(issue, 25000)).toBe(0.48);
  });

  it("returns 0.64 for age 25-30s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 25001)).toBe(0.64);
    expect(calculateDamagePerSecond(issue, 30000)).toBe(0.64);
  });

  it("returns 0.8 for age beyond 30s", () => {
    const issue = makeIssue({ spawnTime: 0 });
    expect(calculateDamagePerSecond(issue, 30001)).toBe(0.8);
    expect(calculateDamagePerSecond(issue, 60000)).toBe(0.8);
  });
});

// ── applyIssueDamage ────────────────────────────────────────────

describe("applyIssueDamage", () => {
  it("returns unchanged stability when there are no issues", () => {
    const result = applyIssueDamage([], 75, 5000);
    expect(result.newStability).toBe(75);
    expect(result.totalDamage).toBe(0);
  });

  it("subtracts damage from a single active issue", () => {
    const issue = makeIssue({ spawnTime: 0 }); // age 5s at now=5000 => 0.4 dps
    const result = applyIssueDamage([issue], 100, 5000);
    expect(result.totalDamage).toBe(0.4);
    expect(result.newStability).toBe(99.6);
  });

  it("sums damage from multiple active issues", () => {
    const issue1 = makeIssue({ id: "a", spawnTime: 0 });        // age 5s => 0.4
    const issue2 = makeIssue({ id: "b", spawnTime: 0 });        // age 5s => 0.4
    const issue3 = makeIssue({ id: "c", spawnTime: -20000 });   // age 25s => 0.48
    const result = applyIssueDamage([issue1, issue2, issue3], 50, 5000);
    expect(result.totalDamage).toBeCloseTo(0.4 + 0.4 + 0.48);
    expect(result.newStability).toBeCloseTo(50 - (0.4 + 0.4 + 0.48));
  });

  it("does not count non-active issues", () => {
    const active = makeIssue({ id: "a", spawnTime: 0, status: "active" });
    const fixed = makeIssue({ id: "b", spawnTime: 0, status: "fixed" });
    const inProgress = makeIssue({ id: "c", spawnTime: 0, status: "in_progress" });
    const result = applyIssueDamage([active, fixed, inProgress], 80, 5000);
    expect(result.totalDamage).toBe(0.4);
    expect(result.newStability).toBe(79.6);
  });

  it("clamps stability to 0 (never goes negative)", () => {
    const issues = Array.from({ length: 20 }, (_, i) =>
      makeIssue({ id: `issue_${i}`, spawnTime: -50000 }), // age 55s => 0.8 each
    );
    // 20 * 0.8 = 16 damage; starting at 5 => would be -11
    const result = applyIssueDamage(issues, 5, 5000);
    expect(result.newStability).toBe(0);
    expect(result.totalDamage).toBeCloseTo(16);
  });
});

// ── getSpawnIntervalSec ─────────────────────────────────────────

describe("getSpawnIntervalSec", () => {
  it("returns 40 for 1 player", () => {
    expect(getSpawnIntervalSec(1)).toBe(40);
  });

  it("returns 40 for 0 players (edge case)", () => {
    expect(getSpawnIntervalSec(0)).toBe(40);
  });

  it("returns 40 for negative player count (edge case)", () => {
    expect(getSpawnIntervalSec(-1)).toBe(40);
  });

  it("returns 25 for 2 players", () => {
    expect(getSpawnIntervalSec(2)).toBe(25);
  });

  it("returns 17 for 3 players", () => {
    expect(getSpawnIntervalSec(3)).toBe(17);
  });

  it("returns 12 for 4 players", () => {
    expect(getSpawnIntervalSec(4)).toBe(12);
  });

  it("returns 12 for more than 4 players", () => {
    expect(getSpawnIntervalSec(5)).toBe(12);
    expect(getSpawnIntervalSec(100)).toBe(12);
  });
});

// ── spawnIssue ──────────────────────────────────────────────────

describe("spawnIssue", () => {
  // Simple seeded RNG: linear congruential generator for deterministic output
  function makeSeededRng(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  const ALL_ISSUE_TYPES: IssueType[] = [
    "pressure_surge",
    "coolant_leak",
    "mechanical_drift",
    "capacitor_overload",
    "friction_fire",
    "control_corruption",
  ];

  it("returns an issue with status 'active'", () => {
    const rng = makeSeededRng(42);
    const issue = spawnIssue(rng, 10000, "early", 1, "deck");
    expect(issue.status).toBe("active");
  });

  it("returns an issue with a valid type", () => {
    const rng = makeSeededRng(99);
    const issue = spawnIssue(rng, 5000, "mid", 2, "deck");
    expect(ALL_ISSUE_TYPES).toContain(issue.type);
  });

  it("populates definition values from ISSUE_DEFINITIONS", () => {
    const rng = makeSeededRng(7);
    const issue = spawnIssue(rng, 1000, "early", 1, "deck");
    const def = ISSUE_DEFINITIONS[issue.type];
    expect(issue.baseFixTime).toBe(def.baseFixTime);
    expect(issue.fixTimeWithTool).toBe(def.fixTimeWithTool);
    expect(issue.requiredTool).toBe(def.requiredTool);
    expect(issue.stabilityReward).toBe(def.stabilityReward);
  });

  it("sets correct metadata fields", () => {
    const rng = makeSeededRng(123);
    const now = 20000;
    const issue = spawnIssue(rng, now, "early", 1, "deck");
    expect(issue.spawnTime).toBe(now);
    expect(issue.requiredPlayers).toBe(1);
    expect(issue.fixingBy).toEqual([]);
    expect(issue.id).toContain("issue_");
  });

  it("spawns on the correct layer (deck)", () => {
    const rng = makeSeededRng(55);
    const issue = spawnIssue(rng, 1000, "early", 1, "deck");
    expect(issue.layer).toBe("deck");
  });

  it("spawns on the correct layer (cargo)", () => {
    const rng = makeSeededRng(55);
    const issue = spawnIssue(rng, 1000, "early", 1, "cargo");
    expect(issue.layer).toBe("cargo");
  });

  it("produces deterministic results with the same seed", () => {
    const rng1 = makeSeededRng(42);
    const rng2 = makeSeededRng(42);
    const issue1 = spawnIssue(rng1, 10000, "early", 2, "deck");
    const issue2 = spawnIssue(rng2, 10000, "early", 2, "deck");
    expect(issue1).toEqual(issue2);
  });

  it("produces different results with different seeds", () => {
    const rng1 = makeSeededRng(1);
    const rng2 = makeSeededRng(2);
    const issue1 = spawnIssue(rng1, 10000, "early", 1, "deck");
    const issue2 = spawnIssue(rng2, 10000, "early", 1, "deck");
    // At least one field should differ (type, x, y, or id)
    const sameEverything =
      issue1.type === issue2.type &&
      issue1.x === issue2.x &&
      issue1.y === issue2.y &&
      issue1.id === issue2.id;
    expect(sameEverything).toBe(false);
  });
});
