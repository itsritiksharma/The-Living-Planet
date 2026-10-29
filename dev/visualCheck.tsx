/**
 * Dev-only visual check (served by `npm run dev` at /dev/visual-check.html, never built).
 * Renders the real UI with states produced by the real simulation and view assembler, so the
 * layout can be inspected without clicking through a game. #mid (default), #end, #join.
 */
import { createRoot } from 'react-dom/client';
import { PlayerViewAssembler } from '../src/application/views/PlayerViewAssembler';
import { ActionFactory } from '../src/domain/actions/ActionFactory';
import { RIVER_VALLEY_CONFIG as config } from '../src/domain/config/riverValley';
import { WorldFactory } from '../src/domain/factories/WorldFactory';
import { DisplayName } from '../src/domain/model/DisplayName';
import { TurnSubmissions } from '../src/domain/model/TurnSubmissions';
import type { PlayerActionDTO } from '../src/domain/model/types';
import type { World } from '../src/domain/model/World';
import { TurnResolver } from '../src/domain/services/TurnResolver';
import { ConnectionBanner } from '../src/ui/components/ConnectionBanner';
import { GameScreen } from '../src/ui/components/GameScreen';
import { JoinScreen } from '../src/ui/components/JoinScreen';
import '../src/ui/styles.css';

const actions = new ActionFactory();
const resolver = new TurnResolver(config);
const assembler = new PlayerViewAssembler(config);

function play(world: World, turns: Record<string, PlayerActionDTO>[]): World {
  return turns.reduce((current, byPlayer) => {
    const submissions = TurnSubmissions.of(current.id, current.turn, Object.entries(byPlayer).map(([id, dto]) => [id, actions.fromDTO(dto)]));
    const result = resolver.resolve(current, current.turn, submissions);
    if (result.status !== 'resolved') throw new Error('expected resolution');
    return result.world;
  }, world);
}

function newWorld(names: string[]): World {
  const world = new WorldFactory(config).createNew('world-visual');
  names.forEach((name, i) => world.admit(`p${i + 1}`, DisplayName.parse(name)));
  return world;
}

const industry: PlayerActionDTO = { type: 'EXPAND_PRODUCTION', target: 'industry' };
const farm: PlayerActionDTO = { type: 'EXPAND_PRODUCTION', target: 'farm' };
const contribute = (amount: number): PlayerActionDTO => ({ type: 'CONTRIBUTE_TO_PROJECT', projectId: 'wetland', amount });

function midGame() {
  const world = play(newWorld(['Asha', 'Ben', 'Chen']), [
    { p1: industry, p2: { type: 'RESTORE_WATERSHED' }, p3: contribute(8) },
    { p1: industry, p2: contribute(8), p3: { type: 'CONSERVE_WATER' } },
    { p1: farm, p2: { type: 'INSPECT_SYSTEM' }, p3: contribute(2) },
    { p1: industry, p2: { type: 'RESTORE_WATERSHED' }, p3: { type: 'WAIT' } },
    { p1: farm, p2: contribute(2), p3: contribute(4) },
  ]);
  const pending = TurnSubmissions.of(world.id, world.turn, [['p1', actions.fromDTO(industry)]]);
  return assembler.assemble(world, pending, new Set(['p1', 'p2']), 'p2');
}

function endGame() {
  let world = newWorld(['Asha']);
  while (world.isActive) {
    const valid = (dto: PlayerActionDTO) => world.validate('p1', actions.fromDTO(dto)).ok;
    world = play(world, [{ p1: valid(industry) ? industry : valid(farm) ? farm : { type: 'WAIT' } }]);
  }
  return assembler.assemble(world, TurnSubmissions.empty(world.id, world.turn), new Set(['p1']), 'p1');
}

const noop = () => undefined;
const reflections = { hidden: false, setHidden: noop, record: noop, entries: [] };

/** Stamps the measured widths on screen so screenshots reveal any horizontal overflow. */
function stampWidths(): void {
  const stamp = document.createElement('div');
  const { clientWidth, scrollWidth } = document.documentElement;
  stamp.textContent = `viewport ${clientWidth}px · content ${scrollWidth}px${scrollWidth > clientWidth ? ' · OVERFLOW' : ''}`;
  stamp.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#ffe34d;color:#000;font:12px monospace;padding:2px 6px';
  document.body.appendChild(stamp);
}
setTimeout(stampWidths, 500);
const mode = window.location.hash.replace('#', '') || 'mid';
const root = document.getElementById('root');
if (!root) throw new Error('missing root');

createRoot(root).render(
  <div className="app">
    <header className="app-header">
      <h1>
        The Living Planet <span className="subtitle">River Valley prototype (visual check: {mode})</span>
      </h1>
    </header>
    {mode === 'join' ? (
      <>
        <ConnectionBanner status="reconnecting" error={null} notice={null} onDismissError={noop} onDismissNotice={noop} />
        <JoinScreen view={midGame()} busy={false} onJoin={noop} />
      </>
    ) : (
      <GameScreen
        view={mode === 'end' ? endGame() : midGame()}
        busy={false}
        reflections={reflections}
        onSubmit={noop}
        onCancel={noop}
        onResolveNow={noop}
        onNewScenario={noop}
      />
    )}
  </div>,
);
