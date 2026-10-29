import type { IndicatorKey, PlayerViewDTO, ScenarioSummaryDTO } from '../../contracts/views';
import { MOTIVATIONS, type ReflectionEntry } from '../client/ReflectionJournal';
import { formatDelta, formatValue } from '../presentation/format';

const OUTCOME_ICONS: Record<ScenarioSummaryDTO['outcome'], string> = { resilient: '✓', stressed: '▲', crisis: '✖' };
const SHORT_LABELS: Record<IndicatorKey, string> = {
  water: 'water',
  food: 'food',
  energy: 'energy',
  ecosystemHealth: 'ecosystem',
  pollution: 'pollution',
};

const BUILT_LABELS: Record<keyof ScenarioSummaryDTO['players'][number]['built'], string> = {
  farm: 'farm',
  industry: 'industry',
  efficiency: 'efficiency',
  restoration: 'restoration',
};

/** "5 farm, 2 industry" — only what the player actually built. */
function describeBuilt(built: ScenarioSummaryDTO['players'][number]['built']): string {
  const parts = (Object.keys(BUILT_LABELS) as (keyof typeof BUILT_LABELS)[])
    .filter((kind) => built[kind] > 0)
    .map((kind) => `${built[kind]} ${BUILT_LABELS[kind]}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

interface ScenarioSummaryProps {
  summary: ScenarioSummaryDTO;
  historyPoints: PlayerViewDTO['world']['historyPoints'];
  reflections: ReflectionEntry[];
  busy: boolean;
  onNewScenario(): void;
}

/** After-action reflection: what followed each decision the player chose to reflect on. Not a score. */
function ReflectionLookback({ entries, historyPoints }: { entries: ReflectionEntry[]; historyPoints: ScenarioSummaryProps['historyPoints'] }) {
  if (entries.length === 0) return null;
  const last = historyPoints[historyPoints.length - 1];
  return (
    <>
      <h3>Looking back at your reflections</h3>
      <ul>
        {entries.map((entry) => {
          const before = historyPoints[entry.turn - 1];
          const after = historyPoints[Math.min(entry.turn + 1, historyPoints.length - 1)] ?? last;
          const changes =
            before && after
              ? (['water', 'pollution', 'ecosystemHealth'] as const)
                  .map((key) => `${SHORT_LABELS[key]} ${formatDelta(after.indicators[key] - before.indicators[key])}`)
                  .join(', ')
              : '';
          const label = MOTIVATIONS.find((m) => m.value === entry.motivation)?.label ?? entry.motivation;
          return (
            <li key={`${entry.worldId}-${entry.turn}`}>
              Turn {entry.turn}, {entry.decision}: you named &ldquo;{label}&rdquo;. Over the following turns: {changes}. Did the outcome address what was
              driving the decision?
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ScenarioSummary({ summary, historyPoints, reflections, busy, onNewScenario }: ScenarioSummaryProps) {
  return (
    <section className={`panel summary outcome-${summary.outcome}`} aria-labelledby="summary-title" id="actions">
      <h2 id="summary-title">
        <span aria-hidden="true">{OUTCOME_ICONS[summary.outcome]}</span> {summary.title}
      </h2>
      <p>{summary.endedEarly ? `The scenario ended early, after turn ${summary.finalTurn}.` : `The scenario ran its full ${summary.finalTurn} turns.`}</p>
      <h3>Why this outcome</h3>
      <ul>
        {summary.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <h3>Trade-offs</h3>
      <ul>
        {summary.tradeOffs.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="table-scroll">
        <table>
          <caption>Indicators over the scenario</caption>
          <thead>
            <tr>
              <th scope="col">Indicator</th>
              <th scope="col">Start</th>
              <th scope="col">End</th>
              <th scope="col">Lowest</th>
              <th scope="col">Highest</th>
            </tr>
          </thead>
          <tbody>
            {summary.indicatorRanges.map((range) => (
              <tr key={range.key}>
                <th scope="row">{range.label}</th>
                <td>{formatValue(range.start)}</td>
                <td>{formatValue(range.end)}</td>
                <td>{formatValue(range.min)}</td>
                <td>{formatValue(range.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table>
          <caption>Who gained, who paid</caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Credits now</th>
              <th scope="col">Earned</th>
              <th scope="col">Spent on actions</th>
              <th scope="col">Contributed</th>
              <th scope="col">Shortage costs</th>
              <th scope="col">Built</th>
            </tr>
          </thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.playerId}>
                <th scope="row">{p.displayName}</th>
                <td>{p.credits}</td>
                <td>{p.incomeEarned}</td>
                <td>{p.spentOnActions}</td>
                <td>{p.contributed}</td>
                <td>
                  {p.hardshipPaid} ({p.hardshipSharePercent}% of income)
                </td>
                <td>{describeBuilt(p.built)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReflectionLookback entries={reflections} historyPoints={historyPoints} />
      <details>
        <summary>Key events ({summary.keyEvents.length})</summary>
        <ol>
          {summary.keyEvents.map((event) => (
            <li key={event.id}>
              Turn {event.turn}: {event.summary}
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>Every decision, turn by turn</summary>
        <ol>
          {summary.decisions.map((d) => (
            <li key={`${d.turn}-${d.playerId}`}>
              Turn {d.turn}: {d.displayName}, {d.chosen ? d.label : 'no choice (waited)'}
              {d.chosen && !d.applied ? ' (not applied)' : ''}
            </li>
          ))}
        </ol>
      </details>
      <button type="button" className="primary" onClick={onNewScenario} disabled={busy}>
        Start a new scenario with the same group
      </button>
      <p className="hint">The numbers are game units chosen for this scenario: the result describes this game, not a real-world forecast.</p>
    </section>
  );
}
