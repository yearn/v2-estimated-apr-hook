import * as chains from 'viem/chains';

export const getChainFromChainId = (chainId: number) => {
  return Object.values(chains).find((chain) => chain.id === chainId);
};

export function getRPCUrl(chainId: number) {
  const rpcUrl = process.env[`RPC_CHAIN_URL_${chainId}`];

  if (!rpcUrl) {
    throw new Error(`RPC URL not set in environment variables for chain ${chainId}`);
  }

  return rpcUrl;
}