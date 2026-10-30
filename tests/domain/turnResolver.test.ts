import { describe, expect, it } from 'vitest';
import { TurnSubmissions } from '../../src/domain/entities/TurnSubmissions';
import type { PlayerActionDTO } from '../../src/domain/model/types';
import { World } from '../../src/domain/entities/World';
import { TurnResolver } from '../../src/domain/services/TurnResolver';
import { DomainError } from '../../src/domain/shared/DomainError';
import { actionFactory, config, DTO, newWorld, resolve, submissionsFor } from '../helpers/fixtures';

const resolver = new TurnResolver(config);

describe('TurnResolver: determinism and purity', () => {
  const script: Record<string, PlayerActionDTO>[] = [
    { p1: DTO.expandIndustry, p2: DTO.restore, p3: DTO.contribute(5) },
    { p1: DTO.expandFarm, p2: DTO.conserve, p3: DTO.inspect },
    { p1: DTO.contribute(6), p2: DTO.contribute(6), p3: DTO.contribute(6) },
    { p1: DTO.wait, p2: DTO.restore },
  ];
  const play = (world: World) => script.reduce((current, actions) => resolve(current, actions), world);

  it('produces identical results from the same state, actions and config', () => {
    const start = newWorld(['Asha', 'Ben', 'Chen']);
    expect(play(start.clone()).toSnapshot()).toEqual(play(start.clone()).toSnapshot());
  });

  it('does not depend on the order in which submissions arrived', () => {
    const start = newWorld(['Asha', 'Ben', 'Chen']);
    const forward = resolve(start, { p1: DTO.expandIndustry, p2: DTO.expandIndustry, p3: DTO.contribute(8) });
    const reversedSubmissions = TurnSubmissions.of(start.id, 1, [
      ['p3', actionFactory.fromDTO(DTO.contribute(8))],
      ['p2', actionFactory.fromDTO(DTO.expandIndustry)],
      ['p1', actionFactory.fromDTO(DTO.expandIndustry)],
    ]);
    const reversed = resolver.resolve(start, 1, reversedSubmissions);
    expect(reversed.status).toBe('resolved');
    if (reversed.status === 'resolved') expect(reversed.world.toSnapshot()).toEqual(forward.toSnapshot());
  });

  it('never mutates the world it is given', () => {
    const start = newWorld(['Asha', 'Ben']);
    const before = start.toSnapshot();
    resolve(start, { p1: DTO.expandFarm, p2: DTO.contribute(10) });
    expect(start.toSnapshot()).toEqual(before);
  });

  it('is idempotent by turn number: resolving an already-resolved turn changes nothing', () => {
    const start = newWorld(['Asha']);
    const once = resolver.resolve(start, 1, submissionsFor(start, { p1: DTO.expandIndustry }));
    expect(once.status).toBe('resolved');
    if (once.status !== 'resolved') return;
    const again = resolver.resolve(once.world, 1, submissionsFor(start, { p1: DTO.expandIndustry }));
    expect(again.status).toBe('already_resolved');
    expect(again.world).toBe(once.world);
    expect(once.world.turn).toBe(2);
    expect(once.world.player('p1')?.credits).toBe(8);
  });

  it('rejects an invalid submission without partially changing anything', () => {
    const start = newWorld(['Asha', 'Ben']);
    const before = start.toSnapshot();
    const submissions = submissionsFor(start, { p1: DTO.expandFarm, p2: DTO.contribute(50) });
    expect(() => resolver.resolve(start, 1, submissions)).toThrow(DomainError);
    expect(start.toSnapshot()).toEqual(before);
  });

  it('refuses turns that are not open and submissions for another world', () => {
    const start = newWorld();
    expect(() => resolver.resolve(start, 3, TurnSubmissions.empty(start.id, 3))).toThrow(/not open/);
    expect(() => resolver.resolve(start, 1, TurnSubmissions.empty('other-world', 1))).toThrow(/different world/);
  });
});

describe('TurnResolver: action costs are applied exactly once', () => {
  // Turn 1 starts with nothing stressed, so no hardship: credits = 10 − cost + income.
  const cases: [string, PlayerActionDTO, number][] = [
    ['expand industry (6; unit pays 2)', DTO.expandIndustry, 10 - 6 + 2 + 2],
    ['expand farmland (5; farm pays 1)', DTO.expandFarm, 10 - 5 + 2 + 1],
    ['conserve water (4)', DTO.conserve, 10 - 4 + 2],
    ['restore watershed (3)', DTO.restore, 10 - 3 + 2],
    ['research (free)', DTO.inspect, 10 + 2],
    ['contribute 7', DTO.contribute(7), 10 - 7 + 2],
    ['wait (free)', DTO.wait, 10 + 2],
  ];
  it.each(cases)('%s', (_label, dto, expected) => {
    const world = resolve(newWorld(), { p1: dto });
    const player = world.player('p1');
    if (!player) throw new Error('missing player');
    expect(player.credits).toBe(expected);
    const cost = actionFactory.fromDTO(dto).cost(config);
    expect(player.totals.spentOnActions + player.totals.contributed).toBe(cost);
  });

  it('players who do not choose are recorded as waiting', () => {
    const world = resolve(newWorld(['Asha', 'Ben']), { p1: DTO.expandFarm });
    const ben = world.decisions().find((d) => d.playerId === 'p2');
    expect(ben).toMatchObject({ chosen: false, applied: true, action: { type: 'WAIT' } });
    expect(world.history().some((e) => e.summary === 'Ben made no choice this turn and waited.')).toBe(true);
  });
});

describe('TurnResolver: simultaneous conflicts', () => {
  it('gives the last plot to the higher-priority player and does not charge the other', () => {
    const base = newWorld(['Asha', 'Ben']);
    for (let i = 0; i < config.capacity.industryLots - 1; i += 1) base.build('industry', 'p1', 1);
    const world = resolve(base, { p1: DTO.expandIndustry, p2: DTO.expandIndustry });
    expect(world.freeSlot('industry')).toBeNull();
    expect(world.player('p1')?.totals.spentOnActions).toBe(config.industry.cost);
    expect(world.player('p2')?.totals.spentOnActions).toBe(0);
    const blocked = world.history().find((e) => e.kind === 'action_blocked');
    expect(blocked?.actorId).toBe('p2');
    expect(blocked?.summary).toMatch(/No credits were charged/);
    expect(world.decisions().find((d) => d.playerId === 'p2')?.applied).toBe(false);
  });

  it('rotates that priority on the next turn', () => {
    const base = newWorld(['Asha', 'Ben']);
    for (let i = 0; i < config.capacity.industryLots - 1; i += 1) base.build('industry', 'p1', 1);
    const turnTwo = resolve(base, {});
    const world = resolve(turnTwo, { p1: DTO.expandIndustry, p2: DTO.expandIndustry });
    expect(world.player('p2')?.totals.spentOnActions).toBe(config.industry.cost);
    expect(world.player('p1')?.totals.spentOnActions).toBe(0);
  });
});
