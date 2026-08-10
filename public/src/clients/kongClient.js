"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KongClient = void 0;
const graphql_1 = require("../utils/graphql");
class KongClient {
    constructor(opts) {
        this.url = opts?.url ?? 'https://kong.yearn.farm/api/gql';
        this.headers = opts?.headers;
    }
    /**
     * Fetch a vault by chainId and address.
     */
    async getVault(chainId, address) {
        const query = (0, graphql_1.gql) `
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
        const res = await (0, graphql_1.graphqlRequest)({
            url: this.url,
            headers: this.headers,
            query,
            variables: { chainId, addresses: [address] },
            throwOnError: false,
        });
        if ('errors' in res)
            return null;
        const first = res.data.vaults?.[0] ?? null;
        return first;
    }
    /**
     * Fetch a strategy by chainId and address.
     */
    async getStrategy(chainId, address) {
        const query = (0, graphql_1.gql) `
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
        const res = await (0, graphql_1.graphqlRequest)({
            url: this.url,
            headers: this.headers,
            query,
            variables: { chainId, address },
            throwOnError: false,
        });
        if ('errors' in res)
            return null;
        return res.data.strategy;
    }
    /**
     * Fetch all strategies for a given vault.
     */
    async getVaultStrategies(chainId, vault) {
        const query = (0, graphql_1.gql) `
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
        const res = await (0, graphql_1.graphqlRequest)({
            url: this.url,
            headers: this.headers,
            query,
            variables: { chainId, vault },
            throwOnError: false,
        });
        if ('errors' in res)
            return [];
        return res.data.vaultStrategies;
    }
    /**
     * Fetch prices for a given set of parameters.
     */
    async getPrices(params) {
        const query = (0, graphql_1.gql) `
      query Prices($chainId: Int, $address: String) {
        prices(chainId: $chainId, address: $address) {
          chainId
          address
          priceUsd
          priceSource
          blockNumber
          blockTime
        }
      }
    `;
        const res = await (0, graphql_1.graphqlRequest)({
            url: this.url,
            headers: this.headers,
            query,
            variables: params,
            throwOnError: false,
        });
        if ('errors' in res)
            return [];
        return res.data.prices;
    }
}
exports.KongClient = KongClient;
