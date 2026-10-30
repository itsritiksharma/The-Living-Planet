import { describe, expect, it } from 'vitest';
import { WorldFactory } from '../../src/domain/factories/WorldFactory';
import { DisplayName } from '../../src/domain/model/DisplayName';
import { INDICATOR_KEYS } from '../../src/domain/model/types';
import { World } from '../../src/domain/entities/World';
import { actionFactory, config, configWith, DTO, newWorld } from '../helpers/fixtures';

describe('World aggregate: initial state', () => {
  it('starts valid, within bounds and exactly as documented in the single config file', () => {
    const world = new WorldFactory(config).createNew('w1');
    expect(world.checkInvariants()).toEqual([]);
    expect(world.indicators.toJSON()).toEqual(config.initialIndicators);
    for (const key of INDICATOR_KEYS) {
      expect(world.indicators.get(key)).toBeGreaterThanOrEqual(0);
      expect(world.indicators.get(key)).toBeLessThanOrEqual(100);
    }
    expect(world.turn).toBe(1);
    expect(world.countOf('farm')).toBe(config.initialStructures.farm);
    expect(world.countOf('industry')).toBe(config.initialStructures.industry);
    expect(world.project.status).toBe('open');
    expect(world.historyPoints()).toEqual([{ turn: 0, indicators: config.initialIndicators }]);
  });

  it('starts healthy: nothing is stressed before anyone acts', () => {
    const v = config.initialIndicators;
    const t = config.thresholds;
    expect(v.water).toBeGreaterThanOrEqual(t.water.stress);
    expect(v.food).toBeGreaterThanOrEqual(t.food.stress);
    expect(v.energy).toBeGreaterThanOrEqual(t.energy.stress);
    expect(v.ecosystemHealth).toBeGreaterThanOrEqual(t.ecosystemHealth.stress);
    expect(v.pollution).toBeLessThanOrEqual(t.pollution.damage);
  });

  it('has a map layout whose plot counts match the configured capacity', () => {
    const count = (char: string) => config.map.layout.join('').split(char).length - 1;
    expect(count('M')).toBe(config.capacity.farmPlots);
    expect(count('L')).toBe(config.capacity.industryLots);
    expect(count('s')).toBe(config.capacity.restorationSites);
    expect(count('a')).toBe(config.initialStructures.farm);
    expect(count('I')).toBe(config.initialStructures.industry);
    expect(new Set(config.map.layout.map((row) => row.length)).size).toBe(1);
  });
});

describe('World aggregate: behaviours', () => {
  it('admits players idempotently by id', () => {
    const world = new WorldFactory(config).createNew('w1');
    expect(world.admit('p1', DisplayName.parse('Asha'))).toBe('admitted');
    expect(world.admit('p1', DisplayName.parse('Asha'))).toBe('already_present');
    expect(world.players()).toHaveLength(1);
    expect(world.history().filter((e) => e.kind === 'player_joined')).toHaveLength(1);
    expect(() => world.admit('p1', DisplayName.parse('Someone else'))).toThrow(/already in use/);
  });

  it('keeps names distinguishable and enforces the player limit', () => {
    const world = new WorldFactory(configWith({ scenario: { maxPlayers: 2 } })).createNew('w1');
    world.admit('p1', DisplayName.parse('Asha'));
    expect(() => world.admit('p2', DisplayName.parse('asha'))).toThrow(/already taken/);
    world.admit('p2', DisplayName.parse('Ben'));
    expect(() => world.admit('p3', DisplayName.parse('Chen'))).toThrow(/full/);
  });

  it('allocates the lowest free slot and refuses to build beyond finite land', () => {
    const world = newWorld();
    for (let i = 0; i < config.capacity.industryLots; i += 1) expect(world.build('industry', 'p1', 1).slot).toBe(i);
    expect(world.freeSlot('industry')).toBeNull();
    expect(() => world.build('industry', 'p1', 1)).toThrow(/No free/);
    expect(world.validate('p1', actionFactory.fromDTO(DTO.expandIndustry))).toMatchObject({ ok: false, code: 'NO_FREE_PLOT' });
  });

  it('rotates conflict priority one place per turn, by join order', () => {
    const world = newWorld(['Asha', 'Ben', 'Chen']);
    const order = (turn: number) => world.priorityOrder(turn).map((p) => p.displayName);
    expect(order(1)).toEqual(['Asha', 'Ben', 'Chen']);
    expect(order(2)).toEqual(['Ben', 'Chen', 'Asha']);
    expect(order(4)).toEqual(['Asha', 'Ben', 'Chen']);
  });

  it('round-trips through snapshots and clones independently', () => {
    const world = newWorld(['Asha']);
    const copy = World.fromSnapshot(world.toSnapshot(), config);
    expect(copy.toSnapshot()).toEqual(world.toSnapshot());
    const clone = world.clone();
    clone.build('farm', 'p1', 1);
    expect(world.countOf('farm')).toBe(config.initialStructures.farm);
  });

  it('refuses a snapshot made with a different configuration version', () => {
    const snapshot = newWorld().toSnapshot();
    expect(() => World.fromSnapshot({ ...snapshot, configVersion: 'other' }, config)).toThrow(/config/);
  });

  it('validates each action type against the start-of-turn state without mutating it', () => {
    const world = newWorld();
    const before = world.toSnapshot();
    expect(world.validate('p1', actionFactory.fromDTO(DTO.contribute(25)))).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(world.validate('p1', actionFactory.fromDTO(DTO.contribute(11)))).toMatchObject({ ok: false, code: 'INSUFFICIENT_CREDITS' });
    expect(world.validate('p1', actionFactory.fromDTO({ type: 'CONTRIBUTE_TO_PROJECT', projectId: 'dam', amount: 1 }))).toMatchObject({
      ok: false,
      code: 'UNKNOWN_PROJECT',
    });
    expect(world.validate('ghost', actionFactory.fromDTO(DTO.wait))).toMatchObject({ ok: false, code: 'UNKNOWN_PLAYER' });
    for (const dto of [DTO.expandFarm, DTO.expandIndustry, DTO.conserve, DTO.restore, DTO.inspect, DTO.wait, DTO.contribute(5)]) {
      expect(world.validate('p1', actionFactory.fromDTO(dto)).ok).toBe(true);
    }
    expect(world.toSnapshot()).toEqual(before);
  });
});
