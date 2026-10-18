import { describe, expect, it } from "vitest";
import { parseRunRequest } from "./request";

const morning = new Date("2026-10-17T09:00:00Z");
const request = (date?: string) => ({ prompt: "surf", territory: "ES", ...(date && { date }) });

describe("parseRunRequest", () => {
  it("defaults the usage date to today in UTC", () => {
    expect(parseRunRequest(request(), morning)).toEqual({
      ok: true,
      prompt: "surf",
      territory: "ES",
      date: "2026-10-17",
    });
  });

  it("accepts a future usage date, which can only make the rule stricter", () => {
    expect(parseRunRequest(request("2027-06-01"), morning)).toMatchObject({
      ok: true,
      date: "2027-06-01",
    });
  });

  it("accepts yesterday's date until 12:00 UTC, while it is still that day at UTC-12", () => {
    const at = (time: string) => new Date(`2026-10-19T${time}Z`);
    expect(parseRunRequest(request("2026-10-18"), at("11:59:59")).ok).toBe(true);
    expect(parseRunRequest(request("2026-10-18"), at("12:00:00")).ok).toBe(false);
  });

  it("rejects yesterday in the afternoon, so no license works on the day it expires", () => {
    // A license with expiresAt 2026-10-19 is already invalid on 2026-10-19; a request dated
    // 2026-10-18 at 15:00 UTC would have made it pass.
    expect(parseRunRequest(request("2026-10-18"), new Date("2026-10-19T15:00:00Z"))).toMatchObject({
      ok: false,
      error: "Usage date 2026-10-18 is in the past; use 2026-10-19 or later",
    });
  });

  it.each([
    [{ territory: "ES" }],
    [{ prompt: "surf", territory: "Spain" }],
    [{ prompt: "surf", territory: "ES", date: "2026-02-30" }],
    [{ prompt: "x".repeat(2001), territory: "ES" }],
    [undefined],
  ])("rejects the malformed body %j", (body) => {
    expect(parseRunRequest(body, morning).ok).toBe(false);
  });
});
