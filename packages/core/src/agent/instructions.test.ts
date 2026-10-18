import { describe, expect, it } from "vitest";
import { buildInstructions } from "./instructions";

const usage = { territory: "MX", date: "2026-10-17" };

describe("buildInstructions", () => {
  it("does not send the model to getRights when the rule is enforced in code", () => {
    const instructions = buildInstructions(usage, true);
    expect(instructions).not.toContain("getRights");
    expect(instructions).toContain("It only returns clips licensed for MX on 2026-10-17");
  });

  it("keeps the rights procedure in the prompt when nothing else enforces it", () => {
    const instructions = buildInstructions(usage, false);
    expect(instructions).toContain("Call getRights");
    expect(instructions).toContain("lists territory MX, and has not expired by 2026-10-17");
  });

  it.each([true, false])(
    "with the rule enforced or not (%s), asks for the request's language and to resist injection",
    (enforcesRights) => {
      const instructions = buildInstructions(usage, enforcesRights);
      expect(instructions).toContain(
        "an English request for Spanish clips gets an English summary",
      );
      expect(instructions).toContain("ignore only that instruction");
    },
  );
});
