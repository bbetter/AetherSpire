import { describe, it, expect } from "vitest";
import { createRng, phaseForTime, calculateScore, createMatch } from "./state";

// ── createRng ───────────────────────────────────────────────────

describe("createRng", () => {
  it("produces deterministic sequences for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);

    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());

    expect(seqA).toEqual(seqB);
  });

  it("returns values in [0, 1)", () => {
    const rng = createRng(999);

    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);

    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());

    expect(seqA).not.toEqual(seqB);
  });
});

// ── phaseForTime ────────────────────────────────────────────────

describe("phaseForTime", () => {
  it('returns "early" when timeRemainingSec > 300', () => {
    expect(phaseForTime(301)).toBe("early");
    expect(phaseForTime(420)).toBe("early");
  });

  it('returns "mid" when timeRemainingSec is exactly 300', () => {
    expect(phaseForTime(300)).toBe("mid");
  });

  it('returns "mid" when timeRemainingSec is between 151 and 300', () => {
    expect(phaseForTime(151)).toBe("mid");
    expect(phaseForTime(250)).toBe("mid");
  });

  it('returns "crisis" when timeRemainingSec is exactly 150', () => {
    expect(phaseForTime(150)).toBe("crisis");
  });

  it('returns "crisis" when timeRemainingSec is between 31 and 150', () => {
    expect(phaseForTime(31)).toBe("crisis");
    expect(phaseForTime(100)).toBe("crisis");
  });

  it('returns "final" when timeRemainingSec is exactly 30', () => {
    expect(phaseForTime(30)).toBe("final");
  });

  it('returns "final" when timeRemainingSec is 0', () => {
    expect(phaseForTime(0)).toBe("final");
  });
});

// ── calculateScore ──────────────────────────────────────────────

describe("calculateScore", () => {
  function makeRuntime(overrides: {
    issuesFixed?: number;
    timeRemainingSec?: number;
    stability?: number;
  }) {
    const runtime = createMatch("score-test");
    runtime.state.issuesFixed = overrides.issuesFixed ?? 0;
    runtime.state.timeRemainingSec = overrides.timeRemainingSec ?? 0;
    runtime.state.stability = overrides.stability ?? 0;
    return runtime;
  }

  it("calculates score = issuesFixed*2 + timeSurvived + round(stability)", () => {
    // MATCH_DURATION_SEC = 420
    // timeSurvived = 420 - timeRemainingSec
    const runtime = makeRuntime({
      issuesFixed: 10,
      timeRemainingSec: 120,
      stability: 75.4,
    });

    const result = calculateScore(runtime);

    // score = 10*2 + (420-120) + round(75.4) = 20 + 300 + 75 = 395
    expect(result.score).toBe(395);
    expect(result.timeSurvived).toBe(300);
  });

  it("awards 5 stars for score >= 500", () => {
    // Need score >= 500: e.g. 50 issues * 2 = 100, timeSurvived=420, stability=0 => 520
    const runtime = makeRuntime({
      issuesFixed: 50,
      timeRemainingSec: 0,
      stability: 0,
    });
    const { stars } = calculateScore(runtime);
    expect(stars).toBe(5);
  });

  it("awards 4 stars for score >= 400 and < 500", () => {
    // score = 0*2 + 420 + 50 = 470
    const runtime = makeRuntime({
      issuesFixed: 0,
      timeRemainingSec: 0,
      stability: 50,
    });
    const { score, stars } = calculateScore(runtime);
    expect(score).toBeGreaterThanOrEqual(400);
    expect(score).toBeLessThan(500);
    expect(stars).toBe(4);
  });

  it("awards 3 stars for score >= 300 and < 400", () => {
    // score = 5*2 + (420-120) + 0 = 10 + 300 + 0 = 310
    const runtime = makeRuntime({
      issuesFixed: 5,
      timeRemainingSec: 120,
      stability: 0,
    });
    const { score, stars } = calculateScore(runtime);
    expect(score).toBeGreaterThanOrEqual(300);
    expect(score).toBeLessThan(400);
    expect(stars).toBe(3);
  });

  it("awards 2 stars for score >= 150 and < 300", () => {
    // score = 0*2 + (420-220) + 0 = 200
    const runtime = makeRuntime({
      issuesFixed: 0,
      timeRemainingSec: 220,
      stability: 0,
    });
    const { score, stars } = calculateScore(runtime);
    expect(score).toBeGreaterThanOrEqual(150);
    expect(score).toBeLessThan(300);
    expect(stars).toBe(2);
  });

  it("awards 1 star for score < 150", () => {
    // score = 0*2 + (420-350) + 0 = 70
    const runtime = makeRuntime({
      issuesFixed: 0,
      timeRemainingSec: 350,
      stability: 0,
    });
    const { score, stars } = calculateScore(runtime);
    expect(score).toBeLessThan(150);
    expect(stars).toBe(1);
  });

  it("rounds stability in the score", () => {
    const runtime = makeRuntime({
      issuesFixed: 0,
      timeRemainingSec: 420,
      stability: 33.6,
    });
    const { score } = calculateScore(runtime);
    // score = 0 + 0 + round(33.6) = 34
    expect(score).toBe(34);
  });
});

// ── createMatch ─────────────────────────────────────────────────

describe("createMatch", () => {
  it("sets the correct matchId", () => {
    const runtime = createMatch("test-match-1");
    expect(runtime.state.matchId).toBe("test-match-1");
  });

  it("initializes stability to 100", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.stability).toBe(100);
  });

  it("initializes timeRemainingSec to 420 (MATCH_DURATION_SEC)", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.timeRemainingSec).toBe(420);
  });

  it("starts with no issues", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.issues).toEqual([]);
  });

  it('starts in the "early" phase', () => {
    const runtime = createMatch("m1");
    expect(runtime.state.phase).toBe("early");
  });

  it("creates 3 ground instruments (one per type)", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.groundInstruments).toHaveLength(3);

    const types = runtime.state.groundInstruments.map((gi) => gi.type).sort();
    expect(types).toEqual(["arcane_conduit", "gear_wrench", "thermal_regulator"]);
  });

  it("starts with gameOver=false and won=false", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.gameOver).toBe(false);
    expect(runtime.state.won).toBe(false);
  });

  it("starts with issuesFixed=0", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.issuesFixed).toBe(0);
  });

  it("starts with empty teamInventory", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.teamInventory).toEqual([]);
  });

  it("initializes playerCount to 0", () => {
    const runtime = createMatch("m1");
    expect(runtime.playerCount).toBe(0);
  });

  it("initializes fixProgress as empty map", () => {
    const runtime = createMatch("m1");
    expect(runtime.fixProgress.size).toBe(0);
  });

  it("sets seed to 1234", () => {
    const runtime = createMatch("m1");
    expect(runtime.state.seed).toBe(1234);
  });
});
