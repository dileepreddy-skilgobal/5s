/**
 * Builds the next human-readable sequential code for a prefix, e.g. `OBS-LOCB-2026-` → `OBS-LOCB-2026-0007`.
 *
 * The sequence continues from the highest existing number with that prefix (not a row count), so deletions
 * never cause the next code to collide with an existing one. Concurrent creators can still race; the database
 * unique constraint rejects the loser (mapped to HTTP 409) rather than silently duplicating a code.
 */
export async function nextSequenceCode(
  prefix: string,
  fetchExistingCodes: (prefix: string) => Promise<string[]>,
  padLength = 4,
): Promise<string> {
  const existing = await fetchExistingCodes(prefix);
  let max = 0;
  for (const code of existing) {
    const suffix = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(suffix) && suffix > max) {
      max = suffix;
    }
  }
  return `${prefix}${String(max + 1).padStart(padLength, '0')}`;
}

/** Normalizes an area code fragment used inside generated codes (alphanumerics, upper-case, max 4 chars). */
export function codeFragment(source: string | null | undefined, fallback = 'LOC'): string {
  const cleaned = (source || '').replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase();
  return cleaned || fallback;
}
