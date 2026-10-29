// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClient, type SocketLike } from '../../src/ui/client/GameClient';
import { SessionStore } from '../../src/ui/client/SessionStore';
import { memoryStorage } from '../../src/ui/client/storage';
import { ConnectionBanner } from '../../src/ui/components/ConnectionBanner';
import { JoinScreen } from '../../src/ui/components/JoinScreen';
import { DTO, newWorld } from '../helpers/fixtures';
import { viewFor } from './viewFixtures';

afterEach(cleanup);

class FakeSocket {
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onclose: SocketLike['onclose'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onerror: SocketLike['onerror'] = null;
  readonly sent: Record<string, unknown>[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.drop();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }

  receive(message: unknown): void {
    this.onmessage?.call(this as unknown as WebSocket, new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'));
  }
}

function setupClient(storage = memoryStorage()) {
  const sockets: FakeSocket[] = [];
  const timers: (() => void)[] = [];
  let ids = 0;
  const client = new GameClient({
    url: 'ws://test/ws',
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as SocketLike;
    },
    sessions: new SessionStore(storage),
    createCommandId: () => `cmd-test-${String((ids += 1)).padStart(4, '0')}`,
    setTimer: (callback) => timers.push(callback),
    clearTimer: () => undefined,
  });
  return { client, sockets, timers, storage, socket: () => sockets[sockets.length - 1] as FakeSocket };
}

const welcome = (commandId?: string) => ({
  type: 'welcome',
  playerId: 'p1',
  sessionToken: 'token-abc',
  worldId: 'world-test',
  displayName: 'Asha',
  ...(commandId ? { commandId } : {}),
});

describe('GameClient: idempotent commands over an unreliable connection', () => {
  it('joins, stores the per-tab session and clears the command once acknowledged', () => {
    const { client, socket, storage } = setupClient();
    client.start();
    socket().open();
    client.join('Asha');
    expect(socket().sent).toEqual([{ type: 'join', commandId: 'cmd-test-0001', displayName: 'Asha' }]);
    expect(client.getState().inFlight).toBe(1);
    socket().receive(welcome('cmd-test-0001'));
    expect(client.getState().session).toMatchObject({ playerId: 'p1', token: 'token-abc' });
    expect(client.getState().inFlight).toBe(0);
    expect(new SessionStore(storage).load()?.token).toBe('token-abc');
  });

  it('after a dropped connection, resumes the session and resends the unacknowledged command with the same id', () => {
    const { client, sockets, timers, socket } = setupClient();
    client.start();
    socket().open();
    client.join('Asha');
    socket().receive(welcome('cmd-test-0001'));
    socket().receive({ type: 'state', view: viewFor(newWorld(['Asha']), 'p1') });
    client.submitAction(DTO.expandFarm);
    const original = socket().sent.at(-1);
    expect(original).toMatchObject({ type: 'submitAction', commandId: 'cmd-test-0002', expectedTurn: 1 });

    socket().drop(); // the ack never arrived
    expect(client.getState().status).toBe('reconnecting');
    timers.shift()?.();
    expect(sockets).toHaveLength(2);
    socket().open();
    expect(socket().sent).toEqual([{ type: 'resume', sessionToken: 'token-abc' }]);
    socket().receive(welcome());
    expect(socket().sent.at(-1)).toEqual(original); // same commandId: the server will deduplicate
    socket().receive({ type: 'ack', commandId: 'cmd-test-0002', replayed: true, result: { kind: 'submitted', change: 'recorded', resolvedTurn: null } });
    expect(client.getState().inFlight).toBe(0);
    expect(client.getState().notice).toMatch(/Reconnected/);
  });

  it('a resent join after a lost welcome reuses its commandId, so the server cannot create a duplicate player', () => {
    const { client, timers, socket } = setupClient();
    client.start();
    socket().open();
    client.join('Asha');
    socket().drop();
    timers.shift()?.();
    socket().open();
    expect(socket().sent).toEqual([{ type: 'join', commandId: 'cmd-test-0001', displayName: 'Asha' }]);
  });

  it('clears an expired session (e.g. after a server restart) and asks the player to join again', () => {
    const storage = memoryStorage();
    new SessionStore(storage).save({ token: 'old', playerId: 'p1', worldId: 'world-old', displayName: 'Asha' });
    const { client, socket } = setupClient(storage);
    client.start();
    socket().open();
    expect(socket().sent).toEqual([{ type: 'resume', sessionToken: 'old' }]);
    socket().receive({ type: 'error', code: 'SESSION_NOT_FOUND', message: 'gone' });
    expect(client.getState().session).toBeNull();
    expect(client.getState().notice).toMatch(/Join again/);
    expect(new SessionStore(storage).load()).toBeNull();
  });

  it('surfaces rejected commands as errors and stops retrying them', () => {
    const { client, socket } = setupClient();
    client.start();
    socket().open();
    client.join('Asha');
    socket().receive({ type: 'error', code: 'NAME_TAKEN', message: '"Asha" is already taken in this settlement.', commandId: 'cmd-test-0001' });
    expect(client.getState().error).toEqual({ code: 'NAME_TAKEN', message: '"Asha" is already taken in this settlement.' });
    expect(client.getState().inFlight).toBe(0);
  });

  it('reports offline after repeated failures, with backoff', () => {
    const { client, timers, socket } = setupClient();
    client.start();
    for (let i = 0; i < 4; i += 1) {
      socket().drop();
      timers.shift()?.();
    }
    expect(client.getState().status).toBe('offline');
  });
});

describe('Connection and join states', () => {
  it('explains connecting, reconnecting, offline and rejected states in words', () => {
    const onDismissError = vi.fn();
    const { rerender } = render(<ConnectionBanner status="connecting" error={null} notice={null} onDismissError={onDismissError} onDismissNotice={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toMatch(/Connecting/);
    rerender(<ConnectionBanner status="reconnecting" error={null} notice={null} onDismissError={onDismissError} onDismissNotice={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toMatch(/never applied twice/);
    rerender(<ConnectionBanner status="offline" error={{ code: 'X', message: 'Nope.' }} notice={null} onDismissError={onDismissError} onDismissNotice={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toMatch(/Cannot reach the game server/);
    expect(screen.getByRole('alert').textContent).toMatch(/Not accepted: Nope\./);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissError).toHaveBeenCalled();
  });

  it('joins with a display name', () => {
    const onJoin = vi.fn();
    render(<JoinScreen view={viewFor(newWorld([]), null)} busy={false} onJoin={onJoin} />);
    const button = screen.getByRole('button', { name: 'Join' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Asha ' } });
    fireEvent.click(button);
    expect(onJoin).toHaveBeenCalledWith('Asha');
    expect(screen.getByText(/Turn 1 of 16 · Spring, Year 1/)).toBeTruthy();
  });
});
