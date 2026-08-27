import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10_000,
    exclude: [...configDefaults.exclude, "tests/browser/**"],
    coverage: { include: ["src/**/*.{ts,tsx}"] },
  },
});
