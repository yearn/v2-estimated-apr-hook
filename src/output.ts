import { KongWebhook, Output, OutputSchema } from './types/schemas';
import { getVaultWithStrategies } from './service';
import { computeChainAPY } from './fapy';
import { isVeloLikeVault } from './velo-like.forward';

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

export async function computeFapy(hook: KongWebhook): Promise<Output[] | null> {
  try {
    const result = await getVaultWithStrategies(hook.chainId, hook.address);
    if (!result) return null;

    const { vault, strategies } = result;
    if (!vault) return null;

    const assetAddress = vault.asset?.address as `0x${string}`;
    let isVeloAero = false;
    if (assetAddress) {
      const [, hasGauge] = await isVeloLikeVault(hook.chainId, assetAddress);
      isVeloAero = hasGauge;
    }

    const fapy = await computeChainAPY(vault, hook.chainId, strategies);
    if (!fapy) return null;

    let label: string;
    let components: readonly string[];

    if (isVeloAero) {
      if (hook.chainId === 10) {
        label = 'velo-estimated-apr';
      } else if (hook.chainId === 8453) {
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
        chainId: hook.chainId,
        address: hook.address,
        label,
        component,
        value: fapy[component as keyof typeof fapy] ?? 0,
        blockNumber: hook.blockNumber,
        blockTime: hook.blockTime,
      }),
    );

    if (fapy.strategies) {
      for (const strategy of fapy.strategies) {
        const strategyComponents = [...components, 'debtRatio'];
        const strategyOutputs = strategyComponents.map((component) =>
          OutputSchema.parse({
            chainId: hook.chainId,
            address: strategy.address as `0x${string}`,
            label,
            component,
            value: strategy[component as keyof typeof strategy] ?? 0,
            blockNumber: hook.blockNumber,
            blockTime: hook.blockTime,
          }),
        );
        outputs.push(...strategyOutputs);
      }
    }

    return OutputSchema.array().parse(outputs);
  } catch (error) {
    console.error('Error in computeFapy:', error);
    return null;
  }
}
