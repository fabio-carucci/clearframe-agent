import { describe, expect, it } from "vitest";
import { TOKEN_BUDGET } from "./agent";
import { stopReasonOf } from "./run";

describe("stopReasonOf", () => {
  it("is completed when the model ended with a text answer", () => {
    expect(stopReasonOf("stop", TOKEN_BUDGET * 2)).toBe("completed");
  });

  it("blames the token budget when the loop stopped mid tool call over budget", () => {
    expect(stopReasonOf("tool-calls", TOKEN_BUDGET)).toBe("token_budget");
  });

  it("blames the step limit when the loop stopped mid tool call under budget", () => {
    expect(stopReasonOf("tool-calls", TOKEN_BUDGET - 1)).toBe("step_limit");
  });
});
