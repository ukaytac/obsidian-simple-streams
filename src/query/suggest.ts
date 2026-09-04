/** Levenshtein distance, two rows at a time. */
export function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  let previous = new Array<number>(cols);
  let current = new Array<number>(cols);

  for (let j = 0; j < cols; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[cols - 1];
}

export function nearestField(input: string, candidates: readonly string[]): string | null {
  // Below three characters there is nothing to be confident about: the field
  // list holds a two-letter name (`to`), so every short input lands on it —
  // "gr", "wh" and "li" all came out as `to` before this gate.
  if (input.length < 3) {
    return null;
  }

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  // Only suggest when the guess is actually close, so nonsense input gets the
  // full field list instead of a misleading "did you mean".
  const threshold = Math.max(2, Math.floor(input.length / 3));
  return best !== null && bestDistance <= threshold ? best : null;
}
