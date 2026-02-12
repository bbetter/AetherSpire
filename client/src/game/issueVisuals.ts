import type { IssueType } from "@aether-spire/shared";

export interface IssueParticleConfig {
  colors: number[];
  shape: "circle" | "rect" | "line" | "diamond";
  emitRateBase: number;
  emitRateMax: number;
  lifetimeRange: [number, number];
  speedRange: [number, number];
  sizeRange: [number, number];
  spawnRadiusBase: number;
  spawnRadiusMax: number;
  directionPattern: "upward" | "downward" | "radial_out" | "random";
  alphaRange: [number, number];
  gravity: number;
  fadePattern: "linear" | "ease_out" | "flicker";
}

export interface IssueVisuals {
  colors: Record<IssueType, number>;
  labels: Record<IssueType, string>;
  particleConfigs: Record<IssueType, IssueParticleConfig>;
}

export const DEFAULT_ISSUE_VISUALS: IssueVisuals = {
  colors: {
    pressure_surge: 0xff6b6b,
    coolant_leak: 0x6aa5ff,
    mechanical_drift: 0xffb24d,
    capacitor_overload: 0xb197fc,
    friction_fire: 0xff9944,
    control_corruption: 0x63e6be,
  },
  labels: {
    pressure_surge: "Pressure Surge",
    coolant_leak: "Coolant Leak",
    mechanical_drift: "Mech. Drift",
    capacitor_overload: "Cap. Overload",
    friction_fire: "Friction Fire",
    control_corruption: "Ctrl Corrupt",
  },
  particleConfigs: {
    pressure_surge: {
      colors: [0xffffff, 0xe8e8e8, 0xdddddd],
      shape: "circle",
      emitRateBase: 14, emitRateMax: 40,
      lifetimeRange: [0.6, 1.4],
      speedRange: [30, 70],
      sizeRange: [3, 7],
      spawnRadiusBase: 12, spawnRadiusMax: 40,
      directionPattern: "upward",
      alphaRange: [0.85, 0],
      gravity: -12,
      fadePattern: "ease_out",
    },
    coolant_leak: {
      colors: [0x6aa5ff, 0x4499ee, 0x99ccff],
      shape: "circle",
      emitRateBase: 10, emitRateMax: 30,
      lifetimeRange: [0.8, 1.6],
      speedRange: [12, 35],
      sizeRange: [2.5, 6],
      spawnRadiusBase: 10, spawnRadiusMax: 35,
      directionPattern: "downward",
      alphaRange: [0.9, 0.15],
      gravity: 25,
      fadePattern: "linear",
    },
    mechanical_drift: {
      colors: [0xffb24d, 0xff8800, 0xffdd88],
      shape: "diamond",
      emitRateBase: 16, emitRateMax: 45,
      lifetimeRange: [0.3, 0.8],
      speedRange: [50, 120],
      sizeRange: [2, 5],
      spawnRadiusBase: 8, spawnRadiusMax: 30,
      directionPattern: "radial_out",
      alphaRange: [1.0, 0],
      gravity: 15,
      fadePattern: "linear",
    },
    capacitor_overload: {
      colors: [0xb197fc, 0xd4c0ff, 0x9966ee],
      shape: "line",
      emitRateBase: 8, emitRateMax: 22,
      lifetimeRange: [0.1, 0.35],
      speedRange: [0, 8],
      sizeRange: [12, 28],
      spawnRadiusBase: 14, spawnRadiusMax: 45,
      directionPattern: "random",
      alphaRange: [1.0, 0],
      gravity: 0,
      fadePattern: "flicker",
    },
    friction_fire: {
      colors: [0xff9944, 0xff4422, 0xffcc44, 0x555555],
      shape: "circle",
      emitRateBase: 14, emitRateMax: 40,
      lifetimeRange: [0.6, 1.4],
      speedRange: [18, 50],
      sizeRange: [2.5, 7],
      spawnRadiusBase: 10, spawnRadiusMax: 35,
      directionPattern: "upward",
      alphaRange: [0.9, 0],
      gravity: -18,
      fadePattern: "ease_out",
    },
    control_corruption: {
      colors: [0x63e6be, 0x44dd99, 0xaaffee],
      shape: "rect",
      emitRateBase: 10, emitRateMax: 30,
      lifetimeRange: [0.15, 0.6],
      speedRange: [25, 65],
      sizeRange: [2, 6],
      spawnRadiusBase: 12, spawnRadiusMax: 38,
      directionPattern: "random",
      alphaRange: [1.0, 0],
      gravity: 0,
      fadePattern: "flicker",
    },
  },
};
