import { KongClient } from './clients/kongClient';
import { GqlStrategy, GqlVault } from './types/kongTypes';

function mapStrategies(vault: GqlVault, rawStrategies: (GqlStrategy | null)[]) {
  return rawStrategies
    .filter((s) => s !== null)
    .map((strategy) => {
      const debtRatio = vault?.debts?.find((d) => d.strategy === strategy.address)?.debtRatio;

      return {
        name: strategy.name,
        token: strategy.want,
        symbol: strategy.symbol,
        rewards: strategy.rewards,
        guardian: strategy.guardian,
        totalDebt: BigInt(strategy.totalDebt ?? 0),
        totalIdle: BigInt(strategy.totalIdle ?? 0),
        debtRatio: Number(debtRatio ?? 0),
        decimals: Number(strategy.decimals ?? 18),
        management: strategy.management,
        managementFee: Number(vault?.managementFee ?? 0),
        totalAssets: BigInt(strategy.totalAssets ?? 0),
        totalSupply: BigInt(strategy.totalSupply ?? 0),
        performanceFee: Number(strategy?.performanceFee ?? 0),
        localKeepCRV: BigInt(strategy.localKeepCRV ?? 0),
        pricePerShare: BigInt(strategy.pricePerShare ?? 0),
        apiVersion: strategy.apiVersion,
        ...strategy,
      } as unknown as GqlStrategy;
    });
}

export async function getVaultWithStrategies(chainId: number, vaultAddress: `0x${string}`) {
  const kong = new KongClient();
  const vault = await kong.getVault(chainId, vaultAddress);

  const allStrategies = await Promise.all(
    (vault?.strategies || []).map((s) => kong.getStrategy(chainId, s as `0x${string}`)),
  )

  const strategies = mapStrategies(vault!, allStrategies);

  if (!strategies && !vault) return null;

  return {
    vault,
    strategies,
  };
}

export async function getVaultsWithStrategies(chainId: number, addresses: `0x${string}`[]) {
  const kong = new KongClient();
  const [vaults, allChainStrategies] = await Promise.all([
    kong.getVaults(chainId, addresses),
    kong.getStrategiesByChain(chainId),
  ]);

  const strategyByAddress = new Map(
    allChainStrategies.map(s => [s.address?.toLowerCase(), s])
  );

  const results = vaults.map((vault) => {
    const vaultStrategies = (vault.strategies || [])
      .map(s => strategyByAddress.get((s as string).toLowerCase()) ?? null);
    return { vault, strategies: mapStrategies(vault, vaultStrategies) };
  });

  return new Map(results.map(r => [r.vault.address?.toLowerCase(), r]));
}
