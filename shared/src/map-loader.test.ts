import { describe, it, expect } from "vitest";
import { validateMapLayout } from "./map-loader";

describe("validateMapLayout", () => {
  it("returns a valid layout from complete input", () => {
    const input = {
      name: "Test Map",
      width: 4000,
      height: 3000,
      walls: [{ x: 0, y: 0, w: 100, h: 10 }],
      floors: [{ x: 0, y: 0, w: 200, h: 200, color: "#333" }],
      stations: [{ id: "s1", x: 50, y: 50, type: "repair" }],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-06-01T00:00:00.000Z",
    };

    const result = validateMapLayout(input);

    expect(result.name).toBe("Test Map");
    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
    expect(result.walls).toEqual([{ x: 0, y: 0, w: 100, h: 10 }]);
    expect(result.floors).toEqual([{ x: 0, y: 0, w: 200, h: 200, color: "#333" }]);
    expect(result.stations).toEqual([{ id: "s1", x: 50, y: 50, type: "repair" }]);
    expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("fills defaults for missing name, width, and height", () => {
    const result = validateMapLayout({});

    expect(result.name).toBe("Unknown Map");
    expect(result.width).toBe(3200);
    expect(result.height).toBe(2400);
  });

  it("converts non-array walls/floors/stations to empty arrays", () => {
    const result = validateMapLayout({
      walls: "not an array",
      floors: 42,
      stations: null,
    });

    expect(result.walls).toEqual([]);
    expect(result.floors).toEqual([]);
    expect(result.stations).toEqual([]);
  });

  it("preserves valid arrays", () => {
    const walls = [{ x: 10, y: 20, w: 30, h: 40 }];
    const floors = [{ x: 0, y: 0, w: 100, h: 100, color: "#fff" }];
    const stations = [{ id: "st1", x: 5, y: 5, type: "console" }];

    const result = validateMapLayout({ walls, floors, stations });

    expect(result.walls).toEqual(walls);
    expect(result.floors).toEqual(floors);
    expect(result.stations).toEqual(stations);
  });

  it("fills createdAt and updatedAt with ISO strings when missing", () => {
    const result = validateMapLayout({});

    // Should be valid ISO 8601 date strings
    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);

    expect(() => new Date(result.updatedAt)).not.toThrow();
    expect(new Date(result.updatedAt).toISOString()).toBe(result.updatedAt);
  });
});
