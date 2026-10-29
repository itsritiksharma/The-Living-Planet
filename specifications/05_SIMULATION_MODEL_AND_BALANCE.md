# Simulation Model and Balance Guidelines

## 1. Purpose

This document describes how to create a readable, testable simulation. It does not provide validated climate projections. The initial game uses abstract game units and simplified causal relationships.

## 2. Model the right kinds of processes

Different systems need different dynamics:
- **Stocks:** water reserves, food stores, accumulated pollution, forest cover.
- **Flows:** extraction, regeneration, consumption, production, emissions, restoration.
- **Delays:** forests take time to recover; infrastructure takes time to build; emissions persist.
- **Thresholds:** below a level, a resource or ecosystem may become stressed.
- **Feedback loops:** one change alters conditions that influence future behavior.
- **Distribution:** a world average can hide communities suffering severe impacts.
- **Uncertainty:** the exact timing or magnitude of future events may not be known.

Do not force every variable to behave exponentially. Exponential growth can describe some processes over some intervals, but resource depletion, ecological response, climate effects, and social behavior differ.

## 3. A simple stock-flow example

For a normalized water stock:

```text
water_next =
  water_current
  + natural_recharge
  + conservation_savings
  - household_use
  - agricultural_use
  - industrial_use
  - drought_loss
```

For accumulated pollution:

```text
pollution_next =
  pollution_current
  + emissions_added
  - pollution_removed
```

For ecosystem health, use a documented function that accounts for relevant pressures and recovery. Avoid claiming that a single normalized number represents the whole biosphere.

All values should be bounded where the game model requires it, but do not clamp intermediate values so aggressively that it hides bugs. Validate the final state and log unexpected transitions.

## 4. Delayed consequence example

Production expansion can:
1. Increase near-term energy or output capacity.
2. Increase recurring water and energy demand.
3. Add pollution each turn.
4. Increase pressure on ecosystem health.
5. Reduce future resilience or crop output if a threshold is crossed.

The event log should identify the original action and the later effects. The game should not falsely attribute every drought or decline to one player's action if the simulation contains multiple causes.

## 5. Feedback loop example

```text
More production
  -> greater resource demand and pollution
  -> ecosystem stress
  -> lower food/water resilience
  -> insecurity and pressure for short-term extraction
  -> further resource demand
```

Counteracting actions might include conservation, restoration, demand reduction, cleaner energy, fair allocation, or a coordinated project. Each action should have realistic costs and time delays within the game's abstraction.

## 6. Tipping points and irreversible change

Use threshold events carefully. They can create dramatic gameplay, but:
- State that thresholds are game parameters.
- Avoid exact real-world predictions without scientific validation.
- Distinguish reversible stress from severe or potentially irreversible change.
- Allow uncertainty in event timing or outcome where appropriate.
- Do not make all worlds inevitably collapse.
- Ensure player choices can change risk, severity, or recovery odds.

A threshold should alter relevant mechanics, not merely trigger a dramatic message.

## 7. Balance philosophy

The game is not balanced by making every path equally sustainable. It is balanced by making trade-offs understandable and outcomes causally coherent.

- Short-term expansion can be attractive but create future liabilities.
- Conservation can have opportunity costs and delayed benefits.
- Technology can reduce impacts while requiring resources and time.
- Cooperation can be powerful but require trust, coordination, and fair burden-sharing.
- Reform can be opposed by players who benefit from existing arrangements.
- Inaction can be individually convenient while increasing collective risk.
- A powerful player may externalize costs onto a vulnerable community.

Do not give a “green” action an automatic success bonus without modeling its actual effects.

## 8. Avoid exploitative or incoherent mechanics

- Do not make resource collapse inevitable regardless of player behavior.
- Do not let players generate unlimited resources through a trivial loop.
- Do not let conservation or restoration be costless and instantaneous unless explicitly intended for a tutorial.
- Do not hide a cost that the player could reasonably know; uncertainty should be purposeful, not deceptive UI.
- Do not make one meter stand in for all ecological conditions.
- Do not claim a simulated value is a scientific fact.
- Do not punish a player for an event the game gave them no meaningful opportunity to understand or respond to.
- Do not treat poor players' survival decisions as equivalent to powerful actors' deliberate obstruction.

## 9. Scientific grounding as the game evolves

When adding realistic climate claims:
- Prefer authoritative scientific sources and document them.
- Distinguish observed facts, projections, model assumptions, and game abstractions.
- Document units and timescales.
- Have scientifically complex mechanics reviewed where feasible.
- Avoid misleading precision.
- Do not turn uncertainty into an excuse to imply that risks are negligible.

The prototype may use invented numbers for balance, but it must label them as game units.
