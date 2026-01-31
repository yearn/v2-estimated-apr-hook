import { getChainFromChainId } from './utils/rpcs';
import { fetchFraxPools, fetchGauges, fetchPools, fetchSubgraph } from './crv.fetcher';
import { isCurveStrategy, computeCurveLikeForwardAPY } from './crv-like.forward';
import { isVeloLikeVault, computeVeloLikeForwardAPY } from './velo-like.forward';
import { GqlStrategy, GqlVault } from './types/kongTypes';

export interface VaultAPY {
  type?: string;
  netAPR?: number;
  netAPY?: number;
  boost?: number;
  poolAPY?: number;
  boostedAPR?: number;
  baseAPR?: number;
  cvxAPR?: number;
  rewardsAPY?: number;
  keepCRV?: number;
  keepVelo?: number;
  v3OracleCurrentAPR?: number;
  v3OracleStratRatioAPR?: number;
  strategies?: VaultAPY[];
  address?: string;
  debtRatio?: number;
}

export async function computeChainAPY(
  vault: GqlVault,
  chainId: number,
  strategies: Array<GqlStrategy>,
): Promise<VaultAPY | null> {
  const chain = getChainFromChainId(chainId)?.name?.toLowerCase();

  if (!chain) return null;

  const assetAddress = vault.asset?.address as `0x${string}`;
  if (assetAddress) {
    const [, isVeloLike] = await isVeloLikeVault(chainId, assetAddress);
    if (isVeloLike) {
      return await computeVeloLikeForwardAPY({
        vault,
        allStrategiesForVault: strategies,
        chainId,
      });
    }
  }

  const [gauges, pools, subgraph, fraxPools] = await Promise.all([
    fetchGauges(),
    fetchPools(),
    fetchSubgraph(chainId),
    fetchFraxPools(),
  ]);

  if (isCurveStrategy(vault)) {
    return await computeCurveLikeForwardAPY({
      vault,
      gauges,
      pools,
      subgraphData: subgraph,
      fraxPools,
      allStrategiesForVault: strategies,
      chainId,
    });
  }

  return null;
}
