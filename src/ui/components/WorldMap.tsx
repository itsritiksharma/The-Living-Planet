import type { PlayerViewDTO } from '../../contracts/views';
import { buildMapModel } from '../presentation/MapPresenter';

export function WorldMap({ view }: { view: PlayerViewDTO }) {
  const map = buildMapModel(view);
  return (
    <section className="panel" aria-labelledby="map-title">
      <h2 id="map-title">The valley</h2>
      <ul className="map" style={{ gridTemplateColumns: `repeat(${map.columns}, minmax(0, 1fr))` }} aria-label="Map of the River Valley">
        {map.tiles.map((tile) => (
          <li
            key={tile.id}
            className={`tile tile-${tile.terrain} tone-${tile.tone} haze-${tile.haze}`}
            aria-label={tile.description}
            title={tile.description}
          >
            <span className="tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            {tile.owner && (
              <span className={`owner-badge owner-${tile.owner.color} tile-owner`} aria-hidden="true">
                {tile.owner.initial}
              </span>
            )}
          </li>
        ))}
      </ul>
      <h3 className="visually-hidden">Map summary</h3>
      <dl className="map-summary">
        {map.summary.map((item) => (
          <div key={item.label} className={`map-summary-item tone-${item.tone}`}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint legend">
        Legend: 🌲 forest · 🌊 river · 🌾 farm · 🌼 open meadow plot · 🏘️ homes · 🚰 waterworks · 🏭 industry · ⬜ vacant lot · 🟫 degraded
        riverbank · 🌱 restoration · 🚧 wetland site. Letters mark who built a structure; hover or use a screen reader for details.
      </p>
    </section>
  );
}
