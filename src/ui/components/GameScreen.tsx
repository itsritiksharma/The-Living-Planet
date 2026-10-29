import { useEffect, useRef, useState } from 'react';
import type { PlayerActionDTO, PlayerViewDTO } from '../../contracts/views';
import type { ReflectionsApi } from '../hooks/useGameClient';
import { ActionPanel } from './ActionPanel';
import { Dashboard } from './Dashboard';
import { EventLog } from './EventLog';
import { PlayersPanel } from './PlayersPanel';
import { ProjectPanel } from './ProjectPanel';
import { ScenarioSummary } from './ScenarioSummary';
import { SystemReportPanel } from './SystemReportPanel';
import { TurnHeader } from './TurnHeader';
import { WorldMap } from './WorldMap';

export interface GameScreenProps {
  view: PlayerViewDTO;
  busy: boolean;
  reflections: ReflectionsApi;
  onSubmit(action: PlayerActionDTO): void;
  onCancel(): void;
  onResolveNow(): void;
  onNewScenario(): void;
}

/** Announces each resolved turn to screen readers using the turn's own summary event. */
function useTurnAnnouncement(view: PlayerViewDTO): string {
  const [announcement, setAnnouncement] = useState('');
  const lastSeen = useRef(view.world.lastResolvedTurn);
  useEffect(() => {
    const resolved = view.world.lastResolvedTurn;
    if (resolved === lastSeen.current) return;
    lastSeen.current = resolved;
    const summary = view.world.history.filter((e) => e.kind === 'turn_summary' && e.turn === resolved).at(-1);
    setAnnouncement(summary ? `Turn resolved. ${summary.summary}` : `Turn ${resolved} resolved.`);
  }, [view]);
  return announcement;
}

export function GameScreen({ view, busy, reflections, onSubmit, onCancel, onResolveNow, onNewScenario }: GameScreenProps) {
  const announcement = useTurnAnnouncement(view);
  const { world, you, summary } = view;
  return (
    <div className="game">
      <TurnHeader view={view} />
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      {/* Once the scenario ends, its outcome is the main content: give it the full width. */}
      {summary && (
        <ScenarioSummary summary={summary} historyPoints={world.historyPoints} reflections={reflections.entries} busy={busy} onNewScenario={onNewScenario} />
      )}
      <div className="layout">
        <div className="main-column">
          <WorldMap view={view} />
          <Dashboard view={view} />
        </div>
        <div className="side-column">
          {!summary && you && (
            <ActionPanel
              turn={world.turn}
              options={you.actionOptions}
              pendingAction={you.pendingAction}
              pendingLabel={you.pendingLabel}
              waitingFor={you.waitingFor}
              canResolveNow={you.canResolveNow}
              busy={busy}
              reflections={reflections}
              onSubmit={onSubmit}
              onCancel={onCancel}
              onResolveNow={onResolveNow}
            />
          )}
          <ProjectPanel project={world.project} active={world.status === 'active'} />
          <PlayersPanel roster={view.roster} maxPlayers={view.scenario.maxPlayers} active={world.status === 'active'} />
          <SystemReportPanel report={you?.report ?? null} active={world.status === 'active'} />
        </div>
      </div>
      <EventLog events={world.history} />
    </div>
  );
}
