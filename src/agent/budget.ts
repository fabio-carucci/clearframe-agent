import type { StopCondition, ToolSet } from "ai";

export function isTokenBudgetExceeded(
  maxTotalTokens: number,
): StopCondition<ToolSet> {
  return async ({ steps }) => {
    let totalTokens = 0;

    for (const step of steps) {
      const inputTokens = step.usage?.inputTokens ?? 0;
      const outputTokens = step.usage?.outputTokens ?? 0;
      totalTokens += inputTokens + outputTokens;

      if (totalTokens >= maxTotalTokens) {
        return true;
      }
    }

    return false;
  };
}
