import { useCallback, useState, useSyncExternalStore } from 'react';
import type { ClientState, GameClient } from '../client/GameClient';
import type { Motivation, ReflectionEntry, ReflectionJournal } from '../client/ReflectionJournal';

export function useGameClient(client: GameClient): ClientState {
  return useSyncExternalStore(client.subscribe, client.getState, client.getState);
}

/** The optional self-inquiry journal for the current world (client-only). */
export interface ReflectionsApi {
  hidden: boolean;
  setHidden(hidden: boolean): void;
  record(entry: { turn: number; decision: string; motivation: Motivation }): void;
  entries: ReflectionEntry[];
}

export function useReflections(journal: ReflectionJournal, worldId: string | null): ReflectionsApi {
  const [hidden, setHiddenState] = useState(() => journal.isPromptHidden());
  const [version, setVersion] = useState(0);
  const setHidden = useCallback(
    (value: boolean) => {
      journal.setPromptHidden(value);
      setHiddenState(value);
    },
    [journal],
  );
  const record = useCallback(
    (entry: { turn: number; decision: string; motivation: Motivation }) => {
      if (!worldId) return;
      journal.record({ worldId, ...entry });
      setVersion((v) => v + 1);
    },
    [journal, worldId],
  );
  void version; // re-read entries after each record
  return { hidden, setHidden, record, entries: worldId ? journal.entriesFor(worldId) : [] };
}
