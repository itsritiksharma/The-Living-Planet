import { useEffect } from 'react';
import type { GameClient } from './client/GameClient';
import type { ReflectionJournal } from './client/ReflectionJournal';
import { ConnectionBanner } from './components/ConnectionBanner';
import { GameScreen } from './components/GameScreen';
import { JoinScreen } from './components/JoinScreen';
import { useGameClient, useReflections } from './hooks/useGameClient';

export function App({ client, journal }: { client: GameClient; journal: ReflectionJournal }) {
  const state = useGameClient(client);
  const reflections = useReflections(journal, state.view?.world.id ?? null);

  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  const { view, session } = state;
  let content;
  if (!view) {
    content = <p className="panel loading">Loading the valley…</p>;
  } else if (!session) {
    content = <JoinScreen view={view} busy={state.inFlight > 0} onJoin={(name) => client.join(name)} />;
  } else if (!view.you) {
    content = <p className="panel loading">Rejoining as {session.displayName}…</p>;
  } else {
    content = (
      <GameScreen
        view={view}
        busy={state.inFlight > 0}
        reflections={reflections}
        onSubmit={(action) => client.submitAction(action)}
        onCancel={() => client.cancelAction()}
        onResolveNow={() => client.resolveNow()}
        onNewScenario={() => client.startNewScenario()}
      />
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#actions">
        Skip to actions
      </a>
      <header className="app-header">
        <h1>
          The Living Planet <span className="subtitle">River Valley prototype</span>
        </h1>
      </header>
      <ConnectionBanner
        status={state.status}
        error={state.error}
        notice={state.notice}
        onDismissError={() => client.dismissError()}
        onDismissNotice={() => client.dismissNotice()}
      />
      <main id="main">{content}</main>
      <footer className="app-footer hint">
        Local-hosted multiplayer prototype · in-memory world (resets when the server restarts) · all numbers are game units, not forecasts.
      </footer>
    </div>
  );
}
