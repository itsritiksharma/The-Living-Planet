import { useState } from 'react';
import type { EventViewDTO } from '../../contracts/views';

export function EventLog({ events }: { events: EventViewDTO[] }) {
  const [keyOnly, setKeyOnly] = useState(false);
  const visible = keyOnly ? events.filter((event) => event.importance === 'major') : events;
  const byTurn = new Map<number, EventViewDTO[]>();
  for (const event of visible) byTurn.set(event.turn, [...(byTurn.get(event.turn) ?? []), event]);
  const turns = [...byTurn.keys()].sort((a, b) => b - a);

  return (
    <section className="panel history" aria-labelledby="history-title">
      <div className="history-head">
        <h2 id="history-title">History</h2>
        <label className="choice">
          <input type="checkbox" checked={keyOnly} onChange={(event) => setKeyOnly(event.target.checked)} />
          Key events only
        </label>
      </div>
      {turns.length === 0 ? (
        <p>No events yet. Each change in the valley will be explained here, with its causes.</p>
      ) : (
        turns.map((turn) => (
          <section key={turn} className="history-turn" aria-label={`Turn ${turn}`}>
            <h3>Turn {turn}</h3>
            <ol>
              {(byTurn.get(turn) ?? []).map((event) => (
                <li key={event.id} className={`event event-${event.kind} importance-${event.importance}`}>
                  <p>
                    {event.importance === 'major' && <span className="visually-hidden">Key event: </span>}
                    {event.summary}
                  </p>
                  {event.causes.length > 0 && (
                    <details>
                      <summary>Why</summary>
                      <ul>
                        {event.causes.map((cause) => (
                          <li key={cause}>{cause}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </section>
  );
}
