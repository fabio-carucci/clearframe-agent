import { describe, expect, it } from "vitest";
import { REFERENCE_DATE, generateCatalog } from "../catalog/generate";
import type { License } from "../catalog/schema";
import { checkTrainingRights } from "./check-training-rights";

const cleanLicense: License = {
  trainingAllowed: true,
  territories: ["ES", "IT", "FR"],
  expiresAt: "2027-06-30",
};

const usage = { territory: "ES", date: "2026-10-01" };

describe("checkTrainingRights", () => {
  describe("allows", () => {
    it("a training license for the requested territory that has not expired", () => {
      expect(checkTrainingRights(cleanLicense, usage)).toEqual({ allowed: true });
    });

    it("a perpetual license", () => {
      const perpetual = { ...cleanLicense, expiresAt: null };
      expect(checkTrainingRights(perpetual, usage)).toEqual({ allowed: true });
    });

    it("use on the day before the license expires", () => {
      expect(checkTrainingRights(cleanLicense, { ...usage, date: "2027-06-29" })).toEqual({
        allowed: true,
      });
    });
  });

  describe("rejects", () => {
    it("a license that does not allow training", () => {
      const license = { ...cleanLicense, trainingAllowed: false };
      expect(checkTrainingRights(license, usage)).toEqual({
        allowed: false,
        reasons: ["TRAINING_NOT_ALLOWED"],
      });
    });

    it("a territory missing from the license", () => {
      expect(checkTrainingRights(cleanLicense, { ...usage, territory: "US" })).toEqual({
        allowed: false,
        reasons: ["TERRITORY_NOT_LICENSED"],
      });
    });

    it("use on the expiry day itself (fail closed on the boundary)", () => {
      expect(checkTrainingRights(cleanLicense, { ...usage, date: "2027-06-30" })).toEqual({
        allowed: false,
        reasons: ["LICENSE_EXPIRED"],
      });
    });

    it("use after the license has expired", () => {
      expect(checkTrainingRights(cleanLicense, { ...usage, date: "2028-01-01" })).toEqual({
        allowed: false,
        reasons: ["LICENSE_EXPIRED"],
      });
    });

    it("territory codes that do not match exactly, instead of normalising them", () => {
      expect(checkTrainingRights(cleanLicense, { ...usage, territory: "es" })).toEqual({
        allowed: false,
        reasons: ["TERRITORY_NOT_LICENSED"],
      });
    });
  });

  it("reports every violation at once, in a stable order", () => {
    const broken: License = {
      trainingAllowed: false,
      territories: ["JP"],
      expiresAt: "2026-01-01",
    };
    expect(checkTrainingRights(broken, usage)).toEqual({
      allowed: false,
      reasons: ["TRAINING_NOT_ALLOWED", "TERRITORY_NOT_LICENSED", "LICENSE_EXPIRED"],
    });
  });

  it.each(["2026-13-45", "01/10/2026", ""])(
    "throws on the malformed usage date %j instead of allowing the clip",
    (date) => {
      const expired = { ...cleanLicense, expiresAt: "2020-01-01" };
      expect(() => checkTrainingRights(expired, { ...usage, date })).toThrow();
    },
  );

  it.each(["2027-13-45", "not a date", ""])(
    "throws on the malformed license expiry %j instead of reading it as not expired",
    (expiresAt) => {
      expect(() => checkTrainingRights({ ...cleanLicense, expiresAt }, usage)).toThrow();
    },
  );

  it("does not depend on the current date", () => {
    const expired = { ...cleanLicense, expiresAt: "2020-01-01" };
    expect(checkTrainingRights(expired, { ...usage, date: "2019-12-31" })).toEqual({
      allowed: true,
    });
  });

  it("accepts exactly the clean clips of the generated catalog for Spain", () => {
    const allowed = generateCatalog().filter(
      (clip) =>
        checkTrainingRights(clip.license, { territory: "ES", date: REFERENCE_DATE }).allowed,
    );
    expect(allowed).toHaveLength(210);
  });
});
