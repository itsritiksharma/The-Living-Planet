// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerActionDTO } from '../../src/contracts/views';
import { World } from '../../src/domain/entities/World';
import { ActionPanel, type ActionPanelProps } from '../../src/ui/components/ActionPanel';
import { config, DTO, newWorld, submissionsFor } from '../helpers/fixtures';
import { fakeReflections, viewFor } from './viewFixtures';

afterEach(cleanup);

function setup(overrides: Partial<ActionPanelProps> = {}, world = newWorld(['Asha', 'Ben'])) {
  const view = viewFor(world, 'p1');
  const you = view.you;
  if (!you) throw new Error('missing viewer');
  const onSubmit = vi.fn<(action: PlayerActionDTO) => void>();
  const reflections = fakeReflections();
  const props: ActionPanelProps = {
    turn: view.world.turn,
    options: you.actionOptions,
    pendingAction: you.pendingAction,
    pendingLabel: you.pendingLabel,
    waitingFor: you.waitingFor,
    canResolveNow: you.canResolveNow,
    busy: false,
    reflections,
    onSubmit,
    onCancel: vi.fn(),
    onResolveNow: vi.fn(),
    ...overrides,
  };
  render(<ActionPanel {...props} />);
  return { onSubmit, reflections, props };
}

const choose = (label: string) => fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: /^Confirm:/ }));

describe('ActionPanel: a player can choose each required action', () => {
  const cases: [string, PlayerActionDTO][] = [
    ['Expand production: farmland', DTO.expandFarm],
    ['Expand production: industry', DTO.expandIndustry],
    ['Conserve water: efficiency upgrade', DTO.conserve],
    ['Restore forest and watershed', DTO.restore],
    ['Research: inspect the system', DTO.inspect],
    // Default offer: an equal share of what is needed (24 / 2 = 12), capped at the 10 credits Asha has.
    ['Contribute to the Riverbank Wetland', DTO.contribute(10)],
    ['Wait / take no action', DTO.wait],
  ];

  it.each(cases)('%s: shows cost and consequences before confirming, then submits the intention', (label, expected) => {
    const { onSubmit } = setup();
    choose(label);
    expect(screen.getByRole('heading', { level: 3, name: label })).toBeTruthy();
    expect(screen.getByText('Cost:')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Now' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Known risks' })).toBeTruthy();
    confirm();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(expected);
  });

  it('shows delayed effects explicitly (e.g. restoration only helps on later turns)', () => {
    setup();
    choose('Restore forest and watershed');
    expect(screen.getByText('No immediate change.')).toBeTruthy();
    expect(screen.getByText(/Ecosystem health \+2 per turn for 4 turns, starting next turn/)).toBeTruthy();
  });

  it('disables unaffordable actions and says why', () => {
    const snapshot = newWorld(['Asha', 'Ben']).toSnapshot();
    const player = snapshot.players.p1;
    if (player) player.credits = 2;
    setup({}, World.fromSnapshot(snapshot, config));
    const farm = screen.getByRole('radio', { name: /Expand production: farmland/ });
    expect((farm as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText(/Unavailable: This costs 5 credits; you have 2\./).length).toBeGreaterThan(0);
  });

  it('validates the contribution amount', () => {
    const { onSubmit } = setup();
    choose('Contribute to the Riverbank Wetland');
    const amount = screen.getByLabelText(/Credits to contribute/);
    fireEvent.change(amount, { target: { value: '11' } });
    expect((screen.getByRole('button', { name: /^Confirm:/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(amount, { target: { value: '4' } });
    confirm();
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(DTO.contribute(4));
  });
});

describe('Reflection prompt: contextual and non-coercive', () => {
  it('appears only for production decisions', () => {
    setup();
    choose('Conserve water');
    expect(screen.queryByRole('group', { name: /what is driving this decision/i })).toBeNull();
    choose('Expand production: industry');
    expect(screen.getByRole('group', { name: /what is driving this decision/i })).toBeTruthy();
    expect(screen.getByText(/does not affect the simulation/)).toBeTruthy();
  });

  it('can be skipped: confirming needs no answer, and an answer does not change what is submitted', () => {
    const { onSubmit, reflections } = setup();
    choose('Expand production: industry');
    confirm();
    cleanup();
    const second = setup();
    choose('Expand production: industry');
    fireEvent.click(screen.getByRole('radio', { name: 'Fear of falling behind' }));
    confirm();
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(second.onSubmit.mock.calls[0]?.[0]);
    expect(reflections.recorded).toEqual([]);
    expect(second.reflections.recorded).toEqual([{ turn: 1, decision: 'Expand production: industry', motivation: 'fear_of_falling_behind' }]);
  });

  it('offers "don\'t ask again", and stays hidden when the player chose that', () => {
    const setHidden = vi.fn();
    setup({ reflections: fakeReflections({ setHidden }) });
    choose('Expand production: farmland');
    fireEvent.click(screen.getByRole('button', { name: /Don.t ask me this again/ }));
    expect(setHidden).toHaveBeenCalledWith(true);
    cleanup();
    setup({ reflections: fakeReflections({ hidden: true }) });
    choose('Expand production: farmland');
    expect(screen.queryByRole('group', { name: /what is driving this decision/i })).toBeNull();
  });
});

describe('After choosing', () => {
  it('shows the pending choice, who is still choosing, and lets the player change it or resolve now', () => {
    const world = newWorld(['Asha', 'Ben']);
    const view = viewFor(world, 'p1', submissionsFor(world, { p1: DTO.restore }));
    const you = view.you;
    if (!you) throw new Error('missing viewer');
    const { props } = setup({
      pendingAction: you.pendingAction,
      pendingLabel: you.pendingLabel,
      waitingFor: you.waitingFor,
      canResolveNow: you.canResolveNow,
    });
    expect(screen.getByText('Restore forest and watershed')).toBeTruthy();
    expect(screen.getByText(/Waiting for: Ben/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change my choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve turn now' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onResolveNow).toHaveBeenCalledTimes(1);
  });
});

