export interface DrainRateStrategy {
  getDrainRate(spawnTime: number, now: number): number;
}

export class AcceleratingDrainRateStrategy implements DrainRateStrategy {
  getDrainRate(spawnTime: number, now: number): number {
    return damagePerSecondForSpawnTime(spawnTime, now);
  }
}

export const DEFAULT_DRAIN_STRATEGY = new AcceleratingDrainRateStrategy();
import { damagePerSecondForSpawnTime } from "@aether-spire/shared";
