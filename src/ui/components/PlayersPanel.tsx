import type { RosterEntryDTO } from '../../contracts/views';
import { initialOf } from '../presentation/format';

export function PlayersPanel({ roster, maxPlayers, active }: { roster: RosterEntryDTO[]; maxPlayers: number; active: boolean }) {
  return (
    <section className="panel" aria-labelledby="players-title">
      <h2 id="players-title">
        Players ({roster.length}/{maxPlayers})
      </h2>
      <ul className="roster">
        {roster.map((player) => (
          <li key={player.playerId}>
            <span className={`owner-badge owner-${player.colorIndex}`} aria-hidden="true">
              {initialOf(player.displayName)}
            </span>
            <span>
              <strong>{player.displayName}</strong>
              {player.isYou ? ' (you)' : ''} ·{' '}
              {player.connected ? (active ? (player.ready ? 'Ready' : 'Choosing') : 'Connected') : 'Disconnected (waits automatically)'}
              <br />
              <span className="hint">
                {player.credits} credits · built {player.structuresBuilt} · contributed {player.contributed}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">Choices stay hidden until the turn resolves. Open another browser tab to add a player on this computer.</p>
    </section>
  );
}
