import { describe, expect, it } from 'vitest';
import { ConcurrencyError } from '../../src/application/errors';
import { ActionFactory } from '../../src/domain/actions/ActionFactory';
import { WaitAction } from '../../src/domain/actions/actions';
import { DisplayName } from '../../src/domain/model/DisplayName';
import { InMemoryIdempotencyStore } from '../../src/infrastructure/persistence/InMemoryIdempotencyStore';
import { InMemorySubmissionRepository } from '../../src/infrastructure/persistence/InMemorySubmissionRepository';
import { InMemoryWorldRepository } from '../../src/infrastructure/persistence/InMemoryWorldRepository';
import { MessageParser } from '../../src/infrastructure/transport/MessageParser';
import { config, DTO, newWorld } from '../helpers/fixtures';

describe('MessageParser', () => {
  const parser = new MessageParser();
  const valid = [
    { type: 'join', commandId: 'cmd-00000001', displayName: 'Asha' },
    { type: 'resume', sessionToken: 'token' },
    { type: 'submitAction', commandId: 'cmd-00000002', expectedTurn: 1, action: DTO.expandFarm },
    { type: 'cancelAction', commandId: 'cmd-00000003', expectedTurn: 1 },
    { type: 'resolveTurn', commandId: 'cmd-00000004', turn: 1 },
    { type: 'startNewScenario', commandId: 'cmd-00000005', endedWorldId: 'world-1' },
  ];

  it.each(valid)('accepts a well-formed $type message', (message) => {
    expect(parser.parse(JSON.stringify(message))).toEqual({ ok: true, message });
  });

  it.each([
    ['not JSON', 'nope', /valid JSON/],
    ['an array', '[]', /objects/],
    ['an unknown type', JSON.stringify({ type: 'setWorld', commandId: 'cmd-00000006' }), /Unknown message/],
    ['an extra resource field', JSON.stringify({ type: 'cancelAction', commandId: 'cmd-00000007', expectedTurn: 1, water: 100 }), /Unexpected field/],
    ['a missing commandId', JSON.stringify({ type: 'cancelAction', expectedTurn: 1 }), /Missing field|commandId/],
    ['a malformed commandId', JSON.stringify({ type: 'cancelAction', commandId: 'x', expectedTurn: 1 }), /commandId/],
    ['a fractional turn', JSON.stringify({ type: 'resolveTurn', commandId: 'cmd-00000008', turn: 1.5 }), /whole number/],
    ['a non-object action', JSON.stringify({ type: 'submitAction', commandId: 'cmd-00000009', expectedTurn: 1, action: 'WAIT' }), /action must be an object/],
    ['an oversized message', JSON.stringify({ type: 'join', commandId: 'cmd-00000010', displayName: 'x'.repeat(5000) }), /limited/],
  ])('rejects %s', (_label, raw, pattern) => {
    const result = parser.parse(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(pattern);
  });

  it('echoes a valid commandId on rejection so the client can match the error to its request', () => {
    const result = parser.parse(JSON.stringify({ type: 'cancelAction', commandId: 'cmd-00000011', expectedTurn: 0 }));
    expect(result).toMatchObject({ ok: false, commandId: 'cmd-00000011' });
  });
});

describe('InMemoryWorldRepository', () => {
  it('hands out fresh instances: unsaved changes never leak into stored state', async () => {
    const repository = new InMemoryWorldRepository(config);
    await repository.insert(newWorld([]), null);
    const loaded = await repository.current();
    loaded?.world.admit('p9', DisplayName.parse('Unsaved'));
    expect((await repository.current())?.world.players()).toHaveLength(0);
  });

  it('enforces optimistic concurrency on update and insert', async () => {
    const repository = new InMemoryWorldRepository(config);
    const first = await repository.insert(newWorld([]), null);
    await repository.update(first.world, first.revision);
    await expect(repository.update(first.world, first.revision)).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(repository.insert(newWorld([], config, 'world-2'), 'some-other-world')).rejects.toBeInstanceOf(ConcurrencyError);
    const replaced = await repository.insert(newWorld([], config, 'world-2'), first.world.id);
    expect(replaced.world.id).toBe('world-2');
    await expect(repository.update(first.world, replaced.revision)).rejects.toBeInstanceOf(ConcurrencyError);
  });
});

describe('InMemorySubmissionRepository', () => {
  it('returns empty sets for unseen turns and keeps only the current world’s submissions', async () => {
    const repository = new InMemorySubmissionRepository(new ActionFactory());
    const empty = await repository.get('w1', 1);
    expect(empty.size).toBe(0);
    empty.submit('p1', new WaitAction());
    await repository.save(empty);
    expect((await repository.get('w1', 1)).hasSubmitted('p1')).toBe(true);
    const other = await repository.get('w2', 1);
    other.submit('p1', new WaitAction());
    await repository.save(other);
    expect((await repository.get('w1', 1)).size).toBe(0);
  });
});

describe('InMemoryIdempotencyStore', () => {
  it('is bounded, evicting the oldest records first', async () => {
    const store = new InMemoryIdempotencyStore(2);
    const record = { fingerprint: 'f', outcome: { ok: true as const, replayed: false, result: { kind: 'cancelled' as const, cancelled: true } } };
    await store.put('a', record);
    await store.put('b', record);
    await store.put('c', record);
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('c')).toEqual(record);
    expect(store.size).toBe(2);
  });
});
