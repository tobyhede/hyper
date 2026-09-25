/** The nearest-rank `p`th percentile (0–100) of `values`, or NaN for none. */
export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? Number.NaN;
};

/** `median / p90 (min–max)` in milliseconds, to one decimal place. */
export const spread = (values: readonly number[]): string => {
  if (values.length === 0) return '—';
  const fixed = (value: number) => value.toFixed(1);
  return `${fixed(percentile(values, 50))} / ${fixed(percentile(values, 90))} (${fixed(Math.min(...values))}–${fixed(Math.max(...values))})`;
};
