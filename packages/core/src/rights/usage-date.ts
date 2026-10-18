/** UTC-12 is the last time zone to reach each new day. */
const LAST_ZONE_OFFSET_MS = 12 * 3_600_000;

/**
 * The earliest usage date that is still today somewhere: the date at UTC-12. A day is past only
 * once it is past everywhere; accepting any earlier date would let a license work on, or after,
 * the day it expires.
 */
export const earliestUsageDate = (now: Date) =>
  new Date(now.getTime() - LAST_ZONE_OFFSET_MS).toISOString().slice(0, 10);
