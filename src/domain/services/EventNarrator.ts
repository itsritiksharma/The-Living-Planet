import type { ActionApplication, GameAction } from '../actions/GameAction';
import type { SimulationConfig } from '../config/riverValley';
import type { ContributionAllocation } from '../model/CommunityProject';
import { INDICATOR_LABELS, joinWords, lowerLabel, OUTCOME_TITLES, plural } from '../model/labels';
import type { Player } from '../model/Player';
import type { ScenarioCalendar } from '../model/ScenarioCalendar';
import type { Structure } from '../model/Structure';
import type { World } from '../model/World';
import type {
  DepletableKey,
  EventDraft,
  IndicatorKey,
  Indicators,
  PlayerId,
  ScenarioOutcome,
  TurnBreakdown,
} from '../model/types';
import { DEPLETABLE_KEYS, ESSENTIAL_KEYS, INDICATOR_KEYS } from '../model/types';
import { fixed1, percent, signed1 } from '../shared/numbers';
import type { HardshipDue } from './EconomyPolicy';

export interface AppliedAction {
  player: Player;
  action: GameAction;
  /** False when the player made no choice and waited implicitly. */
  chosen: boolean;
  application: ActionApplication;
  allocation?: ContributionAllocation;
}

type DepletionBand = 0 | 1 | 2; // ok, stressed, critical
type PollutionBand = 0 | 1 | 2; // low, damaging, severe

/**
 * Writes the world history. Every message is computed from the actual transition (breakdown,
 * start/end values, structures, allocations), so the log explains causes rather than decorating.
 */
export class EventNarrator {
  constructor(
    private readonly config: SimulationConfig,
    private readonly calendar: ScenarioCalendar,
  ) {}

  action(turn: number, entry: AppliedAction, world: World): EventDraft {
    const { config } = this;
    const name = entry.player.displayName;
    const actorId = entry.player.id;
    const base = { turn, actorId, causes: [] as string[] };
    const application = entry.application;

    if (!application.applied) {
      return {
        ...base,
        kind: 'action_blocked',
        importance: 'minor',
        summary: `${name} could not ${entry.action.describe().toLowerCase()}: ${application.reason}`,
      };
    }
    const action = entry.action.toDTO();
    const slot = application.structure ? application.structure.slot + 1 : 0;
    switch (action.type) {
      case 'EXPAND_PRODUCTION':
        if (action.target === 'farm') {
          return {
            ...base,
            kind: 'action',
            importance: 'minor',
            summary:
              `${name} expanded farmland on meadow plot ${slot} (−${application.cost} credits): up to ${config.farm.food} more food per turn from now. ` +
              `Delayed cost: the farm adds ${config.farm.water} water demand, ${config.farm.energy} energy demand and ${config.farm.pollution} pollution every turn. ` +
              `Clearing the meadow cost ${Math.abs(config.farm.landConversionEcosystem)} ecosystem health.`,
            causes: [`${name} earns ${plural(config.farm.ownerIncome, 'credit')} per turn from this farm.`],
          };
        }
        return {
          ...base,
          kind: 'action',
          importance: 'minor',
          summary:
            `${name} expanded industry on lot ${slot} (−${application.cost} credits): ${config.industry.energy} more energy per turn from now. ` +
            `Delayed cost: the unit adds ${config.industry.water} water demand and ${config.industry.pollution} pollution every turn.`,
          causes: [`${name} earns ${plural(config.industry.ownerIncome, 'credit')} per turn from this unit.`],
        };
      case 'CONSERVE_WATER': {
        const installed = world.countOf('efficiency');
        return {
          ...base,
          kind: 'action',
          importance: 'minor',
          summary:
            `${name} installed water-efficiency upgrade ${slot} of ${config.capacity.efficiencyUpgrades} (−${application.cost} credits). ` +
            `Total water use is now ${percent(installed * config.efficiency.waterUseReduction)} lower; each upgrade's pumps use ${config.efficiency.energyUse} energy per turn.`,
        };
      }
      case 'RESTORE_WATERSHED': {
        const { growthTurns, ecosystemPerTurn } = config.restoration;
        return {
          ...base,
          kind: 'action',
          importance: 'minor',
          summary:
            `${name} planted restoration site ${slot} (−${application.cost} credits). No immediate change: ` +
            `ecosystem health +${ecosystemPerTurn} per turn on turns ${turn + 1}–${turn + growthTurns}.`,
        };
      }
      case 'INSPECT_SYSTEM':
        return {
          ...base,
          kind: 'action',
          importance: 'minor',
          summary: `${name} studied how the valley's systems interact (private system report).`,
        };
      case 'CONTRIBUTE_TO_PROJECT': {
        const project = world.project;
        const allocation = entry.allocation ?? { playerId: actorId, offered: action.amount, accepted: action.amount };
        let summary: string;
        if (allocation.accepted === allocation.offered) {
          summary = `${name} contributed ${allocation.accepted} credits to the ${project.name} (${project.funded}/${project.target}).`;
        } else if (allocation.accepted > 0) {
          summary =
            `${name} offered ${allocation.offered} credits to the ${project.name}; ${allocation.accepted} were accepted because ` +
            `simultaneous offers exceeded what was still needed. The other ${allocation.offered - allocation.accepted} stayed with ${name}.`;
        } else {
          summary = `${name} offered ${allocation.offered} credits, but other offers already covered what the ${project.name} still needed; nothing was charged.`;
        }
        return { ...base, kind: 'action', importance: 'minor', summary };
      }
      case 'WAIT':
        return {
          ...base,
          kind: 'action',
          importance: 'minor',
          summary: entry.chosen ? `${name} took no action.` : `${name} made no choice this turn and waited.`,
        };
    }
  }

  projectFunded(turn: number, world: World): EventDraft {
    const project = world.project;
    const contributions = project.contributions();
    const contributors = world
      .players()
      .filter((p) => (contributions[p.id] ?? 0) > 0)
      .map((p) => `${p.displayName} ${contributions[p.id]}`);
    const others = world
      .players()
      .filter((p) => !((contributions[p.id] ?? 0) > 0))
      .map((p) => p.displayName);
    return {
      turn,
      kind: 'project',
      importance: 'major',
      summary: `The ${project.name} reached its funding target (${project.funded}/${project.target}). Construction has begun and finishes at the end of turn ${project.completesTurn}.`,
      causes: [
        `Contributors: ${joinWords(contributors)}.`,
        others.length > 0
          ? `Did not contribute: ${joinWords(others)}. Everyone will share the benefits either way.`
          : 'Every player contributed.',
      ],
    };
  }

  projectCompleted(turn: number, world: World): EventDraft {
    const project = world.project;
    const p = this.config.project;
    return {
      turn,
      kind: 'project',
      importance: 'major',
      summary:
        `The ${project.name} is complete: ecosystem health +${p.completionEcosystem} now, and from next turn it adds ` +
        `${p.rechargeBonus} water recharge and removes ${p.pollutionFiltration} pollution every turn, for everyone.`,
      causes: [`Funded on turn ${project.fundedTurn}; construction took ${plural(p.constructionTurns, 'turn')}.`],
      deltas: { ecosystemHealth: p.completionEcosystem },
    };
  }

  /** Delayed effect: restoration plots planted on earlier turns growing this turn. */
  restoration(turn: number, world: World): EventDraft | null {
    const { growthTurns, ecosystemPerTurn } = this.config.restoration;
    const growing = world.structuresOf('restoration').filter((s) => s.isGrowingOn(turn, growthTurns));
    if (growing.length === 0) return null;
    return {
      turn,
      kind: 'delayed_effect',
      importance: 'minor',
      summary: `Delayed effect: ${plural(growing.length, 'restoration plot')} added ${fixed1(growing.length * ecosystemPerTurn)} ecosystem health this turn.`,
      causes: growing.map((plot) => {
        const step = turn - plot.builtTurn;
        const mature = step === growthTurns ? '; now mature, so its growth bonus ends' : '';
        return `${this.owner(world, plot.ownerId)}'s plot at site ${plot.slot + 1} (planted turn ${plot.builtTurn}): growth ${step}/${growthTurns}${mature}.`;
      }),
    };
  }

  newYear(turn: number): EventDraft | null {
    if (!this.calendar.isNewYear(turn)) return null;
    const demand = this.calendar.householdDemand(turn);
    const growth = this.config.households.yearlyGrowth;
    return {
      turn,
      kind: 'settlement_growth',
      importance: 'minor',
      summary: `Year ${this.calendar.year(turn)} began: the settlement grew, so households now need ${fixed1(demand.water)} water, ${fixed1(demand.food)} food and ${fixed1(demand.energy)} energy per turn.`,
      causes: [`Demand grows each year by ${growth.water} water, ${growth.food} food and ${growth.energy} energy (a scenario assumption).`],
    };
  }

  /** Threshold effects that applied this turn because of start-of-turn conditions. */
  conditions(turn: number, start: Indicators, breakdown: TurnBreakdown, hardship: HardshipDue): EventDraft | null {
    const { config } = this;
    const t = config.thresholds;
    const y = config.yield;
    const causes: string[] = [];
    let loopActive = false;

    if (start.water < t.water.critical) {
      loopActive = true;
      causes.push(
        `Water began the turn critical (${fixed1(start.water)}, below ${t.water.critical}): crops yielded at most ${percent(y.waterCritical)}, ` +
          `over-extraction cost ${config.ecosystem.overExtractionCritical} ecosystem health, and industry ran at ${percent(config.industry.waterCriticalEnergyFactor)} and paid owners ${percent(config.industry.waterCriticalIncomeFactor)}.`,
      );
    } else if (start.water < t.water.stress) {
      loopActive = true;
      causes.push(
        `Water began the turn below ${t.water.stress} (${fixed1(start.water)}): crops yielded at most ${percent(y.waterStress)}, and emergency pumping ` +
          `cost ${config.ecosystem.overExtractionStress} ecosystem health. A weaker watershed recharges less, which can keep water low.`,
      );
    }
    if (start.ecosystemHealth < t.ecosystemHealth.stress) {
      causes.push(
        `Ecosystem health began the turn below ${t.ecosystemHealth.stress} (${fixed1(start.ecosystemHealth)}): fewer pollinators and poorer soil cut crop yields to ${percent(y.ecosystemStress)}.`,
      );
    }
    if (start.pollution > t.pollution.damage) {
      const damage = config.ecosystem.pollutionDamagePerPoint * (start.pollution - t.pollution.damage);
      causes.push(`Pollution began the turn above ${t.pollution.damage} (${fixed1(start.pollution)}): it damaged ecosystem health by ${fixed1(damage)}.`);
    }
    if (start.pollution >= t.pollution.severe) {
      causes.push(`Pollution was severe (at least ${t.pollution.severe}): crop yields fell to ${percent(y.pollutionSevere)}.`);
    }
    if (start.energy < t.energy.stress) {
      causes.push(
        `Energy began the turn below ${t.energy.stress} (${fixed1(start.energy)}): under-powered pumps and machinery cut crop yields to ${percent(y.energyStress)}.`,
      );
    }
    if (hardship.amount > 0) {
      causes.push(
        `Shortages of ${joinWords(hardship.essentials.map(lowerLabel))} raised living costs: each player paid up to ${plural(hardship.amount, 'credit')}.`,
      );
    }
    if (causes.length === 0) return null;

    const yieldNote = breakdown.yieldFactor < 1 ? ` Crops yielded ${percent(breakdown.yieldFactor)} of full output.` : '';
    return {
      turn,
      kind: 'condition',
      importance: loopActive ? 'major' : 'minor',
      summary: loopActive
        ? `Water stress shaped this turn: over-extraction damaged the watershed.${yieldNote}`
        : `Stress conditions shaped this turn.${yieldNote}`,
      causes,
    };
  }

  turnSummary(turn: number, breakdown: TurnBreakdown, deltas: Indicators): EventDraft {
    return {
      turn,
      kind: 'turn_summary',
      importance: 'minor',
      summary:
        `Turn ${turn} (${this.calendar.label(turn)}): water ${signed1(deltas.water)}, food ${signed1(deltas.food)}, ` +
        `energy ${signed1(deltas.energy)}, ecosystem ${signed1(deltas.ecosystemHealth)}, pollution ${signed1(deltas.pollution)}.`,
      causes: INDICATOR_KEYS.map((key) => {
        const b = breakdown.indicators[key];
        const parts = b.lines.map((line) => `${line.label} ${signed1(line.amount)}`);
        return `${INDICATOR_LABELS[key]} ${fixed1(b.start)} → ${fixed1(b.end)}: ${parts.length > 0 ? parts.join('; ') : 'no change'}.`;
      }),
      deltas,
    };
  }

  thresholdCrossings(turn: number, start: Indicators, end: Indicators, breakdown: TurnBreakdown, world: World): EventDraft[] {
    const t = this.config.thresholds;
    const events: EventDraft[] = [];

    for (const key of DEPLETABLE_KEYS) {
      const before = this.depletionBand(key, start[key]);
      const after = this.depletionBand(key, end[key]);
      if (before === after) continue;
      const label = INDICATOR_LABELS[key];
      const drivers = this.drivers(key, breakdown);
      let summary: string;
      const causes: string[] = [];
      if (after > before) {
        summary =
          after === 2
            ? `${label} fell below its critical level (${t[key].critical}): now ${fixed1(end[key])}.`
            : `${label} fell below its stress threshold (${t[key].stress}): now ${fixed1(end[key])}.`;
        causes.push(this.consequence(key, after));
      } else {
        summary =
          after === 0
            ? `${label} recovered above its stress threshold (${t[key].stress}): now ${fixed1(end[key])}. Its stress effects stop from next turn.`
            : `${label} recovered above its critical level (${t[key].critical}) but is still stressed: now ${fixed1(end[key])}.`;
      }
      if (drivers) causes.push(drivers);
      events.push({ turn, kind: 'threshold', importance: 'major', summary, causes });
    }

    const before = this.pollutionBand(start.pollution);
    const after = this.pollutionBand(end.pollution);
    if (before !== after) {
      const causes = after > before ? this.pollutionSources(world, turn) : [];
      const drivers = this.drivers('pollution', breakdown);
      if (drivers) causes.push(drivers);
      let summary: string;
      if (after > before) {
        summary =
          after === 2
            ? `Pollution reached the severe level (${t.pollution.severe}): now ${fixed1(end.pollution)}. From next turn crop yields fall to ${percent(this.config.yield.pollutionSevere)}.`
            : `Pollution passed the damage threshold (${t.pollution.damage}): now ${fixed1(end.pollution)}. From next turn it damages ecosystem health by ${this.config.ecosystem.pollutionDamagePerPoint} for every point above ${t.pollution.damage}.`;
      } else {
        summary =
          after === 0
            ? `Pollution fell back to ${t.pollution.damage} or below: now ${fixed1(end.pollution)}. Pollution damage to the ecosystem stops from next turn.`
            : `Pollution fell below the severe level (${t.pollution.severe}) but still damages the ecosystem: now ${fixed1(end.pollution)}.`;
      }
      events.push({ turn, kind: 'threshold', importance: 'major', summary, causes });
    }
    return events;
  }

  /** Clamping is reported, not hidden: unmet demand and overflow are real consequences. */
  shortfalls(turn: number, breakdown: TurnBreakdown): EventDraft[] {
    const events: EventDraft[] = [];
    for (const key of ESSENTIAL_KEYS) {
      const b = breakdown.indicators[key];
      if (b.raw < 0) {
        events.push({
          turn,
          kind: 'shortfall',
          importance: 'major',
          summary: `${INDICATOR_LABELS[key]} ran out: ${fixed1(-b.raw)} units of demand went unmet this turn.`,
          causes: [this.drivers(key, breakdown)].filter((c): c is string => Boolean(c)),
        });
      } else if (b.raw > 100) {
        const surplus = fixed1(b.raw - 100);
        events.push({
          turn,
          kind: 'shortfall',
          importance: 'minor',
          summary:
            key === 'water'
              ? `The river was full: ${surplus} units of recharge flowed downstream.`
              : `${INDICATOR_LABELS[key]} stores are full: ${surplus} units could not be stored.`,
          causes: [],
        });
      }
    }
    return events;
  }

  criticalWarning(turn: number, critical: readonly DepletableKey[], end: Indicators): EventDraft {
    return {
      turn,
      kind: 'warning',
      importance: 'major',
      summary:
        `Critical: ${joinWords(critical.map((key) => `${lowerLabel(key)} ${fixed1(end[key])}`))}. ` +
        'If any essential or the ecosystem is still critical at the end of next turn, the settlement falls into crisis.',
      causes: critical.map((key) => `${INDICATOR_LABELS[key]} is below its critical level (${this.config.thresholds[key].critical}).`),
    };
  }

  scenarioEnded(outcome: ScenarioOutcome): EventDraft {
    return {
      turn: outcome.finalTurn,
      kind: 'scenario_end',
      importance: 'major',
      summary: `The scenario ended after turn ${outcome.finalTurn}${outcome.endedEarly ? ' (early)' : ''}: ${OUTCOME_TITLES[outcome.outcome]}.`,
      causes: outcome.reasons,
    };
  }

  // ----------------------------------------------------------------- helpers

  private depletionBand(key: DepletableKey, value: number): DepletionBand {
    const t = this.config.thresholds[key];
    if (value < t.critical) return 2;
    if (value < t.stress) return 1;
    return 0;
  }

  private pollutionBand(value: number): PollutionBand {
    const t = this.config.thresholds.pollution;
    if (value >= t.severe) return 2;
    if (value > t.damage) return 1;
    return 0;
  }

  private consequence(key: DepletableKey, band: DepletionBand): string {
    const { config } = this;
    const hardship = plural(config.economy.hardshipPerStressedEssential, 'credit');
    switch (key) {
      case 'water':
        return band === 2
          ? `From next turn: crops yield ${percent(config.yield.waterCritical)}, over-extraction costs ${config.ecosystem.overExtractionCritical} ecosystem health per turn, and industry runs at ${percent(config.industry.waterCriticalEnergyFactor)} without cooling water.`
          : `From next turn: crops yield ${percent(config.yield.waterStress)}, emergency pumping damages riverbank habitat (ecosystem −${config.ecosystem.overExtractionStress} per turn), and living costs rise by ${hardship} per player. ` +
              'A damaged watershed recharges less water: a reinforcing loop that conservation, restoration or the wetland can break.';
      case 'food':
        return band === 2 ? 'The settlement is going hungry.' : `From next turn: living costs rise by ${hardship} per player.`;
      case 'energy':
        return band === 2
          ? 'Homes, pumps and machinery are failing.'
          : `From next turn: pumps and machinery run short (crop yields ${percent(config.yield.energyStress)}) and living costs rise by ${hardship} per player.`;
      case 'ecosystemHealth':
        return band === 2
          ? "The valley's ecosystems are collapsing."
          : `From next turn: crop yields fall to ${percent(config.yield.ecosystemStress)}, and a weaker watershed recharges less water.`;
    }
  }

  /** The largest flows behind an indicator's change this turn. */
  private drivers(key: IndicatorKey, breakdown: TurnBreakdown): string | null {
    const lines = [...breakdown.indicators[key].lines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 4);
    if (lines.length === 0) return null;
    return `Largest flows this turn: ${lines.map((line) => `${line.label} ${signed1(line.amount)}`).join('; ')}.`;
  }

  /** Attributes pollution to every source (not just one player), as the spec requires. */
  private pollutionSources(world: World, turn: number): string[] {
    const { config } = this;
    const industry = world.structuresOf('industry');
    const farms = world.structuresOf('farm');
    return [
      `Industry emissions: ${fixed1(industry.length * config.industry.pollution)} per turn from ${plural(industry.length, 'unit')} (${this.ownership(world, industry)}).`,
      `Farm runoff: ${fixed1(farms.length * config.farm.pollution)} per turn from ${plural(farms.length, 'farm')} (${this.ownership(world, farms)}).`,
      `Households: ${fixed1(this.calendar.householdDemand(turn).pollution)} per turn.`,
    ];
  }

  private ownership(world: World, structures: readonly Structure[]): string {
    const parts: string[] = [];
    const initial = structures.filter((s) => s.isInitial).length;
    if (initial > 0) parts.push(`${initial} original`);
    const byOwner = new Map<PlayerId, number[]>();
    for (const s of structures) {
      if (s.isInitial || s.ownerId === null) continue;
      byOwner.set(s.ownerId, [...(byOwner.get(s.ownerId) ?? []), s.builtTurn]);
    }
    for (const [ownerId, turns] of byOwner) {
      parts.push(`${this.owner(world, ownerId)} built ${turns.length} (turn${turns.length > 1 ? 's' : ''} ${turns.join(', ')})`);
    }
    return parts.join('; ');
  }

  private owner(world: World, ownerId: PlayerId | null): string {
    if (ownerId === null) return 'The settlement';
    return world.player(ownerId)?.displayName ?? 'A former player';
  }
}
