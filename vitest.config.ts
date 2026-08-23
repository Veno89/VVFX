import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10_000,
    coverage: { include: ["src/**/*.{ts,tsx}"] },
  },
});
