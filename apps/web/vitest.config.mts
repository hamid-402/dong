import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        lines: 19,
        branches: 17,
        functions: 15,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
  },
});
