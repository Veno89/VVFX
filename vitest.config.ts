import { configDefaults, defineConfig } from "vitest/config";
import {
  PRODUCTION_COVERAGE_INCLUDE,
  PRODUCTION_COVERAGE_THRESHOLDS,
  REVIEWED_COVERAGE_EXCLUSIONS,
} from "./scripts/coverage-policy.mjs";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10_000,
    // Full-editor mounts and declaration compiler fixtures are intentionally
    // serialized so their deadlines do not depend on concurrent host load.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, "tests/browser/**"],
    coverage: {
      provider: "v8",
      include: [...PRODUCTION_COVERAGE_INCLUDE],
      exclude: [...REVIEWED_COVERAGE_EXCLUSIONS],
      reporter: ["text", "json-summary"],
      thresholds: PRODUCTION_COVERAGE_THRESHOLDS,
    },
  },
});
