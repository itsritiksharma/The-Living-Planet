import type { ProjectViewDTO } from '../../contracts/views';

export function ProjectPanel({ project, active }: { project: ProjectViewDTO; active: boolean }) {
  const percent = Math.round((project.funded / project.target) * 100);
  return (
    <section className="panel" aria-labelledby="project-title">
      <h2 id="project-title">Shared project: {project.name}</h2>
      <p>
        <strong>{project.statusLabel}</strong>
        {project.status === 'in_progress' && project.completesTurn !== null ? ` · finishes at the end of turn ${project.completesTurn}` : ''}
      </p>
      <div className="progress" role="progressbar" aria-label="Funding" aria-valuemin={0} aria-valuemax={project.target} aria-valuenow={project.funded}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p data-testid="project-funding">
        {project.funded} of {project.target} credits funded{active && project.status === 'open' ? ` · ${project.remaining} still needed` : ''}
      </p>
      <h3>What it does</h3>
      <ul>
        {project.benefits.map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
      <h3>Contributions (public)</h3>
      {project.contributions.length > 0 ? (
        <ul>
          {project.contributions.map((c) => (
            <li key={c.playerId}>
              {c.displayName}: {c.amount} credits
            </li>
          ))}
        </ul>
      ) : (
        <p>No contributions yet.</p>
      )}
      {project.nonContributors.length > 0 && <p>Not contributed: {project.nonContributors.join(', ')}.</p>}
      <p className="hint">{project.freeRiderNote}</p>
    </section>
  );
}
