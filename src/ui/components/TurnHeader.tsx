import type { PlayerViewDTO } from '../../contracts/views';
import { initialOf } from '../presentation/format';

export function TurnHeader({ view }: { view: PlayerViewDTO }) {
  const { world, you } = view;
  const turnsLeft = world.totalTurns - world.turn + 1;
  const income = you?.income;
  const net = income?.net ?? 0;
  return (
    <header className="turn-header">
      <div>
        <h2>{world.turnLabel}</h2>
        <p className="hint">
          {world.status === 'ended' ? 'Scenario complete.' : `${turnsLeft} ${turnsLeft === 1 ? 'turn' : 'turns'} left, including this one.`}
        </p>
      </div>
      {you && income && (
        <div className="you" aria-label="Your status">
          <span className={`owner-badge owner-${you.colorIndex}`} aria-hidden="true">
            {initialOf(you.displayName)}
          </span>
          <span>
            <strong>{you.displayName}</strong> · <strong>{you.credits} credits</strong>
            {world.status === 'active' && (
              <>
                {' '}
                · expected this turn {net >= 0 ? '+' : '−'}
                {Math.abs(net)} (base {income.base}, farms {income.farms}, industry {income.industry}
                {income.hardship > 0 ? `, shortages −${income.hardship}` : ''})
              </>
            )}
          </span>
        </div>
      )}
    </header>
  );
}
