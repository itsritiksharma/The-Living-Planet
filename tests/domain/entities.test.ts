import { describe, expect, it } from 'vitest';
import { ConserveWaterAction, ExpandProductionAction, WaitAction } from '../../src/domain/actions/actions';
import { CommunityProject } from '../../src/domain/model/CommunityProject';
import { DisplayName } from '../../src/domain/model/DisplayName';
import { IndicatorSet } from '../../src/domain/model/IndicatorSet';
import { Player } from '../../src/domain/model/Player';
import { Structure } from '../../src/domain/model/Structure';
import { TurnSubmissions } from '../../src/domain/model/TurnSubmissions';
import { DomainError } from '../../src/domain/shared/DomainError';
import { actionFactory, DTO } from '../helpers/fixtures';

describe('IndicatorSet (value object)', () => {
  it('rejects values outside 0–100 or non-finite numbers', () => {
    const valid = { water: 70, food: 60, energy: 60, ecosystemHealth: 75, pollution: 15 };
    expect(() => IndicatorSet.of({ ...valid, water: 101 })).toThrow(DomainError);
    expect(() => IndicatorSet.of({ ...valid, food: -0.1 })).toThrow(DomainError);
    expect(() => IndicatorSet.of({ ...valid, energy: Number.NaN })).toThrow(DomainError);
    expect(IndicatorSet.of(valid).toJSON()).toEqual(valid);
  });

  it('settles raw values by clamping to bounds and rounding to one decimal', () => {
    const settled = IndicatorSet.settle({ water: 104.26, food: -3, energy: 33.333, ecosystemHealth: 50.06, pollution: 0.04 });
    expect(settled.toJSON()).toEqual({ water: 100, food: 0, energy: 33.3, ecosystemHealth: 50.1, pollution: 0 });
  });

  it('is immutable', () => {
    const set = IndicatorSet.of({ water: 70, food: 60, energy: 60, ecosystemHealth: 75, pollution: 15 });
    const json = set.toJSON();
    json.water = 0;
    expect(set.get('water')).toBe(70);
  });
});

describe('DisplayName (value object)', () => {
  it('normalizes whitespace and enforces length and character rules', () => {
    expect(DisplayName.parse('  Asha   K  ').value).toBe('Asha K');
    expect(() => DisplayName.parse('')).toThrow(/display name/);
    expect(() => DisplayName.parse('x'.repeat(21))).toThrow(/at most 20/);
    expect(() => DisplayName.parse('bad\u0000name')).toThrow(/control/);
    expect(() => DisplayName.parse(42)).toThrow(DomainError);
  });
});

describe('Player (entity)', () => {
  const make = (credits = 10) =>
    Player.fromSnapshot({
      id: 'p1',
      displayName: 'Asha',
      joinOrder: 1,
      joinedTurn: 1,
      credits,
      totals: { incomeEarned: 0, hardshipPaid: 0, spentOnActions: 0, contributed: 0 },
      report: null,
    });

  it('charges action costs and contributions exactly as requested and tracks totals', () => {
    const player = make(10);
    player.payForAction(6);
    player.contribute(3);
    player.earn(2);
    expect(player.credits).toBe(3);
    expect(player.totals).toEqual({ incomeEarned: 2, hardshipPaid: 0, spentOnActions: 6, contributed: 3 });
  });

  it('never goes below zero credits', () => {
    const player = make(1);
    expect(() => player.payForAction(2)).toThrow(/cannot pay/);
    expect(player.payHardship(3)).toBe(1);
    expect(player.credits).toBe(0);
  });

  it('rejects fractional or negative amounts', () => {
    expect(() => make().earn(1.5)).toThrow(DomainError);
    expect(() => make().payForAction(-1)).toThrow(DomainError);
  });
});

describe('Structure (entity)', () => {
  it('grows on the turns after planting and reports its stage', () => {
    const plot = Structure.build({ id: 's1', kind: 'restoration', ownerId: 'p1', builtTurn: 3, slot: 0 });
    expect([3, 4, 5, 6, 7, 8].map((turn) => plot.isGrowingOn(turn, 4))).toEqual([false, true, true, true, true, false]);
    expect(plot.growthStage(4, 4)).toBe(0);
    expect(plot.growthStage(6, 4)).toBe(2);
    expect(plot.growthStage(20, 4)).toBe(4);
  });
});

describe('CommunityProject (entity)', () => {
  it('accepts offers in full while they fit', () => {
    const project = CommunityProject.open({ id: 'wetland', name: 'Wetland', target: 24 });
    const allocations = project.acceptOffers([
      { playerId: 'a', amount: 10 },
      { playerId: 'b', amount: 5 },
    ]);
    expect(allocations.map((a) => a.accepted)).toEqual([10, 5]);
    expect(project.funded).toBe(15);
    expect(project.contributions()).toEqual({ a: 10, b: 5 });
  });

  it('scales simultaneous over-subscription proportionally, never exceeding the target', () => {
    const project = CommunityProject.open({ id: 'wetland', name: 'Wetland', target: 24 });
    project.acceptOffers([{ playerId: 'x', amount: 19 }]);
    // 5 remain; offers of 6 and 4 (total 10) → 3 and 2.
    const allocations = project.acceptOffers([
      { playerId: 'a', amount: 6 },
      { playerId: 'b', amount: 4 },
    ]);
    expect(allocations).toEqual([
      { playerId: 'a', offered: 6, accepted: 3 },
      { playerId: 'b', offered: 4, accepted: 2 },
    ]);
    expect(project.funded).toBe(24);
  });

  it('breaks rounding ties by priority order (largest remainder), independent of arrival', () => {
    const project = CommunityProject.open({ id: 'wetland', name: 'Wetland', target: 3 });
    project.acceptOffers([{ playerId: 'x', amount: 2 }]);
    const allocations = project.acceptOffers([
      { playerId: 'a', amount: 1 },
      { playerId: 'b', amount: 1 },
    ]);
    expect(allocations.map((a) => a.accepted)).toEqual([1, 0]);
    expect(project.funded).toBe(3);
  });

  it('starts construction and completes exactly once (idempotent transitions)', () => {
    const project = CommunityProject.open({ id: 'wetland', name: 'Wetland', target: 10 });
    project.acceptOffers([{ playerId: 'a', amount: 10 }]);
    expect(project.startConstructionIfFunded(4, 2)).toBe(true);
    expect(project.startConstructionIfFunded(5, 2)).toBe(false);
    expect(project.completesTurn).toBe(6);
    expect(project.completeIfDue(5)).toBe(false);
    expect(project.completeIfDue(6)).toBe(true);
    expect(project.completeIfDue(7)).toBe(false);
    expect([6, 7].map((turn) => project.providesBenefitsOn(turn))).toEqual([false, true]);
  });
});

describe('TurnSubmissions (entity)', () => {
  it('treats an identical re-submission as unchanged and a different one as a replacement', () => {
    const submissions = TurnSubmissions.empty('w', 1);
    expect(submissions.submit('p1', new ExpandProductionAction('farm'))).toBe('recorded');
    expect(submissions.submit('p1', new ExpandProductionAction('farm'))).toBe('unchanged');
    expect(submissions.submit('p1', new ConserveWaterAction())).toBe('replaced');
    expect(submissions.size).toBe(1);
  });

  it('cancels idempotently', () => {
    const submissions = TurnSubmissions.empty('w', 1);
    submissions.submit('p1', new WaitAction());
    expect(submissions.cancel('p1')).toBe(true);
    expect(submissions.cancel('p1')).toBe(false);
  });

  it('requires at least one listed player before everyone counts as ready', () => {
    const submissions = TurnSubmissions.empty('w', 1);
    expect(submissions.allSubmitted([])).toBe(false);
    submissions.submit('p1', new WaitAction());
    expect(submissions.allSubmitted(['p1'])).toBe(true);
    expect(submissions.allSubmitted(['p1', 'p2'])).toBe(false);
  });

  it('round-trips through its snapshot', () => {
    const submissions = TurnSubmissions.empty('w', 2);
    submissions.submit('p1', actionFactory.fromDTO(DTO.contribute(4)));
    const copy = TurnSubmissions.fromSnapshot(submissions.toSnapshot(), actionFactory);
    expect(copy.toSnapshot()).toEqual(submissions.toSnapshot());
  });
});

describe('ActionFactory', () => {
  it('builds every action type from its serialized form', () => {
    for (const dto of [DTO.expandFarm, DTO.expandIndustry, DTO.conserve, DTO.restore, DTO.inspect, DTO.wait, DTO.contribute(3)]) {
      expect(actionFactory.fromDTO(dto).toDTO()).toEqual(dto);
    }
  });

  it('rejects unknown types, malformed fields and any extra field such as a resource value', () => {
    expect(() => actionFactory.fromDTO({ type: 'DELETE_RIVER' })).toThrow(/Unknown action/);
    expect(() => actionFactory.fromDTO({ type: 'EXPAND_PRODUCTION', target: 'mine' })).toThrow(/target/);
    expect(() => actionFactory.fromDTO({ type: 'WAIT', water: 100 })).toThrow(/Unexpected field/);
    expect(() => actionFactory.fromDTO({ type: 'CONTRIBUTE_TO_PROJECT', projectId: 'wetland', amount: 2.5 })).toThrow(/whole number/);
    expect(() => actionFactory.fromDTO('WAIT')).toThrow(/object/);
    expect(() => actionFactory.fromDTO([])).toThrow(/object/);
  });
});
