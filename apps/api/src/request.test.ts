import { describe, expect, it } from "vitest";
import { parseRunRequest } from "./request";

const today = "2026-10-17";

describe("parseRunRequest", () => {
  it("defaults the usage date to today", () => {
    expect(parseRunRequest({ prompt: "surf", territory: "ES" }, today)).toEqual({
      ok: true,
      prompt: "surf",
      territory: "ES",
      date: today,
    });
  });

  it("accepts a future usage date, which can only make the rule stricter", () => {
    expect(
      parseRunRequest({ prompt: "surf", territory: "ES", date: "2027-06-01" }, today),
    ).toMatchObject({
      ok: true,
      date: "2027-06-01",
    });
  });

  it("rejects a past usage date, which would revive expired licenses", () => {
    expect(
      parseRunRequest({ prompt: "surf", territory: "ES", date: "2020-01-01" }, today),
    ).toMatchObject({
      ok: false,
    });
  });

  it.each([
    [{ territory: "ES" }],
    [{ prompt: "surf", territory: "Spain" }],
    [{ prompt: "surf", territory: "ES", date: "2026-02-30" }],
    [{ prompt: "x".repeat(2001), territory: "ES" }],
    [undefined],
  ])("rejects the malformed body %j", (body) => {
    expect(parseRunRequest(body, today).ok).toBe(false);
  });
});
