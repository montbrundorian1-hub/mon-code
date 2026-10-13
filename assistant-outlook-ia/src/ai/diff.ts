/**
 * Comparaison mot à mot (plus longue sous-séquence commune) entre deux textes.
 */

export type DiffOp = { type: 'equal' | 'insert' | 'delete'; text: string };

function tokenize(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

export function diffWords(a: string, b: string): DiffOp[] {
  const x = tokenize(a);
  const y = tokenize(b);
  // Garde-fou de complexité : au-delà, diff grossier par blocs.
  if (x.length * y.length > 4_000_000) {
    return [
      { type: 'delete', text: a },
      { type: 'insert', text: b },
    ];
  }
  const n = x.length;
  const m = y.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('equal', x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('delete', x[i++]);
    } else {
      push('insert', y[j++]);
    }
  }
  while (i < n) push('delete', x[i++]);
  while (j < m) push('insert', y[j++]);
  return ops;
}

export function diffStats(ops: DiffOp[]): { inserted: number; deleted: number } {
  let inserted = 0;
  let deleted = 0;
  for (const o of ops) {
    const words = o.text.trim() ? o.text.trim().split(/\s+/).length : 0;
    if (o.type === 'insert') inserted += words;
    if (o.type === 'delete') deleted += words;
  }
  return { inserted, deleted };
}
