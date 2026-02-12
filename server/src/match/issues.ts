import type { Issue, Phase, LayerId } from "@aether-spire/shared";
import type { DamageStrategy } from "./issuePatterns.js";
import { DEFAULT_DAMAGE_STRATEGY, DefaultIssueFactory } from "./issuePatterns.js";

export { ISSUE_DEFINITIONS, ISSUE_TYPES } from "./issueDefinitions.js";

const DEFAULT_ISSUE_FACTORY = new DefaultIssueFactory();

export function spawnIssue(
  rng: () => number,
  now: number,
  phase: Phase = "early",
  playerCount: number = 1,
  layer: LayerId = "deck",
): Issue {
  return DEFAULT_ISSUE_FACTORY.createIssue(rng, now, phase, playerCount, layer);
}

/**
 * Accelerating damage based on issue age.
 * Age 0-8s:   0.6%/sec
 * Age 8-12s:  1.0% per 4s window → 0.25/sec
 * Age 12-16s: 2.0% per 4s window → 0.5/sec
 * Age 16-20s: 3.0% per 4s window → 0.75/sec
 * Age 20s+:   4.0% per 4s window → 1.0/sec
 */
export function calculateDamagePerSecond(issue: Issue, now: number): number {
  if (issue.status !== "active") return 0;
  return DEFAULT_DAMAGE_STRATEGY.getDamagePerSecond(issue, now);
}

/**
 * Sum damage from all active issues and subtract from stability.
 * Returns total damage dealt this tick.
 */
export function applyIssueDamage(
  issues: Issue[],
  stability: number,
  now: number,
  damageStrategy: DamageStrategy = DEFAULT_DAMAGE_STRATEGY
): { newStability: number; totalDamage: number } {
  let totalDamage = 0;

  for (const issue of issues) {
    if (issue.status !== "active") continue;
    totalDamage += damageStrategy.getDamagePerSecond(issue, now);
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
