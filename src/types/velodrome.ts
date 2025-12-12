export interface VeloGauge {
  address: string;
  poolAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  rewardRate: string;
  rewardToken: string;
  periodFinish: string;
  lpTokenPrice?: number;
}

export interface VeloPool {
  address: string;
  symbol: string;
  decimals: number;
  stable: boolean;
  token0: string;
  token1: string;
  gauge?: string;
  totalSupply: string;
  reserve0: string;
  reserve1: string;
  lpPrice?: number;
}
