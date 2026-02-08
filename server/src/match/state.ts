import type { GameState, Phase, GroundInstrument, InstrumentType, LayerId } from "@aether-spire/shared";
import { SPAWN_ZONES, HATCH_DEFINITIONS } from "@aether-spire/shared";
import { spawnIssue, applyIssueDamage, getSpawnIntervalSec } from "./issues.js";

export interface FixProgress {
  playerId: string;
  issueId: string;
  startedAt: number;
  durationMs: number;
  toolUsed: InstrumentType | null;
}

export interface MatchRuntime {
  state: GameState;
  lastInstrumentSpawnAt: Map<InstrumentType, number>;
  playerCount: number;
  rng: () => number;
  lastTickAt: number;
  lastIssueSpawnAt: number;
  fixProgress: Map<string, FixProgress>;
}

const INSTRUMENT_TYPES: InstrumentType[] = ["arcane_conduit", "gear_wrench", "thermal_regulator"];
const MATCH_DURATION_SEC = 420; // 7 minutes - increased from 6 minutes for better pacing

export function createMatch(matchId: string): MatchRuntime {
  const rng = createRng(1234);
  const now = Date.now();

  const groundInstruments: GroundInstrument[] = INSTRUMENT_TYPES.map((type, i) => {
    const deckZones = SPAWN_ZONES.filter(z => z.layer === "deck");
    const zone = deckZones[Math.floor(rng() * deckZones.length)];
    return {
      id: `inst_init_${i}`,
      type,
      x: zone.x + (rng() - 0.5) * 40,
      y: zone.y + (rng() - 0.5) * 40,
      layer: "deck" as LayerId,
      spawnTime: now,
    };
  });

  const state: GameState = {
    matchId,
    seed: 1234,
    phase: "early",
    timeRemainingSec: MATCH_DURATION_SEC,
    nextTickAt: now + 1000,
    stability: 100,
    issues: [],
    teamInventory: [],
    groundInstruments,
    hatches: HATCH_DEFINITIONS,
    issuesFixed: 0,
    gameOver: false,
    won: false,
  };

  return {
    state,
    lastInstrumentSpawnAt: new Map(
      INSTRUMENT_TYPES.map((t) => [t, now] as [InstrumentType, number])
    ),
    playerCount: 0,
    rng,
    lastTickAt: now,
    lastIssueSpawnAt: now,
    fixProgress: new Map(),
  };
}

export function tickMatch(runtime: MatchRuntime): void {
  const { state } = runtime;
  const now = Date.now();

  if (state.gameOver) return;
  if (state.timeRemainingSec <= 0) return;

  // 1. Spawn issues
  spawnIssues(runtime, now);

  // 2. Apply damage from active issues
  const { newStability } = applyIssueDamage(state.issues, state.stability, now);
  state.stability = newStability;

  // 3. Check fix completions
  checkFixCompletions(runtime, now);

  // 4. Maybe spawn instruments
  maybeSpawnInstrument(runtime, now);

  // 5. Update phase
  state.phase = phaseForTime(state.timeRemainingSec);

  // 6. Check lose
  if (state.stability <= 0) {
    state.stability = 0;
    state.gameOver = true;
    state.won = false;
  }

  // 7. Decrement time
  state.timeRemainingSec = Math.max(0, state.timeRemainingSec - 1);

  // 8. Check win
  if (state.timeRemainingSec <= 0 && state.stability > 0) {
    state.gameOver = true;
    state.won = true;
  }

  // 9. Update fix progress for all active fixes
  updateFixProgress(runtime, now);

  state.nextTickAt = now + 1000;
  runtime.lastTickAt = now;
}

function spawnIssues(runtime: MatchRuntime, now: number): void {
  const intervalSec = getSpawnIntervalSec(runtime.playerCount);
  const intervalMs = intervalSec * 1000;
  const elapsed = now - runtime.lastIssueSpawnAt;

  if (elapsed >= intervalMs) {
    // 60% deck, 40% cargo
    const layer: LayerId = runtime.rng() < 0.6 ? "deck" : "cargo";
    const issue = spawnIssue(runtime.rng, now, runtime.state.phase, runtime.playerCount, layer);
    runtime.state.issues.push(issue);
    runtime.lastIssueSpawnAt = now;
  }
}

function checkFixCompletions(runtime: MatchRuntime, now: number): void {
  const toRemove: string[] = [];
  const completedIssueIds = new Set<string>();

  // Group fix progress by issue
  const fixersByIssue = new Map<string, FixProgress[]>();
  for (const [playerId, fix] of runtime.fixProgress.entries()) {
    const existing = fixersByIssue.get(fix.issueId) || [];
    existing.push(fix);
    fixersByIssue.set(fix.issueId, existing);
  }

  // Check each issue being worked on
  for (const [issueId, fixers] of fixersByIssue.entries()) {
    const issue = runtime.state.issues.find((i) => i.id === issueId);
    if (!issue || issue.status !== "in_progress") {
      // Issue no longer valid, remove all fixers
      fixers.forEach((f) => toRemove.push(f.playerId));
      continue;
    }

    // Use the issue's authoritative fixStartedAt and fixDurationMs
    const startedAt = issue.fixStartedAt || Math.min(...fixers.map((f) => f.startedAt));
    const durationMs = issue.fixDurationMs || fixers[0].durationMs;

    if (now - startedAt >= durationMs) {
      issue.status = "fixed";
      runtime.state.stability = Math.min(100, runtime.state.stability + issue.stabilityReward);
      runtime.state.issuesFixed++;
      completedIssueIds.add(issueId);
      fixers.forEach((f) => toRemove.push(f.playerId));
    }
  }

  for (const pid of toRemove) {
    runtime.fixProgress.delete(pid);
  }

  runtime.state.issues = runtime.state.issues.filter((i) => i.status !== "fixed");
}

function maybeSpawnInstrument(runtime: MatchRuntime, now: number): void {
  const spawnIntervalMs = 30_000;

  for (const instrType of INSTRUMENT_TYPES) {
    const lastSpawn = runtime.lastInstrumentSpawnAt.get(instrType) ?? 0;
    if (now - lastSpawn < spawnIntervalMs) continue;

    const onGround = runtime.state.groundInstruments.some((gi) => gi.type === instrType);
    if (onGround) continue;

    const inInventory = runtime.state.teamInventory.includes(instrType);
    if (inInventory) continue;

    const layer: LayerId = runtime.rng() < 0.7 ? "deck" : "cargo";
    const layerZones = SPAWN_ZONES.filter(z => z.layer === layer);
    const zone = layerZones[Math.floor(runtime.rng() * layerZones.length)];
    runtime.state.groundInstruments.push({
      id: `inst_${now}_${Math.floor(runtime.rng() * 1000)}`,
      type: instrType,
      x: zone.x + (runtime.rng() - 0.5) * 40,
      y: zone.y + (runtime.rng() - 0.5) * 40,
      layer,
      spawnTime: now,
    });
    runtime.lastInstrumentSpawnAt.set(instrType, now);
  }
}

function updateFixProgress(runtime: MatchRuntime, now: number): void {
  // Update the progress for all ongoing fixes
  for (const [playerId, fix] of runtime.fixProgress.entries()) {
    const issue = runtime.state.issues.find(i => i.id === fix.issueId);
    if (!issue || issue.status !== "in_progress") {
      // If issue is not in progress anymore, remove the fix progress
      runtime.fixProgress.delete(playerId);
      continue;
    }

    // Calculate progress based on time elapsed
    const elapsed = now - (issue.fixStartedAt || fix.startedAt);
    const progress = Math.min(1, elapsed / (issue.fixDurationMs || fix.durationMs));

    // Update the issue's progress if needed
    if (progress >= 1) {
      // Fix completed - this should be handled in checkFixCompletions
      continue;
    }
  }
}

export function phaseForTime(timeRemainingSec: number): Phase {
  // For 7-minute match: early (0-2.5min), mid (2.5-5min), crisis (5-6.5min), final (last 30s)
  if (timeRemainingSec > 5 * 60) return "early";    // Extended early phase
  if (timeRemainingSec > 2.5 * 60) return "mid";    // Mid phase starts later
  if (timeRemainingSec > 30) return "crisis";       // Crisis phase starts later
  return "final";
}

export function calculateScore(runtime: MatchRuntime): {
  score: number;
  stars: number;
  timeSurvived: number;
} {
  const timeSurvived = MATCH_DURATION_SEC - runtime.state.timeRemainingSec;
  const score =
    runtime.state.issuesFixed * 2 +  // Keep 2 points per issue fixed
    timeSurvived +                   // Points for time survived
    Math.round(runtime.state.stability); // Points for final stability
  
  // Adjusted star thresholds for 7-minute game (higher expected scores)
  const stars =
    score >= 500 ? 5 : score >= 400 ? 4 : score >= 300 ? 3 : score >= 150 ? 2 : 1;
  return { score, stars, timeSurvived };
}

export function createRng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
