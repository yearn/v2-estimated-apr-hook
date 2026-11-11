import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeChainAPY, fetchChainData, type ChainData } from './fapy';
import { fetchFraxPools, fetchGauges, fetchPools, fetchSubgraph } from './crv.fetcher';
import { computeCurveLikeForwardAPY, isCurveStrategy } from './crv-like.forward';
import { computeVeloLikeForwardAPY, isVeloLikeVault } from './velo-like.forward';
import type { GqlStrategy, GqlVault } from './types/kongTypes';

vi.mock('./crv.fetcher', () => ({
  fetchGauges: vi.fn(),
  fetchPools: vi.fn(),
  fetchSubgraph: vi.fn(),
  fetchFraxPools: vi.fn(),
}));
vi.mock('./crv-like.forward', () => ({
  isCurveStrategy: vi.fn(),
  computeCurveLikeForwardAPY: vi.fn(),
}));
vi.mock('./velo-like.forward', () => ({
  isVeloLikeVault: vi.fn(),
  computeVeloLikeForwardAPY: vi.fn(),
}));

const ADDRESS = '0x0000000000000000000000000000000000000001';
const vault: GqlVault = {
  chainId: 1,
  address: ADDRESS,
  name: 'Curve fixture vault',
  asset: { chainId: 1, address: ADDRESS, name: 'Fixture', symbol: 'FIX', decimals: 18 },
};
const strategies: GqlStrategy[] = [{ chainId: 1, address: ADDRESS }];
const chainData: ChainData = { gauges: [], pools: [], subgraph: [], fraxPools: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isVeloLikeVault).mockResolvedValue([null, false]);
  vi.mocked(isCurveStrategy).mockReturnValue(true);
  vi.mocked(fetchGauges).mockResolvedValue(chainData.gauges);
  vi.mocked(fetchPools).mockResolvedValue(chainData.pools);
  vi.mocked(fetchSubgraph).mockResolvedValue(chainData.subgraph);
  vi.mocked(fetchFraxPools).mockResolvedValue(chainData.fraxPools);
});

describe('fAPY routing without a remote reference service', () => {
  it('routes Curve vaults with all chain inputs to the Curve calculator', async () => {
    const expected = { netAPY: 0.05, boost: 2.5 };
    vi.mocked(computeCurveLikeForwardAPY).mockResolvedValue(expected);

    expect(await computeChainAPY(vault, 1, strategies)).toEqual(expected);
    expect(computeCurveLikeForwardAPY).toHaveBeenCalledWith({
      vault, chainId: 1, allStrategiesForVault: strategies,
      gauges: chainData.gauges, pools: chainData.pools,
      subgraphData: chainData.subgraph, fraxPools: chainData.fraxPools,
    });
    expect(fetchSubgraph).toHaveBeenCalledWith(1);
    expect(computeVeloLikeForwardAPY).not.toHaveBeenCalled();
  });

  it('uses the supplied batch chain snapshot without refetching it', async () => {
    await computeChainAPY(vault, 1, strategies, chainData);

    expect(computeCurveLikeForwardAPY).toHaveBeenCalledWith(expect.objectContaining({
      gauges: chainData.gauges, pools: chainData.pools,
      subgraphData: chainData.subgraph, fraxPools: chainData.fraxPools,
    }));
    expect(fetchGauges).not.toHaveBeenCalled();
    expect(fetchPools).not.toHaveBeenCalled();
    expect(fetchSubgraph).not.toHaveBeenCalled();
    expect(fetchFraxPools).not.toHaveBeenCalled();
  });

  it.each([10, 8453])('routes a gauge-backed vault on chain %i without Curve requests', async (chainId) => {
    const chainVault = { ...vault, chainId };
    const expected = { netAPY: 0.03, keepVelo: 0.1 };
    vi.mocked(isVeloLikeVault).mockResolvedValue([ADDRESS, true]);
    vi.mocked(computeVeloLikeForwardAPY).mockResolvedValue(expected);

    expect(await computeChainAPY(chainVault, chainId, strategies)).toEqual(expected);
    expect(isVeloLikeVault).toHaveBeenCalledWith(chainId, ADDRESS);
    expect(computeVeloLikeForwardAPY).toHaveBeenCalledWith({
      vault: chainVault, chainId, allStrategiesForVault: strategies,
    });
    expect(computeCurveLikeForwardAPY).not.toHaveBeenCalled();
    expect(fetchGauges).not.toHaveBeenCalled();
    expect(fetchSubgraph).not.toHaveBeenCalled();
  });

  it('does not compute an unclassified vault', async () => {
    vi.mocked(isCurveStrategy).mockReturnValue(false);

    expect(await computeChainAPY(vault, 1, strategies, chainData)).toBeNull();
    expect(computeCurveLikeForwardAPY).not.toHaveBeenCalled();
    expect(computeVeloLikeForwardAPY).not.toHaveBeenCalled();
  });

  it('does not request data for unsupported chains', async () => {
    expect(await computeChainAPY(vault, 999999, strategies)).toBeNull();
    expect(isVeloLikeVault).not.toHaveBeenCalled();
    expect(fetchGauges).not.toHaveBeenCalled();
    expect(fetchSubgraph).not.toHaveBeenCalled();
  });

  it('propagates upstream data failures for the batch caller to handle', async () => {
    vi.mocked(fetchGauges).mockRejectedValueOnce(new Error('Curve unavailable'));

    await expect(computeChainAPY(vault, 1, strategies)).rejects.toThrow('Curve unavailable');
    expect(computeCurveLikeForwardAPY).not.toHaveBeenCalled();
  });

  it('assembles a complete chain snapshot for a batch', async () => {
    expect(await fetchChainData(10)).toEqual(chainData);
    for (const source of [fetchGauges, fetchPools, fetchSubgraph, fetchFraxPools]) {
      expect(source).toHaveBeenCalledOnce();
    }
    expect(fetchSubgraph).toHaveBeenCalledWith(10);
  });
});
