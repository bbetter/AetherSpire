import { defineWorkspace } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const sharedSourceEntry = resolve(workspaceRoot, "shared/src/index.ts");

export default defineWorkspace([
  {
    resolve: {
      alias: {
        "@aether-spire/shared": sharedSourceEntry,
      },
    },
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
    resolve: {
      alias: {
        "@aether-spire/shared": sharedSourceEntry,
      },
    },
    test: {
      name: "client",
      root: "./client",
      include: ["src/**/*.test.ts"],
      exclude: ["dist/**"],
      environment: "node",
    },
  },
]);
