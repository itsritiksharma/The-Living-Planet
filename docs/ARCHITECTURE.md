# Architecture

The prototype follows Clean Architecture. Source dependencies point inward only, and
`tests/architecture/dependencyRule.test.ts` fails the build if any file breaks the rule.

```text
        ┌──────────────────────────── ui (React) ───────────────────────────┐
        │  components · GameClient (outbox, reconnect) · presenters          │
        └───────────────────────────────┬────────────────────────────────────┘
                                        │ wire protocol + view DTOs only
        ┌──────────────── infrastructure (frameworks & drivers) ────────────┐
        │  WebSocketGateway · GameController · MessageParser · Vite plugin   │
        │  InMemory* repositories · CryptoIdGenerator · composition root     │
        └───────────────────────────────┬────────────────────────────────────┘
                                        │ implements ports, calls use cases
        ┌──────────────────────── application ──────────────────────────────┐
        │  use cases · GameCommandBus (idempotency) · ports · view assembly  │
        └───────────────────────────────┬────────────────────────────────────┘
                                        │
        ┌────────────────────────── domain ─────────────────────────────────┐
        │  World (aggregate) · Player · CommunityProject · TurnSubmissions    │
        │  IndicatorSet · DisplayName · ScenarioCalendar (value objects)      │
        │  GameAction subclasses · factories · TurnResolver & domain services │
        └────────────────────────────────────────────────────────────────────┘
```

| Layer | May import | Must not contain |
|---|---|---|
| `domain` | `domain` | packages, I/O, clock, randomness, `process` (checked by a static test) |
| `application` | `domain`, `application`, `contracts` | packages, Node APIs, transport details |
| `contracts` | `contracts`; `domain` with **type-only** imports | runtime logic (types and constants only) |
| `infrastructure` | everything above | UI code |
| `ui` (and `main.tsx`) | `ui`, `contracts`, React | domain, application or server code |

## Domain (enterprise rules): `src/domain`

- **`World` (aggregate root):** owns the players, structures, project, event log and history points. Its
  methods enforce invariants: bounded indicators, finite land, unique names, a player limit, and
  `checkInvariants()`. Use cases always work on a fresh instance rehydrated from a snapshot. The resolver
  works on a `clone()`, so a `World` a caller holds never changes behind its back.
- **Entities** (`src/domain/entities`, together with `World`): `Player` (private credits; costs are charged exactly once), `Structure`, `CommunityProject`
  (proportional allocation of simultaneous offers; idempotent `startConstructionIfFunded` /
  `completeIfDue`), `TurnSubmissions` (idempotent `submit` / `cancel`) and `EventLog` (deterministic ids).
- **Value objects** (`src/domain/model`, with the snapshot types and labels): `IndicatorSet` (0–100, settled to one decimal place, immutable), `DisplayName`,
  `ScenarioCalendar`.
- **Actions (Command pattern):** `GameAction` with one subclass per intention. Each subclass knows its
  `cost`, `validate(world, player)` and `apply(player, aggregationContext)`. `ActionFactory` turns untrusted
  DTOs into actions and rejects any unexpected field.
- **Factories:** `WorldFactory` (new scenario, restart with the same group), `PlayerFactory`, `ActionFactory`.
- **Domain services (pure, deterministic):**
  - `TurnResolver`: the documented turn order. It is idempotent by turn number.
  - `FlowCalculator`: the stock-and-flow rules.
  - `EventNarrator`: causal history text.
  - `OutcomeClassifier`.
  - `EconomyPolicy`: income and shortage hardship.
  - `SystemReportBuilder`: the research report. Its projection runs the real resolver forward.

## Application (use cases): `src/application`

- **Use cases:** `JoinGame`, `ResumeSession`, `SubmitAction`, `CancelAction`, `ResolveTurn`,
  `StartNewScenario`, `InitializeWorld` and `GetPlayerView` (query).
- **Ports:** `WorldRepository`, `SubmissionRepository`, `SessionRepository`, `IdempotencyStore`,
  `IdGenerator`, `PresenceTracker`, `ChangeNotifier` and `Logger`. Phase 1 implements each in memory.
  A PostgreSQL adapter would implement the same interfaces.
- **`GameCommandBus`:** the single entry point for state changes (see Idempotency below).
- **Read models:** `PlayerViewAssembler` (plus `IndicatorPresenter`, `ActionOptionsAssembler` and
  `ScenarioSummaryAssembler`) builds what one viewer may see. The dashboard and the map share the same
  bands. Action costs and availability come from domain validation. Other players' pending choices and
  research reports never leave the server.

## Idempotency (three levels)

1. **Domain, by natural identity.**
   - Resolving turn *N* again returns `already_resolved` and changes nothing.
   - Re-submitting an identical action is `unchanged`; cancelling twice is harmless.
   - Admitting the same player id again is a no-op.
   - Wetland construction starts and completes only once.
   - Starting a new scenario is keyed by the ended world's id.
2. **Application, by command id.**
   - Every command carries a client-generated `commandId`. The bus stores each outcome together with a
     fingerprint of the request. A retry returns the original outcome (`replayed: true`) and is never
     re-executed. Reusing an id for a different request is rejected.
   - Commands run one at a time (`SerialQueue`), and saves use optimistic-concurrency revisions, so a turn
     can never be applied twice. One retry is attempted after a conflict.
   - Deterministic rejections are remembered. Unexpected errors are not, so a retry can still succeed.
3. **Client:** `GameClient` keeps unacknowledged commands in an outbox. After a reconnect it resumes the
   session and resends them with the same ids. This is safe because of level 2. It also covers a join whose
   welcome was lost: no duplicate player is created.

## A turn, end to end

1. The browser sends `{type:'submitAction', commandId, expectedTurn, action}`.
2. `MessageParser` checks the size, JSON format and exact field set.
3. `GameController` takes the player id from the session bound to the connection, never from the message.
4. `GameCommandBus` deduplicates the command, queues it and calls `SubmitAction`.
5. `SubmitAction` builds the action with `ActionFactory`, validates it with `World.validate` and records it
   in `TurnSubmissions`.
6. Once every connected player (`PresenceTracker`) is ready, `ResolveTurn` re-validates the submissions,
   calls `TurnResolver.resolve(world, turn, submissions)`, checks invariants and saves with the expected
   revision.
7. `WebSocketGateway` (the `ChangeNotifier`) pushes each connection its own `PlayerViewDTO`.

## Security notes (local prototype)

- The server is authoritative. Clients send intentions only. Unknown fields such as `credits` are rejected,
  both at the wire level and by `ActionFactory`.
- WebSocket upgrades are accepted only on `/ws` and only from the same origin (this blocks cross-site
  WebSocket hijacking). Messages are capped at 4 KB, and heartbeats drop dead connections.
- Session tokens are random UUIDs, kept per tab in `sessionStorage` and never broadcast.
- Not implemented (documented limitations): rate limiting, accounts, TLS and persistence. The server binds
  to localhost unless you pass `--host`.

## Hosting

`livingPlanetGameServer()` (a Vite plugin) attaches the game server to Vite's own HTTP server in dev and
preview, so one command serves the page and the WebSocket on one port. The server code depends only on
`node:http`. `attachGameServer(httpServer)` can be called from a standalone Node process later without
changing any use case.
