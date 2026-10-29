# The Living Planet: Phase 1, River Valley prototype

A shared-world ecological simulation: players pursue their own goals in one small river valley, and the
combined consequences of their choices reshape water, food, energy, ecosystem health and pollution over
16 seasons. Built from `specifications/01_PHASE_1_PROTOTYPE.md`; the specifications folder is the source of
truth for scope.

**Status:** a playable Phase 1 prototype with **real local-hosted multiplayer**. The game server is
authoritative and talks WebSocket; the world lives **in memory** (a restart resets it). Nothing is deployed.
**All numbers are game units chosen for legibility, not scientific measurements or forecasts.**

## Requirements

- Node.js 20.19+, 22.13+ or 24+ (developed and tested on 25.8.0; Node 24 LTS recommended)
- npm. No environment variables, accounts, databases, analytics or external services are used.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The page and the game server (WebSocket at `/ws`) share that one port.

- **Each browser tab is a separate player.** Open a second tab to play two players on one computer;
  reloading a tab resumes the same player.
- **Local network (optional):** `npm run dev -- --host`, then others open `http://<your-ip>:5173`.
  There is no authentication beyond per-tab session tokens, so use only on trusted networks.
- **Production-like run:** `npm run build && npm run preview` (serves <http://localhost:4173> with the same
  game server).

## How to play

1. Join with a nickname. Each turn is one season; there are 16 turns (4 years) unless the valley collapses first.
2. Choose one action per turn: **expand production** (farmland or industry), **conserve water**,
   **restore forest/watershed**, **research** the system, **contribute** to the shared wetland, or **wait**.
   Costs, immediate effects, delayed effects and known risks are shown before you confirm.
3. Choices are hidden until the turn resolves, which happens when every connected player has chosen.
   A ready player can press **Resolve turn now**; players who have not chosen then wait.
4. The history explains every change and its causes. At the end, a summary describes the outcome
   (resilient, stressed or crisis), the trade-offs, and who gained and who paid.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload, plus the authoritative game server on the same port |
| `npm test` | Runs all 276 automated tests (Vitest; jsdom for UI tests) |
| `npm run typecheck` | TypeScript strict type check |
| `npm run build` | Type check, then production bundle in `dist/` |
| `npm run preview` | Serves the production bundle with the game server |

Dev-only visual check pages (served by `npm run dev`, not built):
`/dev/visual-check.html#mid`, `#end` and `#join`, plus `/dev/mobile-frame.html`. They render the real UI with
states produced by the real simulation.

## Architecture in one paragraph

Clean Architecture with the dependency rule enforced by a test. **Domain** (`src/domain`): entities such as
the `World` aggregate root, `Player`, `CommunityProject` and `TurnSubmissions`; value objects; one class per
action; factories; and pure domain services. `TurnResolver` holds the documented turn order. There is no
clock, randomness or I/O. **Application** (`src/application`): use-case classes behind ports, an idempotent
command bus and read-model assemblers. **Infrastructure** (`src/infrastructure`): in-memory repositories, the
WebSocket gateway, the message parser, the Vite plugin and the composition root. **UI** (`src/ui`): React,
which depends only on the wire contracts (`src/contracts`). Commands are idempotent end to end. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Simulation in one paragraph

The model is stocks and flows. Water recharge depends on season and watershed (ecosystem) health. Farms and
industry produce food and energy, use water, and add pollution every turn. Pollution above 40 damages the
ecosystem. Water below 40 causes over-extraction that damages the watershed, which then recharges less: a
reinforcing loop that conservation, restoration or the wetland can break. Restoration and the wetland act
only after delays. Every multiplier uses start-of-turn values, so players always get a turn of warning.
See [docs/SIMULATION_MODEL.md](docs/SIMULATION_MODEL.md) for every formula and value. All constants live in
`src/domain/config/riverValley.ts`.

## Known limitations

- **In-memory only:** restarting the server resets the world and all sessions.
- **Local-hosted multiplayer:** one shared world, up to 6 players, and no accounts. There is no rate
  limiting, because the server is meant for localhost or a trusted LAN.
- **Game numbers are invented and tuned for legibility.** They are not calibrated to real systems.
- `communityTrust` from the spec's optional state is not implemented: it would have had no mechanic.
- Reflection answers stay in the browser tab (`sessionStorage`) by design; they are not kept across tabs or devices.
- Map tiles are not individually focusable. Every tile has a text description, and a text map summary
  sits under the map.
- Accessibility and usability have not been audited with assistive technology or tested with real players.
- On WSL with the project under `/mnt/c`, installs and file watching are slower (hot reload uses polling there).
- The folder is not a git repository.

More detail, plus the acceptance checklist, is in [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

## Project structure

```text
src/
  domain/          entities, value objects, actions, factories, domain services, scenario config
  application/     use cases, ports, idempotent command bus, read-model assemblers
  contracts/       wire protocol and view DTO types (shared with the browser)
  infrastructure/  in-memory repositories, WebSocket gateway, parser, controller, Vite plugin, composition
  ui/              React components, client gateway (outbox and reconnect), presentation helpers, styles
  main.tsx         browser entry point
tests/             domain, application, infrastructure, scenarios, architecture, ui (+ helpers)
docs/              ARCHITECTURE.md, SIMULATION_MODEL.md
dev/               dev-only visual check pages
specifications/    the product and phase specifications
```
