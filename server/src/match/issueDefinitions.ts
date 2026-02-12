import type { IssueType, InstrumentType } from "@aether-spire/shared";

export interface IssueDefinition {
  baseFixTime: number;       // seconds
  fixTimeWithTool: number;   // seconds
  requiredTool: InstrumentType;
  stabilityReward: number;   // % restored on fix
}

export const ISSUE_DEFINITIONS: Record<IssueType, IssueDefinition> = {
  pressure_surge:     { baseFixTime: 15, fixTimeWithTool: 8, requiredTool: "thermal_regulator", stabilityReward: 5 }, // Increased base time, 47% reduction with tool
  coolant_leak:       { baseFixTime: 14, fixTimeWithTool: 8, requiredTool: "gear_wrench",       stabilityReward: 4 }, // Increased base time, 43% reduction with tool
  mechanical_drift:   { baseFixTime: 16, fixTimeWithTool: 9, requiredTool: "gear_wrench",       stabilityReward: 5 }, // Increased base time, 44% reduction with tool
  capacitor_overload: { baseFixTime: 18, fixTimeWithTool: 10, requiredTool: "arcane_conduit",    stabilityReward: 7 }, // Increased base time, 44% reduction with tool
  friction_fire:      { baseFixTime: 14, fixTimeWithTool: 8, requiredTool: "thermal_regulator", stabilityReward: 4 }, // Increased base time, 43% reduction with tool
  control_corruption: { baseFixTime: 20, fixTimeWithTool: 11, requiredTool: "arcane_conduit",    stabilityReward: 8 }, // Increased base time, 45% reduction with tool
};

export const ISSUE_TYPES: IssueType[] = [
  "pressure_surge",
  "coolant_leak",
  "mechanical_drift",
  "capacitor_overload",
  "friction_fire",
  "control_corruption",
];
