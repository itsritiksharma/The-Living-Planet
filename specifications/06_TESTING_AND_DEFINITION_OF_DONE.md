# Testing, Quality, and Definition of Done

## 1. General quality gate

A phase is not complete because the UI renders or the coding agent has written the expected files. It is complete when the required behavior works and has been verified.

## 2. Simulation unit tests

At minimum, test:
- Initial state is valid.
- Every resource remains within its documented bounds.
- Action costs are deducted exactly once.
- Invalid actions do not partially mutate the world.
- The same initial state, actions, and config produce the same next state.
- Turn order is deterministic.
- Resource regeneration and depletion follow the documented formulas.
- Pollution accumulates and is removed only according to explicit rules.
- Delayed effects occur on the intended turns.
- Threshold events fire only when their conditions are met.
- Feedback loops can be interrupted by valid actions.
- Shared-project contributions aggregate correctly.
- Project thresholds and completion effects are correct.
- Outcome classification matches the defined conditions.
- Event messages correspond to actual state changes.

## 3. Integration tests

Test:
- UI actions reach the simulation layer correctly.
- The displayed dashboard matches the authoritative state.
- Turn advancement refreshes map, dashboard, history, and project progress together.
- Invalid or stale actions produce useful errors.
- Disconnect/reconnect behavior is understandable if multiplayer is implemented.
- Server rejects client attempts to set arbitrary resource balances or outcomes.

## 4. Scenario tests

Run at least three repeatable playthroughs:
1. Expansion-focused strategy.
2. Conservation/restoration-focused strategy.
3. Mixed strategy with collective contributions.

The results should differ in ways explained by the simulation rules. Do not assert that one path must always win; verify causal consistency and avoid a predetermined outcome.

## 5. Usability tests

A new player should be able to answer:
- What can I do this turn?
- What will this action cost?
- What is the likely immediate effect?
- What future risk is known or uncertain?
- What changed after the turn?
- Why did it change?
- How can I contribute to a shared response?
- What does the final outcome mean?

Use labels and text in addition to color. Support keyboard navigation, visible focus, semantic controls, and readable contrast.

## 6. Security and privacy

- Validate action payloads on the server.
- Do not trust client state.
- Do not expose secrets in source code or logs.
- Do not collect unnecessary personal data.
- Do not add external analytics without explicit authorization.
- If accounts are added later, use established authentication practices rather than homemade password handling.
- If public multiplayer is added, consider rate limiting, input validation, abusive content handling, and protection against resource-spam attacks.

## 7. Performance

Phase 1 should be tested with a small settlement and a handful of simulated players. Do not prematurely optimize for massive scale.

Avoid:
- Recomputing the full simulation on every UI render.
- Broadcasting large redundant payloads unnecessarily.
- Rendering thousands of objects when a compact grid is enough.
- Unbounded event histories in long-running sessions without a retention plan.

## 8. Documentation requirements

Keep updated:
- Local setup instructions.
- Environment variable example file, if needed.
- Simulation rules and configuration.
- Known limitations.
- How to run tests.
- Phase acceptance checklist.
- `IMPLEMENTATION_LOG.md` with factual progress.

## 9. Final completion report template

```text
Phase:
Summary:
Files added/changed:
How to run:
Tests run:
Test results:
Acceptance criteria passed:
Known limitations:
Assumptions:
Recommended next step:
```

Never state “all tests pass” unless tests were run. Never state “multiplayer works” if only a local simulation was implemented. Clearly distinguish implemented, partially implemented, mocked, and deferred behavior.
