import { describe, expect, it } from "vitest";
import {
  collectBuildPerformanceMetrics,
  evaluatePerformanceBudgets,
  PERFORMANCE_BUDGETS,
  PERFORMANCE_BUDGET_PROFILE,
} from "../scripts/performance-budgets.mjs";

describe("production performance budgets", () => {
  it("records a versioned baseline and explicit numeric limits", () => {
    expect(PERFORMANCE_BUDGET_PROFILE).toMatchObject({
      version: 1,
      baselineRuns: 3,
      baselineConsistency: "3/3 production builds were byte-identical",
      buildCommand: "npm.cmd run build:all",
    });
    expect(Object.keys(PERFORMANCE_BUDGETS)).toHaveLength(8);
    for (const budget of Object.values(PERFORMANCE_BUDGETS)) {
      expect(budget.baseline).toBeGreaterThan(0);
      expect(budget.maximum).toBeGreaterThanOrEqual(budget.baseline);
      expect(budget.description).not.toHaveLength(0);
    }
  });

  it("accepts an exact limit and fails an intentional one-byte regression", () => {
    const budgets = {
      fixtureBytes: {
        baseline: 90,
        maximum: 100,
        description: "intentional threshold fixture",
      },
    };

    expect(evaluatePerformanceBudgets({ fixtureBytes: 100 }, budgets)).toEqual(
      [],
    );
    expect(
      evaluatePerformanceBudgets({ fixtureBytes: 101 }, budgets),
    ).toMatchObject([
      { id: "fixtureBytes", actual: 101, reason: "maximum exceeded" },
    ]);
  });

  it("keeps the current production build within the checked-in limits", async () => {
    const metrics = await collectBuildPerformanceMetrics();
    expect(evaluatePerformanceBudgets(metrics)).toEqual([]);
  });
});
