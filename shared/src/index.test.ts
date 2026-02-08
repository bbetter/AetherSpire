import { describe, it, expect } from "vitest";
import {
  SPAWN_ZONES,
  HATCH_DEFINITIONS,
  CORE_POS,
  WORLD_W,
  WORLD_H,
} from "./index";

describe("SPAWN_ZONES", () => {
  it("has at least 26 zones", () => {
    expect(SPAWN_ZONES.length).toBeGreaterThanOrEqual(26);
  });

  it("every zone has layer 'deck' or 'cargo'", () => {
    for (const zone of SPAWN_ZONES) {
      expect(["deck", "cargo"]).toContain(zone.layer);
    }
  });

  it("every zone has numeric x and y", () => {
    for (const zone of SPAWN_ZONES) {
      expect(typeof zone.x).toBe("number");
      expect(typeof zone.y).toBe("number");
      expect(Number.isFinite(zone.x)).toBe(true);
      expect(Number.isFinite(zone.y)).toBe(true);
    }
  });

  it("every zone has a non-empty label", () => {
    for (const zone of SPAWN_ZONES) {
      expect(typeof zone.label).toBe("string");
      expect(zone.label.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate labels", () => {
    const labels = SPAWN_ZONES.map((z) => z.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("contains both deck and cargo zones", () => {
    const layers = new Set(SPAWN_ZONES.map((z) => z.layer));
    expect(layers.has("deck")).toBe(true);
    expect(layers.has("cargo")).toBe(true);
  });

  it("all zones are within world bounds (0-WORLD_W, 0-WORLD_H)", () => {
    for (const zone of SPAWN_ZONES) {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.x).toBeLessThanOrEqual(WORLD_W);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeLessThanOrEqual(WORLD_H);
    }
  });
});

describe("HATCH_DEFINITIONS", () => {
  it("has exactly 2 hatches", () => {
    expect(HATCH_DEFINITIONS).toHaveLength(2);
  });

  it("each hatch connects deck to cargo (layerA='deck', layerB='cargo')", () => {
    for (const hatch of HATCH_DEFINITIONS) {
      expect(hatch.layerA).toBe("deck");
      expect(hatch.layerB).toBe("cargo");
    }
  });

  it("has unique IDs", () => {
    const ids = HATCH_DEFINITIONS.map((h) => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all positions are within world bounds", () => {
    for (const hatch of HATCH_DEFINITIONS) {
      expect(hatch.posA.x).toBeGreaterThanOrEqual(0);
      expect(hatch.posA.x).toBeLessThanOrEqual(WORLD_W);
      expect(hatch.posA.y).toBeGreaterThanOrEqual(0);
      expect(hatch.posA.y).toBeLessThanOrEqual(WORLD_H);
      expect(hatch.posB.x).toBeGreaterThanOrEqual(0);
      expect(hatch.posB.x).toBeLessThanOrEqual(WORLD_W);
      expect(hatch.posB.y).toBeGreaterThanOrEqual(0);
      expect(hatch.posB.y).toBeLessThanOrEqual(WORLD_H);
    }
  });
});

describe("CORE_POS", () => {
  it("is at the center of the world (1600, 1200)", () => {
    expect(CORE_POS.x).toBe(1600);
    expect(CORE_POS.y).toBe(1200);
  });
});

describe("WORLD_W and WORLD_H", () => {
  it("WORLD_W is 3200", () => {
    expect(WORLD_W).toBe(3200);
  });

  it("WORLD_H is 2400", () => {
    expect(WORLD_H).toBe(2400);
  });
});
