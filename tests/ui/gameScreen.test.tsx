// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { INDICATOR_KEYS } from '../../src/domain/model/types';
import { GameScreen } from '../../src/ui/components/GameScreen';
import { formatValue } from '../../src/ui/presentation/format';
import { DTO, newWorld, resolve, withIndicators } from '../helpers/fixtures';
import { fakeReflections, viewFor } from './viewFixtures';

afterEach(cleanup);

const noop = () => undefined;
function renderScreen(view: ReturnType<typeof viewFor>) {
  return render(
    <GameScreen view={view} busy={false} reflections={fakeReflections()} onSubmit={noop} onCancel={noop} onResolveNow={noop} onNewScenario={noop} />,
  );
}

describe('Map and dashboard show the same underlying world state', () => {
  it('every indicator value in the dashboard matches the map and the authoritative world', () => {
    const world = resolve(newWorld(['Asha', 'Ben']), { p1: DTO.expandIndustry, p2: DTO.restore });
    renderScreen(viewFor(world, 'p1'));
    for (const key of INDICATOR_KEYS) {
      expect(screen.getByTestId(`value-${key}`).textContent).toBe(formatValue(world.indicators.get(key)));
    }
    const map = screen.getByRole('list', { name: 'Map of the River Valley' });
    const water = formatValue(world.indicators.get('water'));
    const eco = formatValue(world.indicators.get('ecosystemHealth'));
    const tiles = within(map).getAllByRole('listitem');
    expect(tiles.filter((t) => t.getAttribute('aria-label')?.startsWith('River:')).every((t) => t.getAttribute('aria-label')?.includes(`water ${water}`))).toBe(true);
    expect(tiles.filter((t) => t.getAttribute('aria-label')?.startsWith('Forest')).every((t) => t.getAttribute('aria-label')?.includes(`ecosystem health ${eco}`))).toBe(true);
    // Structures on the map are the world's structures, with owners.
    expect(tiles.some((t) => /Industry on lot 1, built turn 1 by Asha/.test(t.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(tiles.some((t) => /Restoration plot at site 1: planted turn 1 by Ben/.test(t.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getByText(`${water} · Good`)).toBeTruthy();
  });

  it('communicates status with text labels, not color alone', () => {
    const world = withIndicators(newWorld(['Asha']), { water: 35, pollution: 65 });
    renderScreen(viewFor(world, 'p1'));
    const waterCard = screen.getByRole('heading', { name: 'Water' }).closest('li') as HTMLElement;
    expect(waterCard.querySelector('.badge')?.textContent).toMatch(/Stressed/);
    const pollutionCard = screen.getByRole('heading', { name: 'Pollution' }).closest('li') as HTMLElement;
    expect(pollutionCard.querySelector('.badge')?.textContent).toMatch(/Severe/);
    expect(screen.getByText(/Water is below 40/)).toBeTruthy();
  });
});

describe('Turn advancement refreshes map, dashboard, history and project progress together', () => {
  it('re-renders every panel from the next authoritative view', () => {
    const before = newWorld(['Asha', 'Ben', 'Chen']);
    const { rerender } = renderScreen(viewFor(before, 'p1'));
    expect(screen.getByTestId('project-funding').textContent).toMatch(/^0 of 24 credits funded/);
    expect(screen.getAllByText(/joined the settlement/)).toHaveLength(3);

    const after = resolve(before, { p1: DTO.contribute(8), p2: DTO.contribute(8), p3: DTO.expandFarm });
    rerender(
      <GameScreen view={viewFor(after, 'p1')} busy={false} reflections={fakeReflections()} onSubmit={noop} onCancel={noop} onResolveNow={noop} onNewScenario={noop} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: /Turn 2 of 16/ })).toBeTruthy();
    expect(screen.getByTestId('value-food').textContent).toBe(formatValue(after.indicators.get('food')));
    expect(screen.getByTestId('project-funding').textContent).toMatch(/^16 of 24 credits funded/);
    expect(screen.getByRole('region', { name: 'Turn 1' })).toBeTruthy();
    expect(screen.getByText(/Asha contributed 8 credits to the Riverbank Wetland \(16\/24\)/)).toBeTruthy();
    const map = screen.getByRole('list', { name: 'Map of the River Valley' });
    expect(within(map).getAllByRole('listitem').some((t) => /Farm on meadow plot 1, built turn 1 by Chen/.test(t.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getByText(/Turn resolved\. Turn 1 \(Spring, Year 1\)/)).toBeTruthy();
  });
});

describe('End of scenario', () => {
  it('replaces the action menu with the outcome summary', () => {
    let world = newWorld(['Asha']);
    while (world.isActive) world = resolve(world, { p1: DTO.wait });
    render(
      <GameScreen view={viewFor(world, 'p1')} busy={false} reflections={fakeReflections()} onSubmit={noop} onCancel={noop} onResolveNow={noop} onNewScenario={noop} />,
    );
    expect(screen.queryByRole('heading', { name: /Choose your action/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: /Stressed settlement/ })).toBeTruthy();
    expect(screen.getByText(/The scenario ran its full 16 turns/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new scenario with the same group' })).toBeTruthy();
    // Nothing invites the player to act on a finished scenario.
    expect(screen.queryByRole('heading', { name: 'Known risks this turn' })).toBeNull();
    expect(screen.getByText(/Never built: the scenario ended before it was funded/, { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('You did not request a system report during this scenario.')).toBeTruthy();
  });
});
