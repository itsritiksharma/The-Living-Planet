import { GameCommandBus } from '../../application/GameCommandBus';
import type { ChangeNotifier, IdGenerator, Logger, PresenceTracker } from '../../application/ports/runtime';
import { CancelAction } from '../../application/usecases/CancelAction';
import { GetPlayerView } from '../../application/usecases/GetPlayerView';
import { InitializeWorld } from '../../application/usecases/InitializeWorld';
import { JoinGame } from '../../application/usecases/JoinGame';
import { ResolveTurn } from '../../application/usecases/ResolveTurn';
import { ResumeSession } from '../../application/usecases/ResumeSession';
import { StartNewScenario } from '../../application/usecases/StartNewScenario';
import { SubmitAction } from '../../application/usecases/SubmitAction';
import { PlayerViewAssembler } from '../../application/views/PlayerViewAssembler';
import { ActionFactory } from '../../domain/actions/ActionFactory';
import { RIVER_VALLEY_CONFIG, type SimulationConfig } from '../../domain/config/riverValley';
import { WorldFactory } from '../../domain/factories/WorldFactory';
import { TurnResolver } from '../../domain/services/TurnResolver';
import { InMemoryIdempotencyStore } from '../persistence/InMemoryIdempotencyStore';
import { InMemorySessionRepository } from '../persistence/InMemorySessionRepository';
import { InMemorySubmissionRepository } from '../persistence/InMemorySubmissionRepository';
import { InMemoryWorldRepository } from '../persistence/InMemoryWorldRepository';
import { ConsoleLogger, CryptoIdGenerator } from '../runtime/runtimeAdapters';

export interface GameApplicationDeps {
  presence: PresenceTracker;
  notifier: ChangeNotifier;
  config?: SimulationConfig;
  ids?: IdGenerator;
  logger?: Logger;
}

export type GameApplication = ReturnType<typeof createGameApplication>;

/** Composition root: wires the in-memory adapters to the use cases. */
export function createGameApplication(deps: GameApplicationDeps) {
  const config = deps.config ?? RIVER_VALLEY_CONFIG;
  const logger = deps.logger ?? new ConsoleLogger();
  const ids = deps.ids ?? new CryptoIdGenerator();
  const actions = new ActionFactory();
  const worlds = new InMemoryWorldRepository(config);
  const submissions = new InMemorySubmissionRepository(actions);
  const sessions = new InMemorySessionRepository();
  const idempotency = new InMemoryIdempotencyStore();
  const worldFactory = new WorldFactory(config);
  const simulator = new TurnResolver(config);
  const { presence, notifier } = deps;

  const resolveTurn = new ResolveTurn({ worlds, submissions, simulator, notifier, logger });
  const handlers = {
    join: new JoinGame({ worlds, sessions, ids, notifier }),
    submitAction: new SubmitAction({ worlds, submissions, presence, notifier, actions, resolveTurn }),
    cancelAction: new CancelAction({ worlds, submissions, notifier }),
    resolveTurn,
    startNewScenario: new StartNewScenario({ worlds, worldFactory, ids, notifier }),
  };

  return {
    config,
    bus: new GameCommandBus({ handlers, idempotency, logger }),
    resume: new ResumeSession({ worlds, sessions }),
    views: new GetPlayerView({ worlds, submissions, presence, assembler: new PlayerViewAssembler(config) }),
    initialize: new InitializeWorld({ worlds, worldFactory, ids }),
    worlds,
    submissions,
    sessions,
    idempotency,
    logger,
  };
}
