"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchErc20PriceUsd = fetchErc20PriceUsd;
const kongClient_1 = require("../clients/kongClient");
async function fetchErc20PriceUsd(chainId, address) {
    try {
        const kong = new kongClient_1.KongClient();
        const prices = await kong.getPrices({ chainId, address });
        const latest = prices?.[0]?.priceUsd ?? 0;
        return { priceUsd: Number(latest) };
    }
    catch {
        return { priceUsd: 0 };
    }
}
