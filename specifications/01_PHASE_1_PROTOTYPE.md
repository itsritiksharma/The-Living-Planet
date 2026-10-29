# Phase 1 — The River Valley Prototype

## Status and authority

This document defines the **only implementation scope for the first playable milestone**. Later-phase documents are context only. Do not implement planets, advanced political systems, complex character psychology, or a full economy during this phase.

## 1. Prototype objective

Build a small, understandable, playable simulation that proves the central loop:

**Players make locally rewarding choices → shared resources and ecological conditions change → delayed consequences emerge → players can cooperate or continue harmful behavior → the world records the outcome.**

The prototype should be small enough to finish and test. It should prioritize working systems over visual polish.

## 2. Scenario: The River Valley

A small settlement sits beside a river. It has:
- A limited freshwater supply.
- Farmland that produces food.
- A forest that supports watershed health.
- A simple energy source.
- A small population of players sharing the same world.
- A limited number of turns representing months or seasons.

The settlement begins in reasonably healthy condition. Expansion improves employment or production early on, but can increase water demand, emissions, and ecosystem pressure. The world should not immediately punish every harmful choice; consequences can be delayed.

## 3. Scope

### Required
1. A small 2D/isometric-style map or clear tile-based representation.
2. One shared world state.
3. Four primary resource/condition indicators:
   - Water availability.
   - Food availability.
   - Energy availability.
   - Ecosystem health.
4. Basic player identity/session handling sufficient for the prototype.
5. A small action set.
6. A deterministic turn/tick simulation.
7. At least one delayed consequence and one feedback loop.
8. One collective decision or contribution action.
9. One contextual reflection event inspired by self-inquiry.
10. A world-history/event log that explains important changes.
11. A simple end-of-scenario summary.
12. Tests for core simulation rules.

### Not required
- Multiple planets.
- Space travel.
- Detailed climate physics.
- Real-world forecast accuracy.
- Complex financial markets.
- Detailed character needs or household simulation.
- Full political systems, elections, laws, or institutions.
- Sophisticated AI agents or NPCs.
- Voice chat, friend lists, matchmaking, or public server deployment.
- Monetization, advertising, payments, or third-party analytics.
- A comprehensive AP course or philosophical curriculum.
- Production-grade 3D graphics.
- Huge maps or thousands of simultaneous players.

## 4. Suggested technical defaults

Use these only if the existing repository does not already have a sound stack:
- Frontend: React + TypeScript.
- 2D game rendering: Phaser, or a lightweight grid/map rendered in React for the very first build.
- Server: Node.js + TypeScript.
- Shared-state transport: WebSocket.
- Persistence: PostgreSQL if persistent sessions are needed; in-memory state is acceptable for an early local demonstration if explicitly documented.
- Tests: the existing project test runner; otherwise choose a minimal TypeScript-compatible test setup.

Do not replace an existing stack without explaining why. Keep the simulation logic independent from the rendering layer.

## 5. Map and initial world

Create a compact map with a river, forest, farmland, residential area, and an industrial/energy site. The map can be stylized and need not be visually elaborate.

The map should communicate:
- Where water comes from and where it is used.
- Where food is produced.
- Which land supports ecosystem health.
- Where production/energy infrastructure sits.
- Which structures/actions belong to which player, if ownership is shown.

The visual map must correspond to the simulation state. Do not make buildings decorative if they imply an effect that does not exist.

## 6. Resources and state model

Use a small set of understandable values. Suggested initial ranges are 0–100 for normalized indicators. These are game units, not scientific units.

Required state:
- `turn`: integer.
- `water`: normalized available freshwater, 0–100.
- `food`: normalized food stock, 0–100.
- `energy`: normalized available energy, 0–100.
- `ecosystemHealth`: normalized ecosystem condition, 0–100.
- `pollution`: normalized accumulated local pollution, 0–100.
- `communityTrust`: normalized trust, 0–100 (can be introduced if needed for the collective decision).
- `players`: players and their current actions/contributions.
- `history`: timestamped/turn-indexed events and state changes.

Use a central, typed state model. Validate bounds and avoid scattered direct mutation from UI components.

### Initial-state guidance
Choose starting values that permit a few turns of ordinary play before serious stress. Do not tune the world so collapse is inevitable regardless of choices. Document initial values in a single configuration file.

## 7. Player actions

Implement a small action menu. At minimum, support:
- **Expand production:** provides a short-term benefit such as energy or food capacity, but increases water demand and pollution over time.
- **Conserve water / improve efficiency:** reduces water use or increases the useful output per unit of water.
- **Restore forest / watershed:** costs a resource or action opportunity and improves ecosystem health gradually.
- **Research / inspect:** reveals an explanatory relationship or a forecast/risk indicator based on the current simulation rules.
- **Contribute to a shared response:** spends a small amount of player-controlled resource or an action to support a community project.
- **Wait / take no action:** allows the world simulation to continue without intervention.

Keep action effects understandable. If an action has a cost, show it before confirmation. If an effect is delayed, say so.

Do not implement every action as a simple plus/minus to the same score. Actions should affect relevant systems.

## 8. Simulation turn order

Use a deterministic and documented turn order. Suggested order:
1. Validate player actions.
2. Aggregate all actions for the turn.
3. Apply production, consumption, conservation, and restoration effects.
4. Apply resource regeneration and depletion.
5. Apply pollution accumulation and ecosystem response.
6. Apply any threshold/event rules.
7. Clamp normalized indicators to valid bounds.
8. Record events and a state snapshot.
9. Advance the turn and broadcast the authoritative result.

Use simultaneous action resolution if practical, so player order does not unfairly decide the outcome. If the first version uses sequential turns, clearly communicate that behavior.

## 9. Feedback loop requirement

Implement at least one legible reinforcing loop, for example:

More production → more water/energy demand and pollution → ecosystem stress → lower food/water resilience → pressure to expand extraction or production to cover shortages.

The loop must be interruptible by sensible action. Do not create a deterministic doom spiral where all choices lead to the same failure.

Model delayed consequences: a production expansion may yield a near-term benefit but add a future cost. The user should be able to see the cause in the event history.

Avoid arbitrary exponential multiplication. Use a simple documented model for Phase 1, with gradual changes and a threshold-based increase in risk if useful. Treat all values as game abstractions.

## 10. Collective action

Implement one shared response, such as a watershed restoration project:
- Players can contribute a limited resource or action.
- The contribution is aggregated.
- When a threshold is reached, the project begins or completes.
- Its benefit is applied according to a documented rule.
- The history log records who contributed and what changed, without exposing private information beyond what the game displays.

The project must make the free-rider problem understandable: a player can benefit from a shared outcome without contributing, unless the design explicitly introduces a contribution rule.

## 11. Philosophical inquiry — minimal version only

Include one contextual prompt tied to a real choice, such as expanding production or purchasing an upgrade.

Example:
> What is driving this decision right now?

Possible responses:
- Practical need.
- Comfort.
- Status or comparison.
- Fear of falling behind.
- Habit; I have not examined the assumption.

This prompt is reflective, not diagnostic. It must not automatically award ecological bonuses or shame a player. The player can dismiss it and proceed. A short after-action reflection may ask whether the decision matched the stated motivation.

Do not build a general personality model, hidden moral score, psychological diagnosis, or full AP content library in Phase 1.

## 12. UI requirements

The interface should include:
- World/map view.
- Resource dashboard.
- Current turn and action controls.
- Clear action costs and known consequences.
- A visible indication of delayed risks where the simulation can justify it.
- Event/history panel with cause-and-effect explanations.
- Shared project status and contribution progress.
- A short reflection prompt at a relevant decision.
- Scenario outcome summary when the turn limit is reached or the world reaches a defined failure state.

The UI must not rely only on color to communicate risk. Pair color with text, iconography, or labels. It should remain usable on common desktop and mobile widths.

## 13. End conditions

Use a fixed scenario length (for example, 12–20 turns) and/or clear failure conditions. Exact tuning is an implementation choice to be documented.

Possible outcomes:
- **Resilient settlement:** essential resources remain available and ecosystem health is stable or recovering.
- **Stressed settlement:** the world survives but faces substantial shortages or degraded resilience.
- **Crisis/collapse:** one or more essential systems fall below a defined critical threshold.

Do not define success solely as maximizing all meters. The final report should describe trade-offs, distribution of harm if modeled, and the sequence of decisions/events.

## 14. Event history and causal explanation

Every important state change should have a readable explanation, e.g.:
- “Production expanded: energy capacity rose this turn; future water demand and pollution increased.”
- “Forest restoration began: no immediate full recovery; watershed resilience may improve over subsequent turns.”
- “Water fell below the stress threshold: crop output was reduced.”
- “Community project reached its contribution target and improved watershed health.”

These messages must be generated from actual state transitions, not static flavor text.

## 15. Acceptance criteria

Phase 1 is complete only when:
- [ ] The app starts using documented local commands.
- [ ] The map and dashboard show the same underlying world state.
- [ ] A player can choose each required action.
- [ ] Action costs and effects are applied consistently.
- [ ] The world advances using a deterministic turn/tick system.
- [ ] Water, food, energy, ecosystem health, and pollution change through explicit rules.
- [ ] At least one delayed consequence can be observed across multiple turns.
- [ ] At least one reinforcing feedback loop is implemented and can be interrupted.
- [ ] A shared project accepts contributions and applies its outcome.
- [ ] The reflection prompt is contextual and non-coercive.
- [ ] The event history explains significant changes accurately.
- [ ] The scenario produces different outcomes under different strategies.
- [ ] Automated tests cover resource bounds, turn resolution, action costs, feedback rules, and collective project thresholds.
- [ ] No future-phase feature is required to make the prototype work.
- [ ] Known limitations and game-model assumptions are documented.

## 16. Recommended implementation order

1. Inspect repository and document existing setup.
2. Define typed world-state and action models.
3. Implement pure simulation functions and unit tests.
4. Build a minimal dashboard that renders state.
5. Add action selection and turn resolution.
6. Add event history with causal messages.
7. Add map representation.
8. Add shared project contribution logic.
9. Add one reflection prompt.
10. Add scenario outcome summary.
11. Add multiplayer transport only to the level the environment can support; never present local-only state as real multiplayer.
12. Run tests, fix issues, and update `IMPLEMENTATION_LOG.md`.

## 17. Phase 1 deliverable

Deliver a playable, locally runnable prototype with a documented simulation model, readable UI, test coverage for core rules, and a concise report explaining how to run it and what remains out of scope.
