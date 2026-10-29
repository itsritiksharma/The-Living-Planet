import type { SystemReportDTO } from '../../contracts/views';
import { formatValue } from '../presentation/format';

export function SystemReportPanel({ report, active }: { report: SystemReportDTO | null; active: boolean }) {
  return (
    <section className="panel" aria-labelledby="report-title">
      <h2 id="report-title">Your system report</h2>
      {report ? (
        <>
          <p className="hint">
            Prepared after turn {report.generatedAfterTurn}. {report.disclaimer}
          </p>
          {report.forecast.length > 0 && (
            <div className="table-scroll">
              <table>
                <caption>Projection if everyone waits</caption>
                <thead>
                  <tr>
                    <th scope="col">Turn</th>
                    <th scope="col">Water</th>
                    <th scope="col">Food</th>
                    <th scope="col">Energy</th>
                    <th scope="col">Ecosystem</th>
                    <th scope="col">Pollution</th>
                  </tr>
                </thead>
                <tbody>
                  {report.forecast.map((point) => (
                    <tr key={point.turn}>
                      <th scope="row">
                        {point.turn} <span className="hint">({point.label})</span>
                      </th>
                      <td>{formatValue(point.indicators.water)}</td>
                      <td>{formatValue(point.indicators.food)}</td>
                      <td>{formatValue(point.indicators.energy)}</td>
                      <td>{formatValue(point.indicators.ecosystemHealth)}</td>
                      <td>{formatValue(point.indicators.pollution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3>Risks</h3>
          <ul>
            {report.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
          <h3>How the systems interact</h3>
          <ul>
            {report.relationships.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : active ? (
        <p>No report yet. Choose &ldquo;Research: inspect the system&rdquo; to receive one; it uses your turn.</p>
      ) : (
        <p>You did not request a system report during this scenario.</p>
      )}
    </section>
  );
}
