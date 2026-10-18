import type { License } from "../catalog/schema";

/**
 * A dataset trains for weeks and the model ships after that, so a license that ends this close to
 * the usage date may not cover the whole job. Such clips are flagged, not refused: the rule
 * decides on the usage date alone.
 */
export const EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Whole days from the usage date to the license's expiry day; null for a perpetual license.
 * Negative or zero means the license no longer applies on the usage date.
 */
export function daysUntilExpiry(license: License, usageDate: string): number | null {
  if (license.expiresAt === null) return null;
  const days = Math.round((Date.parse(license.expiresAt) - Date.parse(usageDate)) / DAY_MS);
  if (Number.isNaN(days)) {
    throw new Error(`Invalid dates: expiry ${license.expiresAt}, usage ${usageDate}`);
  }
  return days;
}

export const expiresSoon = (days: number | null) => days !== null && days <= EXPIRY_WARNING_DAYS;
