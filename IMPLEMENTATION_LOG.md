# Implementation log

## 2026-10-25: Phase 1 (River Valley prototype)

### Repository inspection (before coding)
- Greenfield: only `specifications/` existed. There was no stack, no code, and the folder is not a git repo
  (no repo was created).
- Toolchain: Node 25.8.0 (an end-of-life odd release) and npm 11.11 on WSL2. The project sits on `/mnt/c`.
- The newest versions of Vitest (5) and jsdom (30) exclude Node 25 in their engine ranges, so compatible
  versions were pinned: Vite 7.3.7, React 19.3.1, TypeScript 5.9.3, ws 8.22.0, Vitest 4.1.12, jsdom 29.1.1
  and Testing Library 16.3.3.

### Decisions (with the user)
- **Framework.** The user asked whether to use Next.js or Svelte, and said to use React if React works
  fine. It does, so the stack is React + Vite.
  - Next.js 16 would need a custom server for WebSockets and would need its telemetry disabled.
  - Svelte 5 would work but is not the spec's default.
- **Architecture.** The user asked mid-build for Clean Architecture, with classes, factories and entities,
  and for idempotent behaviour. The result is layered domain / application / infrastructure / ui, with the
  dependency rule enforced by a test. Idempotency works at three levels (see `docs/ARCHITECTURE.md`).
- **Multiplayer:** real WebSocket multiplayer with an authoritative, in-memory server, hosted on Vite's HTTP
  server through a plugin (one command, one port). Each browser tab is a player.
- **Omitted on purpose:**
  - `communityTrust` is optional in the spec and would have been a decorative meter.
  - Reflection answers stay client-side, so they can never influence the simulation.
- **Tuning:** a balance model was simulated during planning, and the class-based engine reproduces it
  (see the table in `docs/SIMULATION_MODEL.md`).

### Work completed
1. Toolchain scaffold with pinned versions.
2. Domain: entities, value objects, action classes, factories, `TurnResolver`, flows, narration, outcomes,
   research reports.
3. Application: use cases, ports, idempotent command bus, read models.
4. Infrastructure: in-memory repositories, strict message parser, controller, WebSocket gateway (same-origin
   check, 4 KB cap, heartbeat), Vite plugin, composition root.
5. UI: map, dashboard, action panel with cost and effect previews and the optional reflection, shared
   project, players, research report, history, end summary, connection states, and a client outbox with
   reconnect.
6. Documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/SIMULATION_MODEL.md` and this log.
7. Dev-only visual check pages in `dev/`.

### Commands run and results
- `npm install`: 149 packages, no errors.
- `npm run typecheck`: clean.
- `npm test`: **276 passed, 0 failed (18 files)**.
  - domain 79, application 22, scenarios 9, infrastructure 28
  - architecture 112 (one dependency-rule check per source file, plus domain-purity checks)
  - ui 26
- `npm run build`: succeeds (JS 257.8 kB, 80.5 kB gzipped). Verified that no domain or server code is in
  the client bundle.
- **Live smoke test with `npm run dev`:** HTTP 200, and the game server announced itself. A scripted bot
  (Node's built-in WebSocket) checked the following:
  - Two players joined and played 3 simultaneous turns, with identical authoritative state for both.
  - Wetland contributions were tracked publicly.
  - The research report stayed private.
  - A replayed `commandId` returned `replayed: true` without re-applying.
  - Reconnecting resumed the same player.
  - A message carrying `credits` was rejected.
- **The same smoke test with `npm run build && npm run preview`:** passed, with the same deterministic
  turn-3 summary as the dev run.
- **Visual check (headless Windows Chrome, temporary profile):**
  - Mid-game desktop in dark mode, the end screen in light mode, and true 390 px and 360 px viewports
    (via iframes): no horizontal overflow.
  - Found and fixed misleading wording after a scenario ends (project "open", "known risks this turn", the
    research prompt), plus a cramped summary table. The summary now spans the full width. Regression
    assertions were added.
- Mistakes in my own test scripts were fixed along the way: a test script and the smoke bot each scheduled
  an unaffordable action, which the engine correctly rejected; and a few UI test queries were wrong. No
  product bug was masked.

### Phase 1 acceptance criteria (§15)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | App starts using documented local commands | **Passed** | `npm install && npm run dev` (README), live bot smoke test; `npm run preview` also verified; `vitePlugin.test.ts` |
| 2 | Map and dashboard show the same world state | **Passed** | `ui/gameScreen.test.tsx` (map labels = dashboard values = world), `application/playerView.test.ts`, screenshots |
| 3 | A player can choose each required action | **Passed** | `ui/actionPanel.test.tsx` (all 7 options submit the right intention); use-case and WebSocket tests; smoke bot |
| 4 | Action costs and effects applied consistently | **Passed** | `domain/turnResolver.test.ts` (each cost charged exactly once; blocked actions not charged); option cost = domain cost; `flows.test.ts` |
| 5 | Deterministic turn/tick system | **Passed** | same input → identical output; submission order irrelevant; input never mutated; idempotent per turn; purity static test; dev and preview runs identical |
| 6 | Water, food, energy, ecosystem, pollution change via explicit rules | **Passed** | `domain/flows.test.ts` (each formula); each indicator ends at clamp(start + its flows) |
| 7 | A delayed consequence observable across turns | **Passed** | `domain/dynamics.test.ts`: restoration on t+1…t+4; wetland +2 turns; early expansion → pollution threshold crossed later, with sources named |
| 8 | A reinforcing feedback loop that can be interrupted | **Passed** | `dynamics.test.ts`: the loop persists when everyone waits and stops after conservation; scenario tests |
| 9 | A shared project accepts contributions and applies its outcome | **Passed** | entity allocation tests; resolver timing and effects; free-rider scenario; WebSocket and smoke contributions |
| 10 | The reflection prompt is contextual and non-coercive | **Passed** (behaviour verified) | UI tests: shown only for expansion, skippable, identical payload, can be hidden. Answers never leave the browser (the protocol rejects extra fields). |
| 11 | Event history explains significant changes accurately | **Passed** (accuracy verified) | `historyAndBounds.test.ts`: summary deltas = snapshot changes; threshold events = real crossings; action events = real structures |
| 12 | Different outcomes under different strategies | **Passed** | `scenarios/playthroughs.test.ts`: resilient, stressed and crisis all occur across 7 strategies, with causal-consistency checks |
| 13 | Tests cover bounds, resolution, costs, feedback, project thresholds | **Passed** | 276 tests, including 200 seeded random playthroughs that keep every invariant |
| 14 | No future-phase feature required | **Passed (by review, not an automated test)** | no institutions, NPCs, planets, accounts, persistence or deployment |
| 15 | Known limitations and assumptions documented | **Passed (by review)** | README, `docs/SIMULATION_MODEL.md`, `docs/ARCHITECTURE.md`, this log |

**Not verified (honest gaps):**
- Usability with real players (testing doc §5).
- A screen reader or automated accessibility audit. Semantics, labels, focus styles and text-plus-colour
  status are implemented; contrast was chosen by design but not measured with a tool.
- Disconnect and reconnect are tested programmatically, not with people.
- Scientific validity is out of scope by design.

### Known limitations
- The world and sessions are in memory and reset on restart.
- One shared world, up to 6 players, no accounts and no rate limiting (local/LAN use only).
- Map tiles are not individually focusable; text descriptions and a map summary are provided instead.
- WSL `/mnt/c` is slower, and hot reload uses polling there.
- Node 25 is end-of-life; Node 24 LTS is recommended.

### Next smallest recommended step
Run a short play session with 2–3 real people, observing the usability questions from testing doc §5.
Then add persistence behind the existing `WorldRepository` / `SessionRepository` ports (for example
SQLite or PostgreSQL), so a restart no longer erases a game.
