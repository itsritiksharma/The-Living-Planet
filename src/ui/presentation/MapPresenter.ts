import type { IndicatorBandLevel, IndicatorKey, IndicatorViewDTO, PlayerViewDTO, StructureViewDTO } from '../../contracts/views';
import { formatValue, initialOf, plural } from './format';

export type TileTerrain =
  | 'forest'
  | 'river'
  | 'restoration'
  | 'wetland'
  | 'farm'
  | 'meadow'
  | 'homes'
  | 'waterworks'
  | 'industry'
  | 'lot'
  | 'grassland';

export type TileTone = IndicatorBandLevel | 'neutral';

export interface MapTile {
  id: string;
  row: number;
  col: number;
  terrain: TileTerrain;
  icon: string;
  /** Full accessible description: what the tile is and the state value behind it. */
  description: string;
  tone: TileTone;
  owner: { name: string; initial: string; color: number } | null;
  haze: 'none' | 'light' | 'heavy';
}

export interface MapModel {
  columns: number;
  rows: number;
  tiles: MapTile[];
  summary: { label: string; value: string; tone: TileTone }[];
}

const TERRAIN: Record<string, TileTerrain> = {
  F: 'forest',
  R: 'river',
  s: 'restoration',
  W: 'wetland',
  a: 'farm',
  M: 'meadow',
  H: 'homes',
  E: 'waterworks',
  I: 'industry',
  L: 'lot',
  '.': 'grassland',
};

const RANK: Record<IndicatorBandLevel, number> = { good: 0, watch: 1, stressed: 2, critical: 3 };

/**
 * Builds the map from the authoritative view. Every tile that implies an effect is backed by a
 * real structure or indicator value, and uses the same values and bands as the dashboard.
 */
export function buildMapModel(view: PlayerViewDTO): MapModel {
  const indicator = (key: IndicatorKey): IndicatorViewDTO => {
    const found = view.world.indicators.find((i) => i.key === key);
    if (!found) throw new Error(`Missing indicator ${key}`);
    return found;
  };
  const water = indicator('water');
  const eco = indicator('ecosystemHealth');
  const food = indicator('food');
  const energy = indicator('energy');
  const pollution = indicator('pollution');
  const describe = (i: IndicatorViewDTO) => `${i.label.toLowerCase()} ${formatValue(i.value)} (${i.band.label})`;
  const haze: MapTile['haze'] = pollution.band.level === 'critical' || pollution.band.level === 'stressed' ? 'heavy' : pollution.band.level === 'watch' ? 'light' : 'none';
  const yieldTone: TileTone = view.world.yieldPercent >= 100 ? 'good' : view.world.yieldPercent >= 70 ? 'stressed' : 'critical';

  const structures = view.world.structures;
  const find = (kind: StructureViewDTO['kind'], initial: boolean, slot: number) =>
    structures.find((s) => s.kind === kind && s.isInitial === initial && s.slot === slot) ?? null;
  const ownerOf = (s: StructureViewDTO | null): MapTile['owner'] =>
    s?.ownerName && s.ownerColor !== null ? { name: s.ownerName, initial: initialOf(s.ownerName), color: s.ownerColor } : null;
  const efficiency = structures.filter((s) => s.kind === 'efficiency');
  const project = view.world.project;

  const counters: Record<string, number> = {};
  const tiles: MapTile[] = [];
  view.scenario.mapLayout.forEach((rowText, row) => {
    [...rowText].forEach((char, col) => {
      const terrain = TERRAIN[char] ?? 'grassland';
      const index = counters[char] ?? 0;
      counters[char] = index + 1;
      const base = { id: `r${row}c${col}`, row, col, owner: null, haze: 'none' as const };
      switch (terrain) {
        case 'forest':
          tiles.push({ ...base, terrain, icon: eco.band.level === 'critical' ? '🪵' : eco.band.level === 'stressed' ? '🍂' : '🌲', description: `Forest and watershed: ${describe(eco)}.`, tone: eco.band.level });
          break;
        case 'river':
          tiles.push({ ...base, terrain, icon: water.band.level === 'critical' ? '⚠️' : '🌊', description: `River: ${describe(water)}.`, tone: water.band.level });
          break;
        case 'restoration': {
          const plot = find('restoration', false, index);
          const growth = plot?.growth;
          tiles.push(
            plot && growth
              ? {
                  ...base,
                  terrain,
                  icon: growth.mature ? '🌳' : '🌱',
                  description: growth.mature
                    ? `Restored woodland at site ${index + 1} (planted turn ${plot.builtTurn} by ${plot.ownerName}).`
                    : `Restoration plot at site ${index + 1}: planted turn ${plot.builtTurn} by ${plot.ownerName}, growth ${growth.stage} of ${growth.total} turns.`,
                  tone: 'good',
                  owner: ownerOf(plot),
                }
              : { ...base, terrain, icon: '🟫', description: `Degraded riverbank: restoration site ${index + 1}, not yet planted.`, tone: 'neutral' },
          );
          break;
        }
        case 'wetland':
          tiles.push({
            ...base,
            terrain,
            icon: project.status === 'completed' ? '🦆' : project.status === 'in_progress' ? '🏗️' : '🚧',
            description:
              project.status === 'completed'
                ? `${project.name}: complete, storing water and filtering pollution for everyone.`
                : project.status === 'in_progress'
                  ? `${project.name}: under construction, completes at the end of turn ${project.completesTurn}.`
                  : `${project.name} site: ${project.funded} of ${project.target} credits funded.`,
            tone: project.status === 'completed' ? 'good' : 'neutral',
          });
          break;
        case 'farm': {
          const farm = find('farm', true, index);
          tiles.push({ ...base, terrain, icon: '🌾', description: `Settlement farm ${index + 1}${farm ? '' : ' (missing)'}: crops yield ${view.world.yieldPercent}% this turn.`, tone: yieldTone });
          break;
        }
        case 'meadow': {
          const farm = find('farm', false, index);
          tiles.push(
            farm
              ? { ...base, terrain: 'farm', icon: '🌾', description: `Farm on meadow plot ${index + 1}, built turn ${farm.builtTurn} by ${farm.ownerName}: crops yield ${view.world.yieldPercent}% this turn.`, tone: yieldTone, owner: ownerOf(farm) }
              : { ...base, terrain, icon: '🌼', description: `Open meadow: farm plot ${index + 1}, available.`, tone: 'neutral' },
          );
          break;
        }
        case 'homes': {
          const worst = RANK[food.band.level] >= RANK[energy.band.level] ? food.band.level : energy.band.level;
          tiles.push({ ...base, terrain, icon: '🏘️', description: `Homes: ${describe(food)}, ${describe(energy)}; air ${describe(pollution)}.`, tone: worst, haze });
          break;
        }
        case 'waterworks':
          tiles.push({
            ...base,
            terrain,
            icon: '🚰',
            description: `Waterworks: ${efficiency.length} of ${view.world.capacity.efficiencyUpgrades.total} efficiency upgrades (water use −${view.world.waterUseReductionPercent}%)${efficiency.length > 0 ? `, funded by ${[...new Set(efficiency.map((e) => e.ownerName))].join(', ')}` : ''}.`,
            tone: 'neutral',
          });
          break;
        case 'industry':
          tiles.push({ ...base, terrain, icon: '🏭', description: `Settlement workshop ${index + 1}; air ${describe(pollution)}.`, tone: pollution.band.level, haze });
          break;
        case 'lot': {
          const unit = find('industry', false, index);
          tiles.push(
            unit
              ? { ...base, terrain: 'industry', icon: '🏭', description: `Industry on lot ${index + 1}, built turn ${unit.builtTurn} by ${unit.ownerName}; air ${describe(pollution)}.`, tone: pollution.band.level, owner: ownerOf(unit), haze }
              : { ...base, terrain, icon: '⬜', description: `Vacant industrial lot ${index + 1}.`, tone: 'neutral' },
          );
          break;
        }
        case 'grassland':
          tiles.push({ ...base, terrain, icon: '', description: 'Grassland (no structures).', tone: 'neutral' });
          break;
      }
    });
  });

  const farms = structures.filter((s) => s.kind === 'farm').length;
  const industry = structures.filter((s) => s.kind === 'industry').length;
  const restorations = structures.filter((s) => s.kind === 'restoration');
  return {
    columns: view.scenario.mapLayout[0]?.length ?? 0,
    rows: view.scenario.mapLayout.length,
    tiles,
    summary: [
      { label: 'River (water)', value: `${formatValue(water.value)} · ${water.band.label}`, tone: water.band.level },
      { label: 'Forest & watershed (ecosystem)', value: `${formatValue(eco.value)} · ${eco.band.label}`, tone: eco.band.level },
      { label: 'Farms', value: `${plural(farms, 'farm')} · crops yield ${view.world.yieldPercent}%`, tone: yieldTone },
      { label: 'Industry', value: plural(industry, 'unit'), tone: 'neutral' },
      { label: 'Air (pollution)', value: `${formatValue(pollution.value)} · ${pollution.band.label}`, tone: pollution.band.level },
      {
        label: 'Waterworks',
        value: `${efficiency.length}/${view.world.capacity.efficiencyUpgrades.total} upgrades${view.world.waterUseReductionPercent > 0 ? ` · −${view.world.waterUseReductionPercent}% water use` : ' · no savings yet'}`,
        tone: 'neutral',
      },
      { label: 'Restoration', value: `${restorations.length}/${view.world.capacity.restorationSites.total} sites planted`, tone: 'neutral' },
      { label: project.name, value: `${project.statusLabel} · ${project.funded}/${project.target}`, tone: project.status === 'completed' ? 'good' : 'neutral' },
    ],
  };
}
