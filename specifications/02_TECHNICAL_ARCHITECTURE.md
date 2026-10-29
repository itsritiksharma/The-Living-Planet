# Technical Architecture — The Living Planet

This document guides implementation across phases. Use the simplest architecture that supports the active phase. It is not permission to implement all future systems immediately.

## 1. Architecture principles

- Separate simulation rules from UI and transport.
- Make the authoritative world state explicit.
- Prefer pure functions for simulation calculations.
- Keep a reproducible event history.
- Use server authority for shared multiplayer state.
- Make game parameters configurable and documented.
- Avoid premature microservices and speculative abstractions.
- Support local single-player simulation during development, while making its status clear.
- Use stable identifiers for players, actions, events, buildings, projects, and worlds.

## 2. Suggested high-level components

### Client
Responsibilities:
- Render map and world indicators.
- Present action options and their known costs.
- Submit player intentions, not claimed outcomes.
- Display server-authoritative updates.
- Show event history, project progress, and scenario summary.
- Handle connection state and validation feedback.

### Simulation domain
Responsibilities:
- Define types and rules for world state.
- Validate actions against current state.
- Aggregate player actions for a turn.
- Apply production, consumption, regeneration, pollution, and ecosystem effects.
- Evaluate thresholds and events.
- Produce state changes and explanatory event records.
- Remain independent of React/Phaser/WebSocket implementation.

### Multiplayer/server layer
Responsibilities:
- Own authoritative shared world state.
- Authenticate/identify sessions at the level supported by the current phase.
- Validate incoming actions.
- Resolve turns and broadcast resulting state.
- Prevent clients from directly setting resource values or outcomes.
- Handle disconnects and invalid/stale actions gracefully.

### Persistence layer
Responsibilities in later phases:
- Save world snapshots and event history.
- Resume worlds after restart.
- Track schema versions and handle migrations.
- Avoid storing unnecessary personal data.

Persistence may be deferred for the initial local prototype if the limitation is clearly documented.

## 3. Domain model

A possible TypeScript-oriented model:

```ts
type WorldId = string;
type PlayerId = string;
type EventId = string;
type ProjectId = string;

interface WorldResources {
  water: number;          // normalized game units
  food: number;           // normalized game units
  energy: number;         // normalized game units
  ecosystemHealth: number;// normalized game units
  pollution: number;      // normalized game units
  communityTrust: number; // optional in early phase
}

interface WorldState {
  id: WorldId;
  turn: number;
  resources: WorldResources;
  players: Record<PlayerId, PlayerState>;
  projects: Record<ProjectId, CommunityProject>;
  history: WorldEvent[];
  configVersion: string;
}

interface PlayerState {
  id: PlayerId;
  displayName: string;
  availableActionPoints?: number;
  inventory?: Record<string, number>;
  chosenActions?: PlayerAction[];
}

type PlayerAction =
  | { type: "EXPAND_PRODUCTION"; targetId?: string }
  | { type: "CONSERVE_WATER" }
  | { type: "RESTORE_WATERSHED" }
  | { type: "INSPECT_SYSTEM" }
  | { type: "CONTRIBUTE_TO_PROJECT"; projectId: ProjectId; amount: number }
  | { type: "WAIT" };

interface WorldEvent {
  id: EventId;
  turn: number;
  type: string;
  summary: string;
  causes?: string[];
  deltas?: Partial<WorldResources>;
  visibility?: "public" | "participant";
}

interface CommunityProject {
  id: ProjectId;
  type: string;
  targetContribution: number;
  currentContribution: number;
  status: "open" | "in_progress" | "completed" | "failed";
}
```

This is an illustrative starting point. Adapt types to the repository and active phase. Do not add unused fields solely because they appear here.

## 4. Simulation API boundaries

Prefer pure, testable functions similar to:

```ts
validateAction(state, playerId, action) -> ValidationResult
resolveTurn(state, submittedActions, config) -> { nextState, events }
getScenarioOutcome(state, config) -> ScenarioOutcome
```

Rules:
- `resolveTurn` should not read the clock, network, browser globals, random unseeded values, or external services.
- If randomness is needed in a later phase, inject a seeded random source.
- Do not mutate the input state in place unless the codebase intentionally uses a documented immutable-state pattern.
- Clamp values to allowed ranges after applying a full rule set, not after every tiny intermediate step unless the math requires it.
- Preserve enough event information to explain why a state changed.
- A state transition should be reproducible from the same state, actions, and configuration.

## 5. Turn model

For a discrete-turn simulation:
1. Receive intentions.
2. Validate them against the same starting state.
3. Resolve conflicts and aggregate contributions.
4. Apply action effects.
5. Apply consumption and production.
6. Apply regeneration and depletion.
7. Apply pollution and ecosystem responses.
8. Evaluate stress thresholds and scenario events.
9. Clamp/validate state invariants.
10. Generate event records and snapshot.
11. Advance turn and broadcast state.

The order is part of the game's rules and must be documented. Do not let network arrival order silently decide outcomes. For simultaneous turns, define a deadline or explicit “ready” mechanism in a later multiplayer phase; do not invent a production-grade lobby for Phase 1.

## 6. Multiplayer authority and validation

In a shared-world mode:
- Client sends `{worldId, playerId/session, action, expectedTurn}` or equivalent.
- Server validates the player/session, current turn, action type, costs, limits, and target.
- Server computes outcomes.
- Server broadcasts the accepted action result and updated state.
- Reject stale turn submissions and malformed payloads.
- Apply rate limits if exposed to public networks.
- Never trust a client-supplied world state, resource balance, action outcome, or contribution total.
- Avoid leaking hidden/private information if later phases introduce it.

The first prototype can be single-player or local-hosted if necessary, but clearly label this. A fake multiplayer UI is not equivalent to multiplayer functionality.

## 7. Configuration and tuning

Keep simulation constants in one place, e.g. `simulationConfig.ts` or a JSON config. Document:
- Initial state.
- Action costs.
- Production rates.
- Consumption rates.
- Regeneration rates.
- Pollution generation.
- Thresholds.
- Scenario duration.
- Delayed-effect schedules.

Do not scatter unexplained numeric literals through UI components.

## 8. Suggested repository organization

Adapt to the existing repository; this is a guide, not a mandate.

```text
src/
  app/                 # route or app entry points
  components/          # reusable UI
  game/
    domain/            # types and invariants
    simulation/        # pure rules and turn resolution
    config/             # scenario parameters
    events/             # event descriptions and causal summaries
    state/              # client state and selectors
    rendering/          # map/tile rendering
  server/
    sessions/
    worlds/
    transport/
    persistence/
  tests/
docs/
  README.md
  00_PRODUCT_VISION.md
  01_PHASE_1_PROTOTYPE.md
  ...
IMPLEMENTATION_LOG.md
```

Do not create folders that have no code or purpose yet.

## 9. Persistence and versioning

When persistence is added:
- Store snapshots and/or event logs according to the performance needs.
- Include a schema/config version.
- Validate stored data on load.
- Provide migrations for intentional schema changes.
- Avoid silently rewriting old world histories when balancing constants change.
- Consider a world-specific simulation configuration so existing worlds do not unexpectedly change after an update.

## 10. Performance and scale

Phase 1 should target a small world and a handful of players. Do not optimize for thousands of concurrent players. Keep the simulation computationally simple and profile before adding complexity.

Future scale work may consider:
- Turn batching.
- Spatial partitioning.
- Snapshot intervals and event-log compaction.
- WebSocket room management.
- Simulation worker processes.
- Load testing and backpressure.

These are future options, not initial requirements.
