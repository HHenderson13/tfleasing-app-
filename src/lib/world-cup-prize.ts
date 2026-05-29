// Office sweepstake economics. Hard-coded for now; flip to a settings table
// if the entry fee or split ever needs to change mid-tournament.

export const ENTRY_FEE_GBP = 10;
export const SPLIT = { first: 0.70, second: 0.20, third: 0.10 } as const;

export interface PrizePool {
  playerCount: number;
  totalPool: number;
  first: number;
  second: number;
  third: number;
}

export function calculatePrizePool(playerCount: number): PrizePool {
  const total = playerCount * ENTRY_FEE_GBP;
  return {
    playerCount,
    totalPool: total,
    first: Math.round(total * SPLIT.first),
    second: Math.round(total * SPLIT.second),
    third: Math.round(total * SPLIT.third),
  };
}

export function fmtGbp(n: number): string {
  return "£" + n.toLocaleString("en-GB");
}
