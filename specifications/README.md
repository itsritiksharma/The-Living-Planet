# The Living Planet — AI Agent Build Pack

This repository of specifications describes a climate-change civilization simulation. Read the files in the order below. Treat `00_PRODUCT_VISION.md` as enduring project context and `01_PHASE_1_PROTOTYPE.md` as the only implementation scope for the first milestone.

## Documents

1. `00_PRODUCT_VISION.md` — core premise, design principles, terminology, boundaries, and overall direction.
2. `01_PHASE_1_PROTOTYPE.md` — the first playable prototype only; implementation scope and acceptance criteria.
3. `02_TECHNICAL_ARCHITECTURE.md` — suggested architecture, domain model, server-authoritative simulation, and engineering constraints.
4. `03_PHASE_2_SOCIAL_AND_PHILOSOPHICAL_SYSTEMS.md` — future phase: richer behavior, institutions, collective action, and AP-inspired inquiry.
5. `04_PHASE_3_PLANETS_AND_EXPANSION.md` — future phase: multiple planets, travel, settlement, and interplanetary progression.
6. `05_SIMULATION_MODEL_AND_BALANCE.md` — simulation concepts, resource flows, feedback loops, uncertainty, and balancing guidance.
7. `06_TESTING_AND_DEFINITION_OF_DONE.md` — test strategy, acceptance standards, accessibility, security, and quality gates.
8. `AGENT_WORKING_RULES.md` — instructions for AI coding agents working in this repository.

## Non-negotiable workflow

- Build Phase 1 first. Do not implement future-phase features just because they are described elsewhere.
- Before coding, inspect the existing repository and report its framework, current state, and proposed minimal changes.
- If the repository already has a working stack, prefer adapting it over replacing it without a compelling reason.
- Work in small, testable increments. Keep the app runnable after each increment.
- Do not claim a feature works unless it has been implemented and tested.
- If a requirement is ambiguous, choose the smallest reversible implementation, document the assumption, and continue. Ask only when the ambiguity blocks safe progress.
- Maintain a concise `IMPLEMENTATION_LOG.md` and update it at the end of each meaningful work session.
- Use real, deterministic simulation rules in the prototype, not decorative meters that change arbitrarily.
- Do not represent illustrative game values as scientific forecasts.
