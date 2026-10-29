import type { IndicatorKey, OutcomeClass } from './types';

export const INDICATOR_LABELS: Record<IndicatorKey, string> = {
  water: 'Water',
  food: 'Food',
  energy: 'Energy',
  ecosystemHealth: 'Ecosystem health',
  pollution: 'Pollution',
};

export const OUTCOME_TITLES: Record<OutcomeClass, string> = {
  resilient: 'Resilient settlement',
  stressed: 'Stressed settlement',
  crisis: 'Crisis: essential systems collapsed',
};

/** "a", "a and b", "a, b and c". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export function lowerLabel(key: IndicatorKey): string {
  return INDICATOR_LABELS[key].toLowerCase();
}

/** "1 farm", "3 farms". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
