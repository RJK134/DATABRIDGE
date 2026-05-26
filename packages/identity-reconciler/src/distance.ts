/**
 * Damerau–Levenshtein distance — optimal string alignment variant.
 *
 * Used for fuzzy name comparison (typos, transpositions, suffix drift).
 * The implementation is iterative O(m*n) and allocates a single row to
 * stay cheap enough for batch reconciliation of tens of thousands of
 * person records.
 */

/** Damerau–Levenshtein distance between two strings (case-insensitive). */
export function damerauLevenshtein(aRaw: string, bRaw: string): number {
  const a = aRaw.toLowerCase();
  const b = bRaw.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rolling rows + an extra previous-previous row for transposition.
  let prevPrev: number[] = new Array(n + 1).fill(0);
  let prev: number[] = new Array(n + 1);
  let curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      let val = Math.min(del, ins, sub);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, (prevPrev[j - 2] ?? 0) + 1);
      }
      curr[j] = val;
    }
    prevPrev = prev;
    prev = curr;
    curr = new Array(n + 1);
  }
  return prev[n] ?? 0;
}

/** Normalised similarity in [0, 1] derived from Damerau–Levenshtein. */
export function nameSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = damerauLevenshtein(a, b);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - dist / longest;
}
