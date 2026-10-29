/** Round to one decimal place; indicators are stored at this precision after each turn. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** "+3.1" / "−2.0" with a true minus sign, for explanations. */
export function signed1(value: number): string {
  const rounded = round1(value);
  if (rounded === 0) return '±0.0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`;
}

export function fixed1(value: number): string {
  return round1(value).toFixed(1);
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
