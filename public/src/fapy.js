"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeChainAPY = computeChainAPY;
const rpcs_1 = require("./utils/rpcs");
const crv_fetcher_1 = require("./crv.fetcher");
const crv_like_forward_1 = require("./crv-like.forward");
const velo_like_forward_1 = require("./velo-like.forward");
async function computeChainAPY(vault, chainId, strategies) {
    const chain = (0, rpcs_1.getChainFromChainId)(chainId)?.name?.toLowerCase();
    if (!chain)
        return null;
    // Check for Velodrome/Aerodrome vaults first (Optimism chain 10 or Base chain 8453)
    if ((chainId === 10 || chainId === 8453) && (0, velo_like_forward_1.isVelodromeVault)(vault)) {
        return await (0, velo_like_forward_1.computeVeloLikeForwardAPY)({
            vault,
            allStrategiesForVault: strategies,
            chainId,
        });
    }
    const [gauges, pools, subgraph, fraxPools] = await Promise.all([
        (0, crv_fetcher_1.fetchGauges)(),
        (0, crv_fetcher_1.fetchPools)(),
        (0, crv_fetcher_1.fetchSubgraph)(chainId),
        (0, crv_fetcher_1.fetchFraxPools)(),
    ]);
    if ((0, crv_like_forward_1.isCurveStrategy)(vault)) {
        return await (0, crv_like_forward_1.computeCurveLikeForwardAPY)({
            vault,
            gauges,
            pools,
            subgraphData: subgraph,
            fraxPools,
            allStrategiesForVault: strategies,
            chainId,
        });
    }
    return null;
}
