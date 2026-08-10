"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGauges = fetchGauges;
exports.fetchPools = fetchPools;
exports.fetchSubgraph = fetchSubgraph;
exports.fetchFraxPools = fetchFraxPools;
const maps_helper_1 = require("./maps.helper");
// API fetch functions
async function fetchGauges(chain) {
    const gaugesResponse = await fetch(`${process.env.CRV_GAUGE_REGISTRY_URL}?blockchainId=${chain}`);
    const gauges = (await gaugesResponse.json());
    return Object.values(gauges.data);
}
async function fetchPools(chain) {
    const poolsResponse = await fetch(`${process.env.CRV_POOLS_URL}/${chain}`);
    const pools = (await poolsResponse.json());
    return pools.data?.poolData;
}
async function fetchSubgraph(chainId) {
    const subgraphResponse = await fetch(`${maps_helper_1.CURVE_SUBGRAPHDATA_URI[chainId]}`);
    const subgraph = (await subgraphResponse.json());
    return subgraph;
}
async function fetchFraxPools() {
    const fraxPoolsResponse = await fetch('https://frax.convexfinance.com/api/frax/pools');
    const fraxPools = (await fraxPoolsResponse.json());
    const pools = fraxPools.map((pool) => {
        if (pool.type !== 'convex') {
            return null;
        }
        const poolUsd = pool.stakingTokenUsdPrice;
        const poolPrice = typeof poolUsd === 'string' ? parseFloat(poolUsd) : poolUsd;
        pool.stakingTokenUsdPrice = poolPrice;
        pool.rewardCoins = pool.rewardCoins.map((coin, index) => {
            const rewardApr = parseFloat(pool.rewardAprs[index]);
            const minBoostedRewardApr = parseFloat(pool.boostedRewardAprs[index].min);
            const maxBoostedRewardApr = parseFloat(pool.boostedRewardAprs[index].max);
            return {
                rewardApr,
                minBoostedRewardApr,
                maxBoostedRewardApr,
            };
        });
        return pool;
    });
    return pools.filter((pool) => pool !== null);
}
