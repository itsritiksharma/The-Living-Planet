import type { IndicatorBandLevel, IndicatorViewDTO, PlayerViewDTO } from '../../contracts/views';
import { formatDelta, formatValue } from '../presentation/format';

const BAND_ICONS: Record<IndicatorBandLevel, string> = { good: '✓', watch: '◐', stressed: '▲', critical: '✖' };

function IndicatorCard({ indicator }: { indicator: IndicatorViewDTO }) {
  const { key, label, value, delta, band, thresholds, breakdown, description, higherIsBetter } = indicator;
  return (
    <li className={`indicator tone-${band.level}`} data-indicator={key}>
      <div className="indicator-head">
        <h3 className="indicator-label">{label}</h3>
        <span className={`badge tone-${band.level}`}>
          <span aria-hidden="true">{BAND_ICONS[band.level]}</span> {band.label}
        </span>
      </div>
      <p className="indicator-value">
        <span className="value" data-testid={`value-${key}`}>
          {formatValue(value)}
        </span>
        <span className="unit"> / 100</span>
        <span className="delta">
          {formatDelta(delta)}
          <span className="visually-hidden"> change</span> last turn
        </span>
      </p>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`${label}: ${formatValue(value)} of 100`}>
        <div className="meter-fill" style={{ width: `${value}%` }} />
        {thresholds.map((t) => (
          <span key={t.label} className="meter-tick" style={{ left: `${t.value}%` }} aria-hidden="true" />
        ))}
      </div>
      <p className="thresholds">
        {thresholds.map((t) => `${t.label} ${higherIsBetter ? 'below' : 'above'} ${t.value}`).join(' · ')}
      </p>
      <details>
        <summary>Why it changed</summary>
        <p className="hint">{description}</p>
        {breakdown.length > 0 ? (
          <ul className="flows">
            {breakdown.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span> <span className="amount">{formatDelta(line.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No turn has resolved yet.</p>
        )}
      </details>
    </li>
  );
}

export function Dashboard({ view }: { view: PlayerViewDTO }) {
  const { world, scenario } = view;
  return (
    <section className="panel" aria-labelledby="dashboard-title">
      <h2 id="dashboard-title">Valley indicators</h2>
      <ul className="indicators">
        {world.indicators.map((indicator) => (
          <IndicatorCard key={indicator.key} indicator={indicator} />
        ))}
      </ul>
      <p className="hint">
        {world.status === 'active' ? 'This turn crops yield' : 'Final conditions: crops would yield'} {world.yieldPercent}% · the watershed
        delivers {world.watershedPercent}% of potential recharge. {scenario.assumptionsNote}
      </p>
      {world.status === 'active' && (
        <>
          <h3>Known risks this turn</h3>
          {world.knownRisks.length > 0 ? (
            <ul className="risks">
              {world.knownRisks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : (
            <p>None under the current rules. Research the system for a projection.</p>
          )}
        </>
      )}
    </section>
  );
}
