# Simulation model: River Valley (Phase 1)

> **Simulation assumptions.** Every number here is an invented game unit, chosen so that cause and effect
> are legible over 16 turns. Nothing is calibrated to real hydrology, ecology or economics, and no output is
> a forecast. All values live in one file, `src/domain/config/riverValley.ts` (config version
> `river-valley-1.0.0`).

## State

| Indicator | Start | Stress threshold | Critical threshold | Meaning |
|---|---|---|---|---|
| Water | 70 | below 40 | below 15 | freshwater available (river and reservoir) |
| Food | 60 | below 30 | below 10 | food stores |
| Energy | 60 | below 25 | below 10 | available energy |
| Ecosystem health | 75 | below 40 | below 25 | forests, soil, riverbanks; drives recharge and absorption |
| Pollution | 15 | above 40 (damage) | 60 or more (severe) | accumulated local pollution (a stock) |

- Indicators are bounded to 0–100. They are clamped and rounded to 0.1 after each turn, and anything lost to
  clamping is reported in the history (for example "Food ran out: 3.4 units of demand went unmet").
- **Land and capacity are finite:** 3 initial farms plus 5 meadow plots; 2 initial industry units plus 5
  lots; up to 5 water-efficiency upgrades; 6 restoration sites. Structures record their owner and the turn
  they were built.
- **Players** start with 10 private credits and earn 2 base income per turn. Up to 6 players.
- **Calendar:** 16 turns = 4 years of Spring/Summer/Autumn/Winter.

## Per-turn flows

Every multiplier, threshold effect and income rule uses **start-of-turn** values. A change therefore takes
effect from the following turn, and the turn that crosses a threshold always carries a warning.

- **Households:** need 6 water, 9.5 food and 7 energy, and produce 0.5 pollution. Each new year (turns 5, 9
  and 13) needs grow by +0.5 water, +1 food and +1 energy.
- **Farm:** food = 3 × yield; uses 1.5 water and 0.5 energy; adds 0.3 pollution; owner earns +1 credit.
- **Industry unit:** +4 energy (×0.7 when water is critical); uses 1 water; adds 1.2 pollution; owner earns
  +2 credits (×0.5 when water is critical).
- **Water:** + 14 × season (Spring 1.3, Summer 0.6, Autumn 1.0, Winter 1.1) × (0.5 + 0.5 × ecosystem/100),
  plus 2 more once the wetland is complete, − demand × (1 − 0.1 × efficiency upgrades).
- **Crop yield:** 1.0, or ×0.7 when water is below 40 (×0.3 below 15). It is further multiplied by 0.8 when
  ecosystem health is below 40, by 0.85 when pollution is 60 or more, and by 0.85 when energy is below 25.
- **Pollution:** + emissions − 8% of pollution − 3 × ecosystem/100, minus 3 more once the wetland is complete.
- **Ecosystem health:**
  - +4% of the gap to 100 when pollution is below 40 and water is 40 or more (natural recovery);
  - −0.15 per point of pollution above 40;
  - −2 over-extraction while water is below 40 (−4 below 15);
  - −3 per newly cleared meadow;
  - +2 per growing restoration plot;
  - +4 when the wetland completes.
- **Shortage hardship:** each essential (water, food, energy) below its stress threshold costs every player
  1 credit, never taking anyone below 0.

## Actions

Each player takes one action per turn. Costs are shown before confirming and charged exactly once.

| Action | Cost | Effect |
|---|---|---|
| Expand production: farmland | 5 | Takes a meadow plot. Food immediately, plus recurring water, energy and pollution; −3 ecosystem for clearing. |
| Expand production: industry | 6 | Takes an industrial lot. Energy and private income immediately, plus recurring water and pollution. |
| Conserve water | 4 | A permanent −10% to total water use (up to 5 upgrades); each upgrade's pumps use 0.3 energy. |
| Restore forest/watershed | 3 | No immediate effect; +2 ecosystem on each of turns t+1 … t+4. |
| Research / inspect | 0 (uses the turn) | A private report: flow breakdown, relationships, and a 3-turn projection if everyone waits, with threshold risks. |
| Contribute to the wetland | 1 … min(credits, remaining) | Pooled toward 24 credits. Overfunded simultaneous offers are scaled proportionally. |
| Wait | 0 | No intervention. A player who makes no choice waits automatically. |

**Conflicts:** if several players claim the last plot, priority goes by join order, rotated one place each
turn. Losers are not charged. Network arrival order never matters.

## Turn order (`TurnResolver`)

1. Validate every intention against the same start-of-turn state.
2. Aggregate in priority order: plots, costs, contribution offers (allocated together) and report requests.
3. Production and consumption.
4. Regeneration and depletion.
5. Pollution accumulation and the ecosystem's response. (Steps 3–5 are all computed from start-of-turn
   values.)
6. Threshold, delayed and project effects: restoration growth, wetland construction and completion.
7. Clamp to 0–100 and round to 0.1.
8. Private income and shortage hardship.
9. Record decisions, the causal events and a history point.
10. Check end conditions, then advance the turn. Research reports are produced after the turn advances.

## Delayed consequences

- Expansion pays immediately, but its water demand and emissions recur every turn. They accumulate until a
  threshold is crossed several turns later. The crossing event names every pollution source and who built
  each one.
- Restoration takes effect on the 4 turns after planting.
- The wetland finishes 2 turns after it is funded; its recurring benefits start the turn after it completes.

## Feedback loops

- **Reinforcing loop (implemented and tested):** water below 40 → over-extraction damages the watershed →
  recharge falls (0.5 + 0.5 × health) → water stays low. Conservation, restoration or the wetland can
  interrupt it. Tests show the loop persisting when everyone waits and stopping once conservation lifts
  water back above 40.
- **Second reinforcing loop:** pollution above 40 → ecosystem damage → less absorption → more pollution.
- **Behavioral link (documented, not forced):** shortages raise everyone's living costs, which makes private
  expansion more tempting.

## Collective action

The Riverbank Wetland needs 24 credits.

- Contributions are public and aggregated.
- When the target is reached, construction takes 2 turns.
- On completion: +4 ecosystem once, then +2 water recharge and −3 pollution every turn, **for everyone**.
- Non-contributors benefit equally (the free-rider problem), and the history names who did and did not
  contribute without judging anyone.
- If the scenario ends first, the project is reported as never built. Contributions are not refunded.

## Reflection (self-inquiry)

When a player chooses **Expand production**, an optional question appears: "What is driving this decision
right now?" The answers are practical need, comfort, status or comparison, fear of falling behind, or habit.

- It can be skipped or hidden for the session.
- Answers stay in that browser tab and are **never sent to the server**, so they cannot affect the
  simulation or score anyone.
- The end summary revisits each reflected decision alongside what changed afterwards.

## End of scenario

- **Early crisis:** an essential or the ecosystem is critical at **two consecutive turn-ends**. A warning is
  logged after the first.
- After turn 16:
  - **Crisis** if anything is critical.
  - **Resilient** if water, food and energy are at or above stress, ecosystem health is at least 40, and it
    fell by no more than 3 over the last 4 turns.
  - **Stressed** otherwise.
- The summary reports the reasons, the trade-offs (private gains against shared conditions), the indicator
  ranges, each player's gains and shortage costs (as a share of income), key events and every decision.

## Balance check (repeatable playthroughs, `tests/scenarios/playthroughs.test.ts`)

| Strategy | Outcome | Final water/food/energy/ecosystem/pollution | Credits |
|---|---|---|---|
| Solo: maximum expansion | crisis, ended after turn 11 | 0 / 68.8 / 100 / 50.1 / 63 | 78 |
| Solo: conservation and restoration only | stressed | 100 / 25.3 / 13.3 / 100 / 12.6 | 2 |
| Solo: mixed, funds the wetland | resilient | 84.3 / 76 / 71 / 100 / 18.8 | 26 |
| Solo: always wait | stressed | 61.1 / 28 / 28 / 87 / 16.1 | 42 |
| 3 players: all expand | crisis, ended after turn 7 | 0 / 91.3 / 100 / 53.9 / 55.8 | 27 / 32 / 33 |
| 3 players: coordinated | resilient | 100 / 76 / 66.6 / 100 / 2.4 | 31 / 46 / 24 |
| 3 players: 1 expands, 2 steward | stressed | 89.4 / 100 / 100 / 78.6 / 72.1 | 172 / 12 / 10 |

No strategy is guaranteed to win, and collapse is not inevitable. Pure stewardship cannot meet growing
demand alone, while unchecked expansion collapses the commons. These are tuning results, not claims about
the real world.
