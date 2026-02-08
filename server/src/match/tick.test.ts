import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMatch, tickMatch } from "./state";

describe("tickMatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when gameOver is true", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("no-op-gameover");
    runtime.state.gameOver = true;
    runtime.state.won = true;

    const stabilityBefore = runtime.state.stability;
    const timeBefore = runtime.state.timeRemainingSec;

    tickMatch(runtime);

    expect(runtime.state.stability).toBe(stabilityBefore);
    expect(runtime.state.timeRemainingSec).toBe(timeBefore);
  });

  it("does nothing when timeRemainingSec is 0 (already ended)", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("no-op-time-zero");
    // Set both to simulate a completed game
    runtime.state.timeRemainingSec = 0;
    runtime.state.gameOver = true;
    runtime.state.won = true;

    const stabilityBefore = runtime.state.stability;

    tickMatch(runtime);

    // gameOver=true causes early return, so nothing changes
    expect(runtime.state.stability).toBe(stabilityBefore);
    expect(runtime.state.timeRemainingSec).toBe(0);
  });

  it("decrements timeRemainingSec by 1 per tick", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("decrement-time");
    // Ensure no issue spawning by setting lastIssueSpawnAt to now
    runtime.lastIssueSpawnAt = baseTime;

    const initialTime = runtime.state.timeRemainingSec;
    expect(initialTime).toBe(420);

    tickMatch(runtime);

    expect(runtime.state.timeRemainingSec).toBe(419);
  });

  it("sets gameOver=true and won=false when stability reaches 0", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("lose-by-stability");
    // Set stability very low
    runtime.state.stability = 0.1;
    // Prevent new issue spawning this tick
    runtime.lastIssueSpawnAt = baseTime;
    // Add an active issue with old spawnTime so damage exceeds remaining stability
    // An issue older than 30s deals 0.8 damage/sec, which exceeds 0.1
    runtime.state.issues.push({
      id: "issue_doom",
      type: "pressure_surge",
      x: 1600,
      y: 1200,
      layer: "deck",
      spawnTime: baseTime - 60_000, // 60 seconds old => 0.8 dps
      baseFixTime: 15,
      fixTimeWithTool: 8,
      requiredTool: "thermal_regulator",
      stabilityReward: 5,
      status: "active",
      requiredPlayers: 1,
      fixingBy: [],
    });

    tickMatch(runtime);

    expect(runtime.state.stability).toBe(0);
    expect(runtime.state.gameOver).toBe(true);
    expect(runtime.state.won).toBe(false);
  });

  it("sets gameOver=true and won=true when time expires with stability > 0", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("win-by-survival");
    // Time remaining is 1 so after decrement it becomes 0
    runtime.state.timeRemainingSec = 1;
    runtime.state.stability = 50;
    // Prevent issue spawning
    runtime.lastIssueSpawnAt = baseTime;
    // No active issues so stability stays above 0

    tickMatch(runtime);

    expect(runtime.state.timeRemainingSec).toBe(0);
    expect(runtime.state.gameOver).toBe(true);
    expect(runtime.state.won).toBe(true);
    expect(runtime.state.stability).toBe(50);
  });

  it("updates phase as time decreases", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("phase-update");
    runtime.lastIssueSpawnAt = baseTime;

    // Initially early (420s remaining)
    expect(runtime.state.phase).toBe("early");

    // Set to just above mid boundary (301 before tick, tick decrements to 300)
    // phaseForTime is called before decrement, with current timeRemainingSec
    // Actually looking at the code: phase is set BEFORE decrement (step 5 before step 7)
    // So if timeRemainingSec=301, phaseForTime(301)="early", then time becomes 300
    // If timeRemainingSec=300, phaseForTime(300)="mid", then time becomes 299
    runtime.state.timeRemainingSec = 300;
    tickMatch(runtime);
    // phaseForTime(300) => "mid" (since 300 is NOT > 300)
    expect(runtime.state.phase).toBe("mid");

    // Set to crisis boundary
    vi.setSystemTime(new Date(baseTime + 1000));
    runtime.state.timeRemainingSec = 150;
    tickMatch(runtime);
    // phaseForTime(150) => "crisis" (since 150 is NOT > 150)
    expect(runtime.state.phase).toBe("crisis");

    // Set to final boundary
    vi.setSystemTime(new Date(baseTime + 2000));
    runtime.state.timeRemainingSec = 30;
    tickMatch(runtime);
    // phaseForTime(30) => "final" (since 30 is NOT > 30)
    expect(runtime.state.phase).toBe("final");
  });

  it("spawns an issue when enough time has elapsed since lastIssueSpawnAt", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("spawn-issue");
    // Single player (playerCount <= 1) => spawn interval = 40s = 40000ms
    runtime.playerCount = 1;
    // Set lastIssueSpawnAt to 50000ms in the past so the 40s interval is exceeded
    runtime.lastIssueSpawnAt = baseTime - 50_000;

    expect(runtime.state.issues).toHaveLength(0);

    tickMatch(runtime);

    expect(runtime.state.issues.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT spawn an issue when spawn interval has not elapsed", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("no-spawn");
    runtime.playerCount = 1;
    // Set lastIssueSpawnAt to just 10s ago (well within the 40s interval)
    runtime.lastIssueSpawnAt = baseTime - 10_000;

    expect(runtime.state.issues).toHaveLength(0);

    tickMatch(runtime);

    expect(runtime.state.issues).toHaveLength(0);
  });

  it("timeRemainingSec does not go below 0", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("floor-zero");
    runtime.state.timeRemainingSec = 0;
    // Since timeRemainingSec <= 0 causes early return, this verifies the guard
    tickMatch(runtime);

    expect(runtime.state.timeRemainingSec).toBe(0);
  });

  it("updates lastTickAt after a tick", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("last-tick");
    runtime.lastIssueSpawnAt = baseTime;

    tickMatch(runtime);

    expect(runtime.lastTickAt).toBe(baseTime);
  });

  it("updates nextTickAt to now + 1000 after a tick", () => {
    const baseTime = 1_000_000;
    vi.setSystemTime(new Date(baseTime));

    const runtime = createMatch("next-tick");
    runtime.lastIssueSpawnAt = baseTime;

    tickMatch(runtime);

    expect(runtime.state.nextTickAt).toBe(baseTime + 1000);
  });
});
