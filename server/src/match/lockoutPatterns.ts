import type { Lockout } from "@aether-spire/shared";
import { HATCH_DEFINITIONS } from "@aether-spire/shared";

export interface LockoutStrategy {
  maybeCreateLockout(params: {
    rng: () => number;
    now: number;
    lastLockoutAt: number;
  }): Lockout | null;
}

export class TimedRandomLockoutStrategy implements LockoutStrategy {
  constructor(
    private readonly intervalMs = 90_000,
    private readonly durationMs = 10_000,
    private readonly doorChance = 0.7,
    private readonly doorIds: string[] = [
      "door-bridge",
      "door-port",
      "door-starboard",
      "door-engine",
      "door-fore-storage",
      "door-aft-storage",
    ],
  ) {}

  maybeCreateLockout(params: { rng: () => number; now: number; lastLockoutAt: number }): Lockout | null {
    const { rng, now, lastLockoutAt } = params;
    if (now - lastLockoutAt < this.intervalMs) return null;

    if (rng() < this.doorChance) {
      const doorId = this.doorIds[Math.floor(rng() * this.doorIds.length)];
      return { id: doorId, kind: "door", endsAt: now + this.durationMs };
    }

    const hatchId = HATCH_DEFINITIONS[Math.floor(rng() * HATCH_DEFINITIONS.length)].id;
    return { id: hatchId, kind: "hatch", endsAt: now + this.durationMs };
  }
}

export const DEFAULT_LOCKOUT_STRATEGY = new TimedRandomLockoutStrategy();
