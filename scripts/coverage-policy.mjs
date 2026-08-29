export const PRODUCTION_COVERAGE_INCLUDE = Object.freeze([
  "app/**/*.{ts,tsx}",
  "build/**/*.ts",
  "packages/phaser-runtime/src/**/*.ts",
  "src/**/*.{ts,tsx}",
  "next.config.ts",
]);

// Generated declarations have their own byte-for-byte freshness gate. Vite
// config modules execute before coverage starts, so lint/build/entrypoint tests
// own those two reviewed paths instead of pretending they are instrumented.
export const REVIEWED_COVERAGE_EXCLUSIONS = Object.freeze([
  "**/*.d.ts",
  "vite.config.ts",
  "packages/phaser-runtime/vite.config.ts",
]);

export const PRODUCTION_COVERAGE_BASELINE = Object.freeze({
  statements: 74.93,
  branches: 71.71,
  functions: 69.42,
  lines: 76.91,
});

export const PRODUCTION_COVERAGE_COUNTS = Object.freeze({
  statements: Object.freeze({ covered: 7_783, total: 10_386 }),
  branches: Object.freeze({ covered: 5_990, total: 8_353 }),
  functions: Object.freeze({ covered: 1_630, total: 2_348 }),
  lines: Object.freeze({ covered: 7_284, total: 9_470 }),
});

export const PRODUCTION_COVERAGE_THRESHOLDS = Object.freeze({
  ...PRODUCTION_COVERAGE_BASELINE,
});

export function coverageRegressions(
  measured,
  thresholds = PRODUCTION_COVERAGE_THRESHOLDS,
) {
  return Object.entries(thresholds)
    .filter(([metric, threshold]) => measured[metric] < threshold)
    .map(([metric, threshold]) => ({
      metric,
      measured: measured[metric],
      threshold,
    }));
}
