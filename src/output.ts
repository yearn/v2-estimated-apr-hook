import { KongBatchWebhook, Output, OutputSchema } from './types/schemas';
import { getVaultsWithStrategies } from './service';
import { ChainData, computeChainAPY, fetchChainData } from './fapy';
import { isVeloLikeVault } from './velo-like.forward';
import { GqlStrategy, GqlVault } from './types/kongTypes';

const CRV_COMPONENTS = [
  'netAPR',
  'netAPY',
  'boost',
  'poolAPY',
  'boostedAPR',
  'baseAPR',
  'rewardsAPR',
  'rewardsAPY',
  'cvxAPR',
  'keepCRV',
] as const;

const VELO_COMPONENTS = [
  'netAPR',
  'netAPY',
  'keepVelo',
] as const;

async function computeVaultOutputs(
  chainId: number,
  address: `0x${string}`,
  vault: GqlVault,
  strategies: GqlStrategy[],
  blockNumber: bigint,
  blockTime: bigint,
  chainData: ChainData,
): Promise<Output[]> {
  const assetAddress = vault.asset?.address as `0x${string}`;
  let isVeloAero = false;
  if (assetAddress) {
    const [, hasGauge] = await isVeloLikeVault(chainId, assetAddress);
    isVeloAero = hasGauge;
  }

  const fapy = await computeChainAPY(vault, chainId, strategies, chainData);
  if (!fapy) return [];

  let label: string;
  let components: readonly string[];

  if (isVeloAero) {
    if (chainId === 10) {
      label = 'velo-estimated-apr';
    } else if (chainId === 8453) {
      label = 'aero-estimated-apr';
    } else {
      label = 'velo-estimated-apr';
    }
    components = VELO_COMPONENTS;
  } else {
    label = 'crv-estimated-apr';
    components = CRV_COMPONENTS;
  }

  const outputs: Output[] = components.map((component) =>
    OutputSchema.parse({
      chainId,
      address,
      label,
      component,
      value: fapy[component as keyof typeof fapy] ?? 0,
      blockNumber,
      blockTime,
    }),
  );

  if (fapy.strategies) {
    for (const strategy of fapy.strategies) {
      const strategyComponents = [...components, 'debtRatio'];
      outputs.push(...strategyComponents.map((component) =>
        OutputSchema.parse({
          chainId,
          address: strategy.address as `0x${string}`,
          label,
          component,
          value: strategy[component as keyof typeof strategy] ?? 0,
          blockNumber,
          blockTime,
        }),
      ));
    }
  }

  return outputs;
}

export async function computeFapy(hook: KongBatchWebhook): Promise<Output[]> {
  const chainGroups = new Map<number, `0x${string}`[]>();
  for (const vault of hook.vaults) {
    if (!chainGroups.has(vault.chainId)) chainGroups.set(vault.chainId, []);
    chainGroups.get(vault.chainId)!.push(vault.address);
  }

  const outputs: Output[] = [];

  for (const [chainId, addresses] of chainGroups) {
    const [vaultsMap, chainData] = await Promise.all([
      getVaultsWithStrategies(chainId, addresses),
      fetchChainData(chainId),
    ]);

    const results = await Promise.allSettled(
      addresses.map(async (address) => {
        const vaultData = vaultsMap.get(address.toLowerCase());
        if (!vaultData) return [];

        return computeVaultOutputs(
          chainId, address,
          vaultData.vault, vaultData.strategies,
          hook.blockNumber, hook.blockTime,
          chainData,
        );
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        outputs.push(...result.value);
      } else {
        console.error('Error processing vault in batch:', result.reason);
      }
    }
  }

  return OutputSchema.array().parse(outputs);
}
