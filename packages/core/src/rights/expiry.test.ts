import { describe, expect, it } from "vitest";
import type { License } from "../catalog/schema";
import { EXPIRY_WARNING_DAYS, daysUntilExpiry, expiresSoon } from "./expiry";

const license = (expiresAt: string | null): License => ({
  trainingAllowed: true,
  territories: ["ES"],
  expiresAt,
});

describe("daysUntilExpiry", () => {
  it("counts whole days from the usage date to the expiry day", () => {
    expect(daysUntilExpiry(license("2026-11-02"), "2026-10-17")).toBe(16);
  });

  it("counts across a daylight saving change without drifting", () => {
    expect(daysUntilExpiry(license("2027-04-01"), "2027-03-01")).toBe(31);
  });

  it("is null for a perpetual license", () => {
    expect(daysUntilExpiry(license(null), "2026-10-17")).toBeNull();
  });

  it("is zero on the expiry day, when the license already no longer applies", () => {
    expect(daysUntilExpiry(license("2026-10-17"), "2026-10-17")).toBe(0);
  });

  it("throws on a date it cannot read instead of returning NaN", () => {
    expect(() => daysUntilExpiry(license("2026-10-17"), "soon")).toThrow("Invalid dates");
  });
});

describe("expiresSoon", () => {
  it("flags licenses ending within the warning window, inclusive", () => {
    expect(expiresSoon(EXPIRY_WARNING_DAYS)).toBe(true);
    expect(expiresSoon(EXPIRY_WARNING_DAYS + 1)).toBe(false);
  });

  it("never flags a perpetual license", () => {
    expect(expiresSoon(null)).toBe(false);
  });
});
