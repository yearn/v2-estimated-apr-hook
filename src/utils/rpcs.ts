import * as chains from 'viem/chains';

// Static process.env reads so next.config `env` inlining applies at build time.
const RPC_URI_BY_CHAIN: Record<number, string | undefined> = {
  1: process.env.RPC_URI_FOR_1,
  10: process.env.RPC_URI_FOR_10,
  42161: process.env.RPC_URI_FOR_42161,
  8453: process.env.RPC_URI_FOR_8453,
};

export const getChainFromChainId = (chainId: number) => {
  return Object.values(chains).find((chain) => chain.id === chainId);
};

export function getRPCUrl(chainId: number) {
  const rpcUrl = RPC_URI_BY_CHAIN[chainId] ?? process.env[`RPC_URI_FOR_${chainId}`];

  if (!rpcUrl) {
    throw new Error(`RPC_URI_FOR_ not set in environment variables for chain ${chainId}`);
  }

  return rpcUrl;
}
