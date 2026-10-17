import type { StepResult, ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { isTokenBudgetExceeded } from "./budget";

const step = (inputTokens?: number, outputTokens?: number) =>
  ({ usage: { inputTokens, outputTokens } }) as unknown as StepResult<ToolSet>;

describe("isTokenBudgetExceeded", () => {
  it("does not stop before any step has run", async () => {
    expect(await isTokenBudgetExceeded(1000)({ steps: [] })).toBe(false);
  });

  it("keeps going while input plus output tokens of all steps stay under the budget", async () => {
    expect(await isTokenBudgetExceeded(1000)({ steps: [step(400, 100), step(300, 100)] })).toBe(
      false,
    );
  });

  it("stops once the running total reaches the budget", async () => {
    expect(await isTokenBudgetExceeded(1000)({ steps: [step(400, 100), step(450, 50)] })).toBe(
      true,
    );
  });

  it("counts missing usage as zero instead of failing", async () => {
    expect(await isTokenBudgetExceeded(10)({ steps: [step(undefined, 10)] })).toBe(true);
    expect(await isTokenBudgetExceeded(10)({ steps: [step(undefined, undefined)] })).toBe(false);
  });
});
