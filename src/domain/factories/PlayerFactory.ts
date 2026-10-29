import type { SimulationConfig } from '../config/riverValley';
import type { DisplayName } from '../model/DisplayName';
import { Player } from '../model/Player';
import type { PlayerId } from '../model/types';

export interface NewPlayerParams {
  id: PlayerId;
  displayName: DisplayName;
  joinOrder: number;
  joinedTurn: number;
}

/** Creates players with the scenario's starting conditions. */
export class PlayerFactory {
  constructor(private readonly config: SimulationConfig) {}

  create(params: NewPlayerParams): Player {
    return Player.fromSnapshot({
      id: params.id,
      displayName: params.displayName.value,
      joinOrder: params.joinOrder,
      joinedTurn: params.joinedTurn,
      credits: this.config.economy.startingCredits,
      totals: { incomeEarned: 0, hardshipPaid: 0, spentOnActions: 0, contributed: 0 },
      report: null,
    });
  }
}
