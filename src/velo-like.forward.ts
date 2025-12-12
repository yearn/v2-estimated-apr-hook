import { createPublicClient, http } from 'viem';
import { fetchErc20PriceUsd } from './utils/prices';
import { veloGaugeAbi } from './abis/velo-gauge.abi';
import { veloVoterRegistryAbi } from './abis/velo-voter-registry.abi';
import { veloStrategyAbi } from './abis/velo-strategy.abi';
import { Float } from './helpers/bignumber-float';
import { BigNumberInt, toNormalizedAmount } from './helpers/bignumber-int';
import { GqlStrategy, GqlVault } from './types/kongTypes';
import { VaultAPY } from './fapy';
import { getChainFromChainId } from './utils/rpcs';
import { VELO_STAKING_POOLS_REGISTRY, VELO_TOKEN_ADDRESS } from './helpers/maps.helper';

export async function isVeloVault(
  chainId: number,
  assetAddress: `0x${string}`,
): Promise<[`0x${string}` | null, boolean]> {
  if (chainId !== 10) {
    return [null, false];
  }

  const registryAddress = VELO_STAKING_POOLS_REGISTRY[chainId];
  if (!registryAddress) return [null, false];

  try {
    const client = createPublicClient({
      chain: getChainFromChainId(chainId),
      transport: http(process.env[`RPC_CHAIN_URL_${chainId}`]!),
    });

    const gaugeAddress = (await client.readContract({
      address: registryAddress,
      abi: veloVoterRegistryAbi,
      functionName: 'gauges',
      args: [assetAddress],
    })) as `0x${string}`;

    const isVelo = gaugeAddress !== '0x0000000000000000000000000000000000000000';
    
    return [isVelo ? gaugeAddress : null, isVelo];
  } catch (error) {
    console.error('Error checking Velo vault:', error);
    return [null, false];
  }
}

export async function isAeroVault(
  chainId: number,
  assetAddress: `0x${string}`,
): Promise<[`0x${string}` | null, boolean]> {
  if (chainId !== 8453) {
    return [null, false];
  }

  const registryAddress = VELO_STAKING_POOLS_REGISTRY[chainId];
  if (!registryAddress) return [null, false];

  try {
    const client = createPublicClient({
      chain: getChainFromChainId(chainId),
      transport: http(process.env[`RPC_CHAIN_URL_${chainId}`]!),
    });

    const gaugeAddress = (await client.readContract({
      address: registryAddress,
      abi: veloVoterRegistryAbi,
      functionName: 'gauges',
      args: [assetAddress],
    })) as `0x${string}`;

    const isAero = gaugeAddress !== '0x0000000000000000000000000000000000000000';
    
    return [isAero ? gaugeAddress : null, isAero];
  } catch (error) {
    console.error('Error checking Aero vault:', error);
    return [null, false];
  }
}

export async function isVeloLikeVault(
  chainId: number,
  assetAddress: `0x${string}`,
): Promise<[`0x${string}` | null, boolean]> {
  if (chainId === 10) {
    return await isVeloVault(chainId, assetAddress);
  } else if (chainId === 8453) {
    return await isAeroVault(chainId, assetAddress);
  }
  return [null, false];
}

export async function determineVeloKeepVELO(
  strategy: GqlStrategy,
  chainId: number,
): Promise<number> {
  if ((strategy as any).localKeepVELO && BigInt((strategy as any).localKeepVELO) > 0) {
    return toNormalizedAmount(new BigNumberInt(BigInt((strategy as any).localKeepVELO)), 4).toNumber();
  }

  try {
    const client = createPublicClient({
      chain: getChainFromChainId(chainId),
      transport: http(process.env[`RPC_CHAIN_URL_${chainId}`]!),
    });

    const localKeepVELO = (await client.readContract({
      address: strategy.address,
      abi: veloStrategyAbi,
      functionName: 'localKeepVELO',
      args: [],
    })) as bigint;

    return toNormalizedAmount(new BigNumberInt(localKeepVELO), 4).toNumber();
  } catch {
    return 0;
  }
}

export async function calculateVeloLikeStrategyAPY(
  vault: GqlVault,
  strategy: GqlStrategy,
  gaugeAddress: `0x${string}`,
  chainId: number,
) {
  const client = createPublicClient({
    chain: getChainFromChainId(chainId),
    transport: http(process.env[`RPC_CHAIN_URL_${chainId}`]!),
  });

  const [
    { result: periodFinish },
    { result: rewardRate },
    { result: totalSupply },
    { result: rewardToken },
  ] = await client.multicall({
    contracts: [
      {
        address: gaugeAddress,
        abi: veloGaugeAbi,
        functionName: 'periodFinish',
      },
      {
        address: gaugeAddress,
        abi: veloGaugeAbi,
        functionName: 'rewardRate',
      },
      {
        address: gaugeAddress,
        abi: veloGaugeAbi,
        functionName: 'totalSupply',
      },
      {
        address: gaugeAddress,
        abi: veloGaugeAbi,
        functionName: 'rewardToken',
      },
    ],
  });

  const keepVelo = await determineVeloKeepVELO(strategy, chainId);

  const now = Math.floor(Date.now() / 1000);
  if (!periodFinish || Number(periodFinish) < now) {
    return {
      type: 'v2:velo_unpopular',
      debtRatio: 0,
      netAPY: 0,
      keepVelo,
    };
  }

  if (!totalSupply || totalSupply === 0n) {
    return {
      type: 'v2:velo_unpopular',
      debtRatio: 0,
      netAPY: 0,
      keepVelo,
    };
  }

  const debtRatio = toNormalizedAmount(new BigNumberInt(strategy.debtRatio ?? 0), 4);
  const performanceFee = toNormalizedAmount(new BigNumberInt(vault.performanceFee ?? 0), 4);
  const managementFee = toNormalizedAmount(new BigNumberInt(vault.managementFee ?? 0), 4);

  const oneMinusKeepVelo = new Float().sub(new Float(1), new Float(keepVelo));
  const oneMinusPerfFee = new Float().sub(new Float(1), performanceFee);

  const rewardRateNormalized = toNormalizedAmount(new BigNumberInt(rewardRate ?? 0n), 18);
  const totalSupplyNormalized = toNormalizedAmount(new BigNumberInt(totalSupply), 18);
  const secondsPerYear = new Float(31556952);

  if (rewardRateNormalized.isZero() || oneMinusKeepVelo.isZero()) {
    return {
      type: 'v2:velo_unpopular',
      debtRatio: debtRatio.toFloat64()[0],
      netAPY: 0,
      keepVelo,
    };
  }

  const assetAddress = vault.asset?.address as `0x${string}`;
  const [{ priceUsd: poolPrice }, { priceUsd: rewardsPrice }] = await Promise.all([
    fetchErc20PriceUsd(chainId, assetAddress),
    fetchErc20PriceUsd(chainId, (rewardToken as `0x${string}`) ?? VELO_TOKEN_ADDRESS[chainId]),
  ]);

  const poolPriceFloat = new Float(poolPrice || 0);
  const rewardsPriceFloat = new Float(rewardsPrice || 0);

  const adjustedRewardRate = new Float().mul(rewardRateNormalized, oneMinusKeepVelo);
  let grossAPRTop = new Float().mul(adjustedRewardRate, rewardsPriceFloat);
  grossAPRTop = new Float().mul(grossAPRTop, secondsPerYear);
  const grossAPRBottom = new Float().mul(poolPriceFloat, totalSupplyNormalized);

  if (grossAPRBottom.isZero()) {
    return {
      type: 'v2:velo_unpopular',
      debtRatio: debtRatio.toFloat64()[0],
      netAPY: 0,
      keepVelo,
    };
  }

  const grossAPR = new Float().div(grossAPRTop, grossAPRBottom);

  let netAPR = new Float().mul(grossAPR, oneMinusPerfFee);
  if (netAPR.gt(managementFee)) {
    netAPR = new Float().sub(netAPR, managementFee);
  } else {
    netAPR = new Float(0);
  }

  const daysInYear = 365;
  const compoundingPeriod = 15;
  const compoundingPeriodsPerYear = daysInYear / compoundingPeriod;

  let netAPY = new Float().div(netAPR, new Float(compoundingPeriodsPerYear));
  netAPY = new Float().add(netAPY, new Float(1));
  netAPY = netAPY.pow(compoundingPeriodsPerYear);
  netAPY = new Float().sub(netAPY, new Float(1));

  return {
    type: 'v2:velo',
    debtRatio: debtRatio.toFloat64()[0],
    netAPY: new Float().mul(netAPY, debtRatio).toFloat64()[0],
    boost: 0,
    poolAPY: 0,
    boostedAPR: 0,
    baseAPR: 0,
    rewardsAPY: 0,
    keepVelo,
  };
}

export async function computeVeloLikeForwardAPY({
  vault,
  allStrategiesForVault,
  chainId,
}: {
  vault: GqlVault;
  allStrategiesForVault: GqlStrategy[];
  chainId: number;
}): Promise<VaultAPY> {
  const assetAddress = vault.asset?.address as `0x${string}`;
  if (!assetAddress) {
    return { type: '', netAPY: 0 };
  }

  const [gaugeAddress, isVeloLike] = await isVeloLikeVault(chainId, assetAddress);
  if (!isVeloLike || !gaugeAddress) {
    return { type: '', netAPY: 0 };
  }

  let typeOf = '';
  let netAPY = new Float(0);
  let boost = new Float(0);
  let poolAPY = new Float(0);
  let boostedAPR = new Float(0);
  let baseAPR = new Float(0);
  let rewardsAPY = new Float(0);
  let keepVelo = new Float(0);

  const strategyAPYs = await Promise.all(
    allStrategiesForVault.map(async (strategy) => {
      if (!strategy.debtRatio || strategy.debtRatio === 0) return null;
      return calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, chainId);
    }),
  );

  for (const s of strategyAPYs) {
    if (!s) continue;
    typeOf += ` ${s.type}`;
    netAPY = new Float().add(netAPY, new Float(s.netAPY || 0));
    boost = new Float().add(boost, new Float(s.boost || 0));
    poolAPY = new Float().add(poolAPY, new Float(s.poolAPY || 0));
    boostedAPR = new Float().add(boostedAPR, new Float(s.boostedAPR || 0));
    baseAPR = new Float().add(baseAPR, new Float(s.baseAPR || 0));
    rewardsAPY = new Float().add(rewardsAPY, new Float(s.rewardsAPY || 0));
    keepVelo = new Float().add(keepVelo, new Float(s.keepVelo || 0));
  }

  return {
    type: typeOf.trim(),
    netAPR: netAPY.toFloat64()[0],
    netAPY: netAPY.toFloat64()[0],
    boost: boost.toFloat64()[0],
    poolAPY: poolAPY.toFloat64()[0],
    boostedAPR: boostedAPR.toFloat64()[0],
    baseAPR: baseAPR.toFloat64()[0],
    rewardsAPY: rewardsAPY.toFloat64()[0],
    keepVelo: keepVelo.toFloat64()[0],
  };
}
