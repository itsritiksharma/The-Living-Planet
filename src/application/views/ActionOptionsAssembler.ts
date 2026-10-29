import { ActionFactory } from '../../domain/actions/ActionFactory';
import type { SimulationConfig } from '../../domain/config/riverValley';
import { plural } from '../../domain/model/labels';
import type { PlayerActionDTO, PlayerId } from '../../domain/model/types';
import type { World } from '../../domain/model/World';
import { percent } from '../../domain/shared/numbers';
import type { ActionOptionDTO, ActionOptionKey } from '../../contracts/views';

type OptionDetails = Omit<ActionOptionDTO, 'key' | 'label' | 'template' | 'available' | 'unavailableReason'>;

/**
 * The action menu for one player: every cost and effect text is derived from the scenario config,
 * and availability comes from the same domain validation the server applies on submit.
 */
export class ActionOptionsAssembler {
  private readonly actions = new ActionFactory();

  constructor(private readonly config: SimulationConfig) {}

  build(world: World, playerId: PlayerId): ActionOptionDTO[] {
    const c = this.config;
    const t = c.thresholds;
    const project = world.project;
    const credits = world.player(playerId)?.credits ?? 0;
    const maxAmount = project.isOpen ? Math.min(credits, project.remaining) : 0;
    const equalShare = Math.max(1, Math.ceil(project.remaining / Math.max(1, world.players().length)));
    const installed = world.countOf('efficiency');

    const option = (key: ActionOptionKey, label: string, template: PlayerActionDTO, details: OptionDetails): ActionOptionDTO => {
      const result = world.validate(playerId, this.actions.fromDTO(template));
      return { key, label, template, available: result.ok, unavailableReason: result.ok ? null : result.message, ...details };
    };

    return [
      option('expand_farm', 'Expand production: farmland', { type: 'EXPAND_PRODUCTION', target: 'farm' }, {
        cost: c.farm.cost,
        costLabel: plural(c.farm.cost, 'credit'),
        immediate: [
          `Up to +${c.farm.food} food per turn (at full crop yield).`,
          `You earn +${plural(c.farm.ownerIncome, 'credit')} per turn from the farm.`,
          `Clearing the meadow costs ${Math.abs(c.farm.landConversionEcosystem)} ecosystem health now.`,
        ],
        delayed: [`Every turn from now: +${c.farm.water} water demand, +${c.farm.energy} energy demand and +${c.farm.pollution} pollution.`],
        risks: [
          `Extra demand pushes water toward its stress threshold (${t.water.stress}); below it crops yield ${percent(c.yield.waterStress)} and over-extraction damages the watershed.`,
          `${plural(world.freeSlotCount('farm'), 'meadow plot')} left.`,
        ],
        maxAmount: null,
        reflective: true,
      }),
      option('expand_industry', 'Expand production: industry', { type: 'EXPAND_PRODUCTION', target: 'industry' }, {
        cost: c.industry.cost,
        costLabel: plural(c.industry.cost, 'credit'),
        immediate: [`+${c.industry.energy} energy per turn.`, `You earn +${plural(c.industry.ownerIncome, 'credit')} per turn from the unit.`],
        delayed: [`Every turn from now: +${c.industry.water} water demand and +${c.industry.pollution} pollution.`],
        risks: [
          `Pollution accumulates; above ${t.pollution.damage} it damages ecosystem health, and at ${t.pollution.severe} crop yields fall.`,
          `${plural(world.freeSlotCount('industry'), 'industrial lot')} left.`,
        ],
        maxAmount: null,
        reflective: true,
      }),
      option('conserve', 'Conserve water: efficiency upgrade', { type: 'CONSERVE_WATER' }, {
        cost: c.efficiency.cost,
        costLabel: plural(c.efficiency.cost, 'credit'),
        immediate: [
          `Total water use falls by a further ${percent(c.efficiency.waterUseReduction)} from this turn (installed: ${installed} of ${c.capacity.efficiencyUpgrades}).`,
        ],
        delayed: ['Permanent: the saving applies every turn.'],
        risks: [`Each upgrade's pumps use ${c.efficiency.energyUse} energy per turn.`, 'You pay; everyone shares the water saved.'],
        maxAmount: null,
        reflective: false,
      }),
      option('restore', 'Restore forest and watershed', { type: 'RESTORE_WATERSHED' }, {
        cost: c.restoration.cost,
        costLabel: plural(c.restoration.cost, 'credit'),
        immediate: ['No immediate change.'],
        delayed: [
          `Ecosystem health +${c.restoration.ecosystemPerTurn} per turn for ${c.restoration.growthTurns} turns, starting next turn. Healthier land holds more water and absorbs more pollution.`,
        ],
        risks: ['Benefits arrive slowly and are shared by everyone.', `${plural(world.freeSlotCount('restoration'), 'restoration site')} left.`],
        maxAmount: null,
        reflective: false,
      }),
      option('inspect', 'Research: inspect the system', { type: 'INSPECT_SYSTEM' }, {
        cost: 0,
        costLabel: 'Free (uses your turn)',
        immediate: ['No change to the world.'],
        delayed: [`Next turn you receive a private report: how the systems interact and a ${plural(c.forecast.turns, 'turn')} projection if everyone waits.`],
        risks: ['You give up acting on the world this turn.'],
        maxAmount: null,
        reflective: false,
      }),
      option('contribute', `Contribute to the ${project.name}`, {
        type: 'CONTRIBUTE_TO_PROJECT',
        projectId: project.id,
        amount: Math.max(1, Math.min(maxAmount, equalShare)),
      }, {
        cost: null,
        costLabel: maxAmount > 0 ? `You choose: 1–${maxAmount} credits` : 'Not available',
        immediate: [
          `Adds to the shared fund (${project.funded}/${project.target}).`,
          `An equal share of what is still needed would be about ${plural(equalShare, 'credit')} per player.`,
        ],
        delayed: [
          `When fully funded, construction takes ${plural(c.project.constructionTurns, 'turn')}. Then everyone gets +${c.project.rechargeBonus} water recharge and −${c.project.pollutionFiltration} pollution every turn, plus +${c.project.completionEcosystem} ecosystem health once.`,
        ],
        risks: [
          'Everyone benefits whether or not they contribute.',
          'If too few contribute, the project may never be built; contributions are not refunded.',
        ],
        maxAmount,
        reflective: false,
      }),
      option('wait', 'Wait / take no action', { type: 'WAIT' }, {
        cost: 0,
        costLabel: 'Free',
        immediate: ['The world continues without your intervention.'],
        delayed: [],
        risks: ['Existing pressures continue: accumulated pollution, seasonal water swings and growing demand.'],
        maxAmount: null,
        reflective: false,
      }),
    ];
  }
}
