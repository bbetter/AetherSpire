import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "server",
      root: "./server",
      include: ["src/**/*.test.ts"],
      exclude: ["dist/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "shared",
      root: "./shared",
      include: ["src/**/*.test.ts"],
      exclude: ["dist/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "client",
      root: "./client",
      include: ["src/**/*.test.ts"],
      exclude: ["dist/**"],
      environment: "node",
    },
  },
]);
