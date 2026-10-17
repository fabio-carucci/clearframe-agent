import { IsoDateSchema, type License } from "../catalog/schema";

export const RIGHTS_VIOLATIONS = [
  "TRAINING_NOT_ALLOWED",
  "TERRITORY_NOT_LICENSED",
  "LICENSE_EXPIRED",
] as const;

export type RightsViolation = (typeof RIGHTS_VIOLATIONS)[number];

export interface UsageRequest {
  /** ISO 3166-1 alpha-2 code of the territory where the dataset will be used. */
  territory: string;
  /** Day the dataset will be used (YYYY-MM-DD). */
  date: string;
}

export type RightsDecision =
  | { allowed: true }
  | { allowed: false; reasons: RightsViolation[] };

export function checkTrainingRights(
  license: License,
  usage: UsageRequest,
): RightsDecision {
  if (!IsoDateSchema.safeParse(usage.date).success) {
    throw new Error(`Invalid usage date: ${JSON.stringify(usage.date)}`);
  }

  const reasons: RightsViolation[] = [];

  if (!license.trainingAllowed) {
    reasons.push("TRAINING_NOT_ALLOWED");
  }

  if (!license.territories.includes(usage.territory)) {
    reasons.push("TERRITORY_NOT_LICENSED");
  }

  if (
    license.expiresAt !== null &&
    new Date(usage.date) >= new Date(license.expiresAt)
  ) {
    reasons.push("LICENSE_EXPIRED");
  }

  if (reasons.length > 0) {
    return { allowed: false, reasons };
  }

  return { allowed: true };
}
