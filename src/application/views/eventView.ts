import type { EventSnapshot } from '../../domain/model/types';
import type { EventViewDTO } from '../../contracts/views';

export function toEventView(event: EventSnapshot): EventViewDTO {
  return {
    id: event.id,
    turn: event.turn,
    kind: event.kind,
    importance: event.importance,
    summary: event.summary,
    causes: [...event.causes],
    ...(event.deltas ? { deltas: { ...event.deltas } } : {}),
    ...(event.actorId ? { actorId: event.actorId } : {}),
  };
}
