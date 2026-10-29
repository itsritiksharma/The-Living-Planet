# Working Rules for the AI Coding Agent

## Mission

Build **The Living Planet**, a multiplayer-capable ecological civilization simulation where individual decisions and collective systems affect a shared environment. The intended experience lets players see how immediate incentives, delayed consequences, social behavior, and ecological limits interact.

## How to use this specification

1. Read `00_PRODUCT_VISION.md` for enduring product intent.
2. Implement only the active phase in the relevant phase document. The active initial phase is `01_PHASE_1_PROTOTYPE.md`.
3. Use `02_TECHNICAL_ARCHITECTURE.md` as a default design unless the repository has a sound existing architecture.
4. Treat later phase documents as context only. Do not implement them in Phase 1.
5. Use `06_TESTING_AND_DEFINITION_OF_DONE.md` to verify work.

## Repository-first rule

Before changing files:
- Inspect the repository structure, package manager, scripts, dependencies, environment configuration, and current app entry points.
- Identify what already works.
- Summarize the plan and likely files to change.
- Do not overwrite an existing project or regenerate its scaffolding unnecessarily.

## Engineering constraints

- Prefer TypeScript and clear domain types if the existing stack supports them.
- Keep simulation rules separate from UI components.
- Keep simulation state changes deterministic and testable.
- In a multiplayer build, the server is authoritative for shared world state and resource changes.
- Validate all client-originated actions on the server.
- Do not trust client-submitted resource values, positions, prices, outcomes, or timestamps.
- Avoid adding dependencies unless they materially simplify the implementation.
- Never hard-code secrets. Provide `.env.example` when environment variables are required.
- Do not add analytics, telemetry, third-party tracking, accounts, payment flows, or external APIs unless explicitly required.
- Avoid premature abstractions, complex microservices, and unnecessary infrastructure.
- Keep the interface readable on desktop and mobile widths.
- Use accessible labels, keyboard support, visible focus states, and sufficient contrast.
- Include useful empty, loading, disconnected, and error states.
- Do not fabricate scientific certainty. Label game parameters as simulation assumptions.

## Interaction and autonomy

- Make reasonable low-risk implementation decisions without asking the user about every detail.
- If a choice is irreversible, security-sensitive, costly, or would substantially expand scope, explain the trade-off and ask before proceeding.
- Do not deploy publicly, create paid cloud resources, publish secrets, or run destructive commands without explicit authorization.
- Do not claim multiplayer is functional if the implementation is only local or mocked.
- If the existing environment cannot support a requested feature, state the limitation and deliver the best working alternative.

## Completion report

At the end of each phase, report:
- What was implemented.
- Files added or changed.
- Commands run and test results.
- Known limitations and unimplemented requirements.
- How to run the application locally.
- The next smallest recommended step.

Update `IMPLEMENTATION_LOG.md` with dated, factual progress. Do not mark an acceptance criterion complete unless it has been verified.
