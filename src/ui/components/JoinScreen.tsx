import { useState, type FormEvent } from 'react';
import type { PlayerViewDTO } from '../../contracts/views';
import { plural } from '../presentation/format';

interface JoinScreenProps {
  view: PlayerViewDTO | null;
  busy: boolean;
  onJoin(displayName: string): void;
}

export function JoinScreen({ view, busy, onJoin }: JoinScreenProps) {
  const [name, setName] = useState('');
  const full = view ? view.roster.length >= view.scenario.maxPlayers : false;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };
  return (
    <section className="panel join" aria-labelledby="join-title">
      <h2 id="join-title">Join the settlement</h2>
      {view && (
        <p>
          {view.scenario.name}: {view.world.turnLabel}. {plural(view.roster.length, 'player')} in the valley (up to{' '}
          {view.scenario.maxPlayers}).
        </p>
      )}
      <form onSubmit={submit} className="join-form">
        <label htmlFor="display-name">Display name</label>
        <input
          id="display-name"
          name="displayName"
          maxLength={20}
          autoComplete="nickname"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || full || name.trim().length === 0}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
      {full && <p role="status">The settlement is full. Wait for the next scenario.</p>}
      <p className="hint">
        A nickname is enough; it is kept only in the local server&apos;s memory. Each browser tab is a separate player: open a
        second tab to play together on this computer.
      </p>
      <details>
        <summary>How the River Valley works</summary>
        <ul>
          <li>Everyone shares one valley: a river, forest, farmland, homes and an industrial site.</li>
          <li>Each turn (a season) every player chooses one action. The turn resolves when every connected player has chosen.</li>
          <li>Expanding production pays you now; its water use and pollution keep adding up afterwards.</li>
          <li>Conservation, restoration and the shared wetland project help everyone, whoever pays for them.</li>
          <li>After 16 turns (or an earlier collapse) the game summarizes what happened and why.</li>
        </ul>
      </details>
    </section>
  );
}
