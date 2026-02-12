import type { Issue, IssueType, LayerId, Phase } from "@aether-spire/shared";
import { SPAWN_ZONES } from "@aether-spire/shared";
import { ISSUE_DEFINITIONS, ISSUE_TYPES } from "./issueDefinitions.js";

function damagePerSecondForSpawnTime(spawnTime: number, now: number): number {
  const ageSec = (now - spawnTime) / 1000;
  if (ageSec <= 8) return 0.6;
  if (ageSec <= 12) return 0.25;
  if (ageSec <= 16) return 0.5;
  if (ageSec <= 20) return 0.75;
  return 1.0;
}

export interface IssueFactory {
  createIssue(
    rng: () => number,
    now: number,
    phase: Phase,
    playerCount: number,
    layer: LayerId,
  ): Issue;
}

export class DefaultIssueFactory implements IssueFactory {
  createIssue(
    rng: () => number,
    now: number,
    _phase: Phase,
    _playerCount: number,
    layer: LayerId,
  ): Issue {
    const type = ISSUE_TYPES[Math.floor(rng() * ISSUE_TYPES.length)] as IssueType;
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
}

export interface DamageStrategy {
  getDamagePerSecond(issue: Issue, now: number): number;
}

export class AcceleratingDamageStrategy implements DamageStrategy {
  getDamagePerSecond(issue: Issue, now: number): number {
    return damagePerSecondForSpawnTime(issue.spawnTime, now);
  }
}

export const DEFAULT_DAMAGE_STRATEGY = new AcceleratingDamageStrategy();

export interface SpawnStrategy {
  pickLayer(params: {
    rng: () => number;
    activeIssues: Issue[];
    baseDeckWeight?: number;
  }): LayerId;
}

export class DistantSpawnStrategy implements SpawnStrategy {
  constructor(
    private readonly baseDeckWeight = 0.6,
    private readonly biasToOtherLayer = 0.7,
  ) {}

  pickLayer(params: { rng: () => number; activeIssues: Issue[]; baseDeckWeight?: number }): LayerId {
    const { rng, activeIssues } = params;
    const baseDeckWeight = params.baseDeckWeight ?? this.baseDeckWeight;

    if (activeIssues.length < 2) {
      return rng() < baseDeckWeight ? "deck" : "cargo";
    }

    const deckCount = activeIssues.filter((i) => i.layer === "deck").length;
    const cargoCount = activeIssues.filter((i) => i.layer === "cargo").length;
    if (deckCount === cargoCount) {
      return rng() < 0.5 ? "deck" : "cargo";
    }

    const target = deckCount > cargoCount ? "cargo" : "deck";
    return rng() < this.biasToOtherLayer ? target : (target === "deck" ? "cargo" : "deck");
  }
}

export const DEFAULT_SPAWN_STRATEGY = new DistantSpawnStrategy();
