import { describe, it, expect } from "vitest";
import {
  colorFromId,
  getAreaName,
  circleIntersectsRect,
  findNearestDoor,
} from "./utils";

const PALETTE = [0x6aa5ff, 0xffb24d, 0xff6b6b, 0x7ee3c2, 0xb197fc, 0x63e6be];

describe("colorFromId", () => {
  it("is deterministic (same input always returns same output)", () => {
    const a = colorFromId("player-abc");
    const b = colorFromId("player-abc");
    expect(a).toBe(b);
  });

  it("returns a value from the palette", () => {
    const ids = ["alice", "bob", "charlie", "player-1", "xyz-999"];
    for (const id of ids) {
      expect(PALETTE).toContain(colorFromId(id));
    }
  });

  it("handles an empty string", () => {
    const result = colorFromId("");
    expect(PALETTE).toContain(result);
  });
});

describe("getAreaName", () => {
  it("returns 'Main Deck' near 1600, 1200 on deck layer", () => {
    expect(getAreaName(1600, 1200)).toBe("Main Deck");
  });

  it("returns 'Bridge' near 1600, 400 on deck layer", () => {
    expect(getAreaName(1600, 400)).toBe("Bridge");
  });

  it("returns a cargo area name for the cargo layer", () => {
    const name = getAreaName(1600, 875, "cargo");
    expect(name).toBe("Fore Storage");
  });

  it("returns 'Cargo Corridor' near cargo center", () => {
    expect(getAreaName(1600, 1200, "cargo")).toBe("Cargo Corridor");
  });

  it("returns fallback 'Main Deck' for far-away coords on deck", () => {
    // Coordinates far from all named areas (beyond 350px threshold)
    expect(getAreaName(100, 100, "deck")).toBe("Main Deck");
  });

  it("returns fallback 'Cargo Hold' for far-away coords on cargo", () => {
    expect(getAreaName(100, 100, "cargo")).toBe("Cargo Hold");
  });
});

describe("circleIntersectsRect", () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 };

  it("returns true when the circle center is inside the rect", () => {
    expect(circleIntersectsRect(150, 150, 10, rect)).toBe(true);
  });

  it("returns true when the circle overlaps the edge of the rect", () => {
    // Circle center is 5px outside the left edge, radius 10 overlaps
    expect(circleIntersectsRect(95, 150, 10, rect)).toBe(true);
  });

  it("returns false when the circle is far away from the rect", () => {
    expect(circleIntersectsRect(0, 0, 10, rect)).toBe(false);
  });

  it("returns true when the circle exactly touches a corner area", () => {
    // Just barely overlapping the top-left corner
    expect(circleIntersectsRect(95, 95, 10, rect)).toBe(true);
  });

  it("returns false when the circle is just outside the rect", () => {
    // Circle center is 20px left of the rect with radius 10 (gap of ~10px)
    expect(circleIntersectsRect(80, 150, 10, rect)).toBe(false);
  });
});

describe("findNearestDoor", () => {
  it("returns null for an empty doors array", () => {
    expect(findNearestDoor([], 100, 100)).toBeNull();
  });

  it("returns the single door when only one is provided", () => {
    const doors = [{ id: "door-1", x: 50, y: 50, w: 20, h: 40, open: false }];
    const result = findNearestDoor(doors, 60, 70);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("door-1");
    expect(result!.open).toBe(false);
    expect(typeof result!.dist).toBe("number");
  });

  it("returns the nearest door when multiple are provided", () => {
    const doors = [
      { id: "far-door", x: 500, y: 500, w: 20, h: 40, open: true },
      { id: "near-door", x: 90, y: 90, w: 20, h: 40, open: false },
      { id: "mid-door", x: 200, y: 200, w: 20, h: 40, open: true },
    ];
    const result = findNearestDoor(doors, 100, 110);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("near-door");
  });

  it("calculates distance from the door center (x + w/2, y + h/2)", () => {
    const doors = [{ id: "d1", x: 0, y: 0, w: 100, h: 100, open: false }];
    // Door center is at (50, 50), player at (50, 50) => dist = 0
    const result = findNearestDoor(doors, 50, 50);

    expect(result).not.toBeNull();
    expect(result!.dist).toBe(0);
  });
});
