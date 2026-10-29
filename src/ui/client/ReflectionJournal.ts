import type { SafeStorage } from './storage';

export type Motivation = 'practical_need' | 'comfort' | 'status' | 'fear_of_falling_behind' | 'habit';

export const MOTIVATIONS: readonly { value: Motivation; label: string }[] = [
  { value: 'practical_need', label: 'Practical need' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'status', label: 'Status or comparison' },
  { value: 'fear_of_falling_behind', label: 'Fear of falling behind' },
  { value: 'habit', label: "Habit; I haven't examined the assumption" },
];

export interface ReflectionEntry {
  worldId: string;
  turn: number;
  decision: string;
  motivation: Motivation;
}

/**
 * The self-inquiry prompt's answers. Kept only in this browser tab and never sent to the server,
 * so they cannot influence the simulation, score the player, or be stored as personal data.
 */
export class ReflectionJournal {
  private static readonly ENTRIES = 'living-planet:reflections';
  private static readonly HIDDEN = 'living-planet:reflections-hidden';

  constructor(private readonly storage: SafeStorage) {}

  record(entry: ReflectionEntry): void {
    const entries = this.all().filter((e) => !(e.worldId === entry.worldId && e.turn === entry.turn));
    this.storage.set(ReflectionJournal.ENTRIES, JSON.stringify([...entries, entry]));
  }

  entriesFor(worldId: string): ReflectionEntry[] {
    return this.all().filter((entry) => entry.worldId === worldId);
  }

  isPromptHidden(): boolean {
    return this.storage.get(ReflectionJournal.HIDDEN) === 'true';
  }

  setPromptHidden(hidden: boolean): void {
    if (hidden) this.storage.set(ReflectionJournal.HIDDEN, 'true');
    else this.storage.remove(ReflectionJournal.HIDDEN);
  }

  private all(): ReflectionEntry[] {
    try {
      const parsed = JSON.parse(this.storage.get(ReflectionJournal.ENTRIES) ?? '[]') as unknown;
      return Array.isArray(parsed) ? (parsed as ReflectionEntry[]) : [];
    } catch {
      return [];
    }
  }
}
