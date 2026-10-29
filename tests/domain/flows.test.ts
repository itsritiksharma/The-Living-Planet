import { describe, expect, it } from 'vitest';
import { ScenarioCalendar } from '../../src/domain/model/ScenarioCalendar';
import type { IndicatorKey, TurnBreakdown } from '../../src/domain/model/types';
import { INDICATOR_KEYS } from '../../src/domain/model/types';
import { FlowCalculator, type FlowInput } from '../../src/domain/services/FlowCalculator';
import { clamp, round1 } from '../../src/domain/shared/numbers';
import { config, DTO, newWorld, resolve, withIndicators } from '../helpers/fixtures';

const calendar = new ScenarioCalendar(config);
const flows = new FlowCalculator(config, calendar);
const baseInput: FlowInput = {
  turn: 1,
  start: { ...config.initialIndicators },
  farms: 3,
  industry: 2,
  efficiencyUpgrades: 0,
  newFarms: 0,
  growingRestorationPlots: 0,
  wetlandBenefits: false,
  wetlandCompletedNow: false,
};
const line = (breakdown: TurnBreakdown, key: IndicatorKey, prefix: string): number | undefined =>
  breakdown.indicators[key].lines.find((l) => l.label.startsWith(prefix))?.amount;

describe('Calendar', () => {
  it('maps turns to seasons and years, and grows household demand yearly', () => {
    expect([1, 2, 3, 4, 5, 16].map((t) => calendar.label(t))).toEqual([
      'Spring, Year 1',
      'Summer, Year 1',
      'Autumn, Year 1',
      'Winter, Year 1',
      'Spring, Year 2',
      'Winter, Year 4',
    ]);
    expect(calendar.householdDemand(1)).toMatchObject({ water: 6, food: 9.5, energy: 7 });
    expect(calendar.householdDemand(5)).toMatchObject({ water: 6.5, food: 10.5, energy: 8 });
    expect(calendar.householdDemand(13)).toMatchObject({ water: 7.5, food: 12.5, energy: 10 });
  });
});

describe('FlowCalculator: documented formulas', () => {
  it('water: recharge = base × season × watershed(ecosystem); use by source; efficiency savings', () => {
    const spring = flows.compute(baseInput).breakdown;
    expect(line(spring, 'water', 'River recharge')).toBeCloseTo(14 * 1.3 * (0.5 + 0.5 * 0.75), 9);
    expect(line(spring, 'water', 'Household use')).toBe(-6);
    expect(line(spring, 'water', 'Farm irrigation')).toBe(-4.5);
    expect(line(spring, 'water', 'Industry cooling')).toBe(-2);
    const summer = flows.compute({ ...baseInput, turn: 2, start: { ...baseInput.start, ecosystemHealth: 40 } }).breakdown;
    expect(line(summer, 'water', 'River recharge')).toBeCloseTo(14 * 0.6 * (0.5 + 0.5 * 0.4), 9);
    const efficient = flows.compute({ ...baseInput, efficiencyUpgrades: 3 }).breakdown;
    expect(line(efficient, 'water', 'Efficiency savings')).toBeCloseTo(12.5 * 0.3, 9);
  });

  it('food: harvest = farms × 3 × yield, with yield set by start-of-turn thresholds', () => {
    const yieldOf = (start: Partial<FlowInput['start']>) =>
      flows.compute({ ...baseInput, start: { ...baseInput.start, ...start } }).breakdown.yieldFactor;
    expect(yieldOf({})).toBe(1);
    expect(yieldOf({ water: 39.9 })).toBe(0.7);
    expect(yieldOf({ water: 14.9 })).toBe(0.3);
    expect(yieldOf({ ecosystemHealth: 39 })).toBe(0.8);
    expect(yieldOf({ pollution: 60 })).toBe(0.85);
    expect(yieldOf({ energy: 20 })).toBe(0.85);
    expect(yieldOf({ water: 30, ecosystemHealth: 30 })).toBeCloseTo(0.56, 9);
    const breakdown = flows.compute({ ...baseInput, start: { ...baseInput.start, water: 30 } }).breakdown;
    expect(line(breakdown, 'food', 'Harvest')).toBeCloseTo(3 * 3 * 0.7, 9);
    expect(line(breakdown, 'food', 'Household food')).toBe(-9.5);
  });

  it('energy: industry output (reduced without cooling water) minus households, machinery and pumps', () => {
    const normal = flows.compute({ ...baseInput, efficiencyUpgrades: 2 }).breakdown;
    expect(line(normal, 'energy', 'Industry output')).toBe(8);
    expect(line(normal, 'energy', 'Household energy')).toBe(-7);
    expect(line(normal, 'energy', 'Farm machinery')).toBe(-1.5);
    expect(line(normal, 'energy', 'Efficiency pumps')).toBeCloseTo(-0.6, 9);
    const dry = flows.compute({ ...baseInput, start: { ...baseInput.start, water: 10 } }).breakdown;
    expect(line(dry, 'energy', 'Industry output')).toBeCloseTo(8 * 0.7, 9);
  });

  it('pollution accumulates from emissions and is removed only by breakdown, absorption and the wetland', () => {
    const breakdown = flows.compute({ ...baseInput, start: { ...baseInput.start, pollution: 50 } }).breakdown;
    const labels = breakdown.indicators.pollution.lines.map((l) => l.label.split(' (')[0]);
    expect(labels).toEqual(['Industry emissions', 'Farm runoff', 'Household waste', 'Natural breakdown', 'Absorption by ecosystems']);
    expect(line(breakdown, 'pollution', 'Industry emissions')).toBeCloseTo(2.4, 9);
    expect(line(breakdown, 'pollution', 'Natural breakdown')).toBeCloseTo(-4, 9);
    expect(line(breakdown, 'pollution', 'Absorption')).toBeCloseTo(-2.25, 9);
    const withWetland = flows.compute({ ...baseInput, wetlandBenefits: true }).breakdown;
    expect(line(withWetland, 'pollution', 'Wetland filtration')).toBe(-3);
    expect(line(withWetland, 'water', 'Wetland storage')).toBe(2);
  });

  it('ecosystem: recovery only while unstressed; pollution damage, over-extraction, land conversion, restoration', () => {
    const healthy = flows.compute(baseInput).breakdown;
    expect(line(healthy, 'ecosystemHealth', 'Natural recovery')).toBeCloseTo(0.04 * 25, 9);
    const stressed = flows.compute({
      ...baseInput,
      start: { ...baseInput.start, water: 30, pollution: 50 },
      newFarms: 2,
      growingRestorationPlots: 3,
    }).breakdown;
    expect(line(stressed, 'ecosystemHealth', 'Natural recovery')).toBeUndefined();
    expect(line(stressed, 'ecosystemHealth', 'Pollution damage')).toBeCloseTo(-1.5, 9);
    expect(line(stressed, 'ecosystemHealth', 'Over-extraction')).toBe(-2);
    expect(line(stressed, 'ecosystemHealth', 'Land conversion')).toBe(-6);
    expect(line(stressed, 'ecosystemHealth', 'Restoration growth')).toBe(6);
    const critical = flows.compute({ ...baseInput, start: { ...baseInput.start, water: 10 } }).breakdown;
    expect(line(critical, 'ecosystemHealth', 'Over-extraction')).toBe(-4);
  });

  it('every indicator ends at clamp(start + sum of its lines), rounded to one decimal', () => {
    const { breakdown } = flows.compute({ ...baseInput, start: { ...baseInput.start, water: 99, food: 1 }, farms: 1 });
    for (const key of INDICATOR_KEYS) {
      const b = breakdown.indicators[key];
      expect(b.raw).toBeCloseTo(b.start + b.lines.reduce((sum, l) => sum + l.amount, 0), 9);
      expect(b.end).toBe(round1(clamp(b.raw)));
    }
    expect(breakdown.indicators.water.end).toBe(100);
    expect(breakdown.indicators.food.end).toBe(0);
  });
});

describe('Regeneration and depletion through a real turn', () => {
  it('world indicators equal the breakdown ends after a turn resolves', () => {
    const world = resolve(newWorld(), { p1: DTO.expandIndustry });
    const breakdown = world.lastBreakdown;
    if (!breakdown) throw new Error('missing breakdown');
    for (const key of INDICATOR_KEYS) expect(world.indicators.get(key)).toBe(breakdown.indicators[key].end);
    expect(line(breakdown, 'energy', 'Industry output')).toBe(12); // the new unit produces this turn
  });

  it('water stress from the start of the turn, not the end, drives this turn’s effects', () => {
    const start = withIndicators(newWorld(), { water: 40.5 });
    const after = resolve(start, {}); // Summer would drop it, but turn 1 is Spring: check effect timing
    expect(after.lastBreakdown?.yieldFactor).toBe(1);
    const stressed = resolve(withIndicators(newWorld(), { water: 39.5 }), {});
    expect(stressed.lastBreakdown?.yieldFactor).toBe(0.7);
  });
});
