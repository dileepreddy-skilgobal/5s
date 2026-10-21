/** Wording helpers for notification text people read (titles, bodies, digests). */

/** "1 day", "3 days"; `many` defaults to `one` + "s". */
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/**
 * Date as people read it: "18 Oct 2026". Dates are stored as UTC calendar days, so format in UTC to keep the same
 * day the ISO form showed.
 */
export const displayDate = (d: Date): string => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
