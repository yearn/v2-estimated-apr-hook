import { graphqlRequest, gql } from '../utils/graphql';
import type { GqlVault, GqlStrategy, GqlPrice } from '../types/kongTypes';

export type KongClientOptions = {
  url?: string;
  headers?: Record<string, string>;
};

export class KongClient {
  private url: string;
  private headers?: Record<string, string>;

  constructor(opts?: KongClientOptions) {
    this.url = opts?.url ?? 'https://kong.yearn.farm/api/gql';
    this.headers = opts?.headers;
  }

  /**
   * Fetch a vault by chainId and address.
   */
  async getVault(chainId: number, address: `0x${string}`): Promise<GqlVault | null> {
    const query = gql`
      query Vaults($addresses: [String], $chainId: Int) {
        vaults(addresses: $addresses, chainId: $chainId) {
          accountant
          activation
          address
          apiVersion
          asset {
            address
            chainId
            decimals
            name
            symbol
          }
          debts {
            debtRatio
            strategy
            performanceFee
          }
          creditAvailable
          debtOutstanding
          debtRatio
          decimals
          depositLimit
          guardian
          management
          managementFee
          maxAvailableShares
          name
          performanceFee
          pricePerShare
          expectedReturn
          rewards
          symbol
          token
          totalAssets
          totalDebt
          totalIdle
          totalSupply
          strategies
          yearn
        }
      }
    `;
    const res = await graphqlRequest<{ vaults: GqlVault[] }>({
      url: this.url,
      headers: this.headers,
      query,
      variables: { chainId, addresses: [address] },
      throwOnError: false,
    });
    if ('errors' in res) return null;
    const first = res.data.vaults?.[0] ?? null;
    return first;
  }

  /**
   * Fetch a strategy by chainId and address.
   */
  async getStrategy(chainId: number, address: `0x${string}`): Promise<GqlStrategy | null> {
    const query = gql`
query Strategy($chainId: Int, $address: String) {
  strategy(chainId: $chainId, address: $address) {
    crv
    apiVersion
    address
    symbol
    name
    rewards
    gauge
    keeper
    totalDebt
    totalDebtUsd
    totalIdle
    localKeepCRV
    performanceFee
    totalAssets
    totalSupply
    decimals
    management
    pricePerShare
  }
}


    `;
    const res = await graphqlRequest<{ strategy: GqlStrategy | null }>({
      url: this.url,
      headers: this.headers,
      query,
      variables: { chainId, address },
      throwOnError: false,
    });
    if ('errors' in res) return null;
    return res.data.strategy;
  }

  /**
   * Fetch all strategies for a given vault.
   */
  async getVaultStrategies(chainId: number, vault: `0x${string}`): Promise<GqlStrategy[]> {
    const query = gql`
      query VaultStrategies($chainId: Int, $vault: String) {
        vaultStrategies(chainId: $chainId, vault: $vault) {
          chainId
          address
          apiVersion
          balanceOfWant
          baseFeeOracle
          creditThreshold
          crv
          curveVoter
          delegatedAssets
          doHealthCheck
          emergencyExit
          erc4626
          estimatedTotalAssets
          forceHarvestTriggerOnce
          gauge
          healthCheck
          inceptTime
          inceptBlock
          isActive
          isBaseFeeAcceptable
          isOriginal
          keeper
          localKeepCRV
          maxReportDelay
          metadataURI
          minReportDelay
          name
          proxy
          rewards
          stakedBalance
          strategist
          tradeFactory
          vault
          want
          DOMAIN_SEPARATOR
          FACTORY
          MAX_FEE
          MIN_FEE
          decimals
          fullProfitUnlockDate
          isShutdown
          lastReport
          management
          pendingManagement
          performanceFee
          performanceFeeRecipient
          pricePerShare
          profitMaxUnlockTime
          profitUnlockingRate
          symbol
          totalAssets
          totalDebt
          totalIdle
          totalSupply
          totalDebtUsd
          meta {
            displayName
          }
          v3
          yearn
        }
      }
    `;
    const res = await graphqlRequest<{ vaultStrategies: GqlStrategy[] }>({
      url: this.url,
      headers: this.headers,
      query,
      variables: { chainId, vault },
      throwOnError: false,
    });
    if ('errors' in res) return [];
    return res.data.vaultStrategies;
  }

  /**
   * Fetch prices for a given set of parameters.
   */
  async getPrices(params: {
    chainId?: number;
    address?: `0x${string}`;
  }): Promise<GqlPrice[]> {
    const query = gql`
      query Prices($chainId: Int, $address: String) {
        prices(chainId: $chainId, address: $address) {
          chainId
          address
          priceUsd
          priceSource
          blockNumber
        }
      }
    `;
    const res = await graphqlRequest<{ prices: GqlPrice[] }>({
      url: this.url,
      headers: this.headers,
      query,
      variables: params,
      throwOnError: false,
    });
    if ('errors' in res) return [];
    return res.data.prices;
  }
}
