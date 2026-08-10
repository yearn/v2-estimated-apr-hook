"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGauges = fetchGauges;
exports.fetchPools = fetchPools;
exports.fetchSubgraph = fetchSubgraph;
exports.fetchFraxPools = fetchFraxPools;
const maps_helper_1 = require("./helpers/maps.helper");
async function fetchGauges() {
    const gaugesResponse = await fetch(`${process.env.CRV_GAUGE_REGISTRY_URL || 'https://api.curve.finance/api/getAllGauges'}`);
    const gauges = (await gaugesResponse.json());
    return Object.values(gauges.data);
}
async function fetchPools() {
    try {
        const poolsResponse = await fetch(`${process.env.CRV_POOLS_URL || 'https://api.curve.finance/api/getPools/all'}`);
        const pools = (await poolsResponse.json());
        return pools.data?.poolData;
    }
    catch {
        return [];
    }
}
async function fetchSubgraph(chainId) {
    try {
        const subgraphResponse = await fetch(`${maps_helper_1.CURVE_SUBGRAPHDATA_URI[chainId]}`);
        const subgraph = (await subgraphResponse.json());
        return subgraph.data.poolList;
    }
    catch {
        return [];
    }
}
async function fetchFraxPools() {
    const res = await fetch('https://frax.convexfinance.com/api/frax/pools');
    const json = (await res.json());
    const pools = (json?.pools?.augmentedPoolData || []);
    return pools
        .filter((p) => p && p.type === 'convex')
        .map((pool) => {
        const poolUsd = pool.stakingTokenUsdPrice;
        const poolPrice = typeof poolUsd === 'string' ? parseFloat(poolUsd) : poolUsd;
        pool.stakingTokenUsdPrice = poolPrice;
        pool.rewardCoins = pool.rewardCoins.map((coin, index) => ({
            rewardApr: parseFloat(pool.rewardAprs[index]),
            minBoostedRewardApr: parseFloat(pool.boostedRewardAprs[index].min),
            maxBoostedRewardApr: parseFloat(pool.boostedRewardAprs[index].max),
        }));
        return pool;
    });
}
