import type { Issue, IssueType, InstrumentType, Phase, LayerId } from "@aether-spire/shared";
import { SPAWN_ZONES } from "@aether-spire/shared";

export interface IssueDefinition {
  baseFixTime: number;       // seconds
  fixTimeWithTool: number;   // seconds
  requiredTool: InstrumentType;
  stabilityReward: number;   // % restored on fix
}

export const ISSUE_DEFINITIONS: Record<IssueType, IssueDefinition> = {
  pressure_surge:     { baseFixTime: 15, fixTimeWithTool: 8, requiredTool: "thermal_regulator", stabilityReward: 5 }, // Increased base time, 47% reduction with tool
  coolant_leak:       { baseFixTime: 14, fixTimeWithTool: 8, requiredTool: "gear_wrench",       stabilityReward: 4 }, // Increased base time, 43% reduction with tool
  mechanical_drift:   { baseFixTime: 16, fixTimeWithTool: 9, requiredTool: "gear_wrench",       stabilityReward: 5 }, // Increased base time, 44% reduction with tool
  capacitor_overload: { baseFixTime: 18, fixTimeWithTool: 10, requiredTool: "arcane_conduit",    stabilityReward: 7 }, // Increased base time, 44% reduction with tool
  friction_fire:      { baseFixTime: 14, fixTimeWithTool: 8, requiredTool: "thermal_regulator", stabilityReward: 4 }, // Increased base time, 43% reduction with tool
  control_corruption: { baseFixTime: 20, fixTimeWithTool: 11, requiredTool: "arcane_conduit",    stabilityReward: 8 }, // Increased base time, 45% reduction with tool
};

const ISSUE_TYPES: IssueType[] = [
  "pressure_surge",
  "coolant_leak",
  "mechanical_drift",
  "capacitor_overload",
  "friction_fire",
  "control_corruption",
];

export function spawnIssue(
  rng: () => number,
  now: number,
  phase: Phase = "early",
  playerCount: number = 1,
  layer: LayerId = "deck",
): Issue {
  const type = ISSUE_TYPES[Math.floor(rng() * ISSUE_TYPES.length)];
  const def = ISSUE_DEFINITIONS[type];
  const layerZones = SPAWN_ZONES.filter(z => z.layer === layer);
  const zone = layerZones[Math.floor(rng() * layerZones.length)];

  return {
    id: `issue_${now}_${Math.floor(rng() * 10000)}`,
    type,
    x: zone.x + (rng() - 0.5) * 60,
    y: zone.y + (rng() - 0.5) * 60,
    layer,
    spawnTime: now,
    baseFixTime: def.baseFixTime,
    fixTimeWithTool: def.fixTimeWithTool,
    requiredTool: def.requiredTool,
    stabilityReward: def.stabilityReward,
    status: "active",
    requiredPlayers: 1,
    fixingBy: [],
  };
}

/**
 * Accelerating damage based on issue age.
 * Age 0-10s:  0.4%/sec - reduced initial damage
 * Age 10-15s: 0.8% per 5s window → 0.16/sec
 * Age 15-20s: 1.6% per 5s window → 0.32/sec
 * Age 20-25s: 2.4% per 5s window → 0.48/sec
 * Age 25-30s: 3.2% per 5s window → 0.64/sec
 * Age 30s+:   4.0% per 5s window → 0.8/sec - reduced from 1.0
 */
export function calculateDamagePerSecond(issue: Issue, now: number): number {
  if (issue.status !== "active") return 0;

  const ageSec = (now - issue.spawnTime) / 1000;

  if (ageSec <= 10) return 0.4;  // Reduced initial damage
  if (ageSec <= 15) return 0.16; // Reduced from 0.2
  if (ageSec <= 20) return 0.32; // Reduced from 0.4
  if (ageSec <= 25) return 0.48; // Reduced from 0.6
  if (ageSec <= 30) return 0.64; // Reduced from 0.8
  return 0.8;                     // Reduced from 1.0
}

/**
 * Sum damage from all active issues and subtract from stability.
 * Returns total damage dealt this tick.
 */
export function applyIssueDamage(
  issues: Issue[],
  stability: number,
  now: number
): { newStability: number; totalDamage: number } {
  let totalDamage = 0;

  for (const issue of issues) {
    totalDamage += calculateDamagePerSecond(issue, now);
  }

  const newStability = Math.max(0, stability - totalDamage);
  return { newStability, totalDamage };
}

/**
 * Get spawn interval in seconds based on player count.
 * 1 player: 40s, 2: 25s, 3: 17s, 4+: 12s
 * Increased spawn rate for more challenging experience
 */
export function getSpawnIntervalSec(playerCount: number): number {
  if (playerCount <= 1) return 40;
  if (playerCount === 2) return 25;
  if (playerCount === 3) return 17;
  return 12;
}
