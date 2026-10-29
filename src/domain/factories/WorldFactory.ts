import type { SimulationConfig } from '../config/riverValley';
import { CommunityProject } from '../model/CommunityProject';
import { DisplayName } from '../model/DisplayName';
import type { StructureSnapshot, WorldSnapshot } from '../model/types';
import { World } from '../model/World';

/** Creates worlds in the scenario's documented initial condition. */
export class WorldFactory {
  constructor(private readonly config: SimulationConfig) {}

  createNew(worldId: string): World {
    const { config } = this;
    const structures: StructureSnapshot[] = [];
    for (let slot = 0; slot < config.initialStructures.farm; slot += 1) {
      structures.push({ id: `s-init-farm-${slot}`, kind: 'farm', ownerId: null, builtTurn: 0, slot });
    }
    for (let slot = 0; slot < config.initialStructures.industry; slot += 1) {
      structures.push({ id: `s-init-industry-${slot}`, kind: 'industry', ownerId: null, builtTurn: 0, slot });
    }
    const snapshot: WorldSnapshot = {
      id: worldId,
      configVersion: config.version,
      turn: 1,
      status: 'active',
      indicators: { ...config.initialIndicators },
      players: {},
      structures,
      project: CommunityProject.open({
        id: config.project.id,
        name: config.project.name,
        target: config.project.target,
      }).toSnapshot(),
      history: [],
      historyPoints: [{ turn: 0, indicators: { ...config.initialIndicators } }],
      decisions: [],
      lastBreakdown: null,
      criticalStreak: 0,
      outcome: null,
      nextEventSeq: 1,
      nextStructureSeq: 1,
      nextJoinOrder: 1,
    };
    return World.fromSnapshot(snapshot, config);
  }

  /** A fresh scenario for the same group: same ids and names, original join order, fresh credits. */
  restart(previous: World, worldId: string): World {
    const world = this.createNew(worldId);
    for (const player of previous.players()) world.admit(player.id, DisplayName.parse(player.displayName));
    return world;
  }
}
