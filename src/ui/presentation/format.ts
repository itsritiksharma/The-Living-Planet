/** Indicators are stored at one-decimal precision; show exactly that everywhere (map and dashboard alike). */
export function formatValue(value: number): string {
  return value.toFixed(1);
}

/** "+3.1", "−2.0", "±0.0"; an em dash before the first turn has resolved. */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '±0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
