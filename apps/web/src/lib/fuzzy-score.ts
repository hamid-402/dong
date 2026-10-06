/**
 * Pure fuzzy scorer: subsequence match with consecutive-run bonus.
 * Higher is better; -1 means no match. Works for Persian/Latin labels.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 10_000;
  const exactAt = t.indexOf(q);
  if (exactAt >= 0) {
    return 5_000 + Math.max(0, 1_000 - exactAt) - Math.max(0, t.length - q.length);
  }

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let firstIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstIndex < 0) firstIndex = ti;
      consecutive += 1;
      score += 10 + consecutive * 5;
      if (ti === 0 || /\s/.test(t[ti - 1]!)) score += 15;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }

  if (qi !== q.length) return -1;
  score -= firstIndex;
  score -= Math.max(0, t.length - q.length);
  return score;
}
