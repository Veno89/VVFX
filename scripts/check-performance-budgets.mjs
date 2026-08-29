import {
  collectBuildPerformanceMetrics,
  evaluatePerformanceBudgets,
  PERFORMANCE_BUDGETS,
  PERFORMANCE_BUDGET_PROFILE,
} from "./performance-budgets.mjs";

const metrics = await collectBuildPerformanceMetrics();
const violations = evaluatePerformanceBudgets(metrics);

console.log(
  `Performance budget profile v${PERFORMANCE_BUDGET_PROFILE.version}: ${PERFORMANCE_BUDGET_PROFILE.baselineRuns} baseline runs, ${PERFORMANCE_BUDGET_PROFILE.environment}`,
);
for (const [id, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
  const actual = metrics[id];
  const state = actual <= budget.maximum ? "PASS" : "FAIL";
  console.log(
    `${state} ${id}: ${actual.toLocaleString("en-US")} / ${budget.maximum.toLocaleString("en-US")} bytes (${budget.description}; baseline ${budget.baseline.toLocaleString("en-US")})`,
  );
}

if (violations.length > 0) {
  console.error(
    `Performance budgets failed for: ${violations.map(({ id }) => id).join(", ")}. Review the build diff and update a budget only with a new measured baseline and rationale.`,
  );
  process.exitCode = 1;
} else {
  console.log("All deterministic production build budgets passed.");
}
