"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeVaultFapy = computeVaultFapy;
require("dotenv/config");
const service_1 = require("./service");
const fapy_1 = require("./fapy");
async function computeVaultFapy(chainId, vaultAddress) {
    try {
        const result = await (0, service_1.getVaultWithStrategies)(chainId, vaultAddress);
        if (!result)
            return null;
        const { vault, strategies } = result;
        if (!vault)
            return null;
        const fapy = await (0, fapy_1.computeChainAPY)(vault, chainId, strategies);
        if (!fapy)
            return null;
        return {
            netAPY: fapy.netAPY,
            boost: fapy.boost,
            poolAPY: fapy.poolAPY,
            boostedAPR: fapy.boostedAPR,
            baseAPR: fapy.baseAPR,
            rewardsAPY: fapy.rewardsAPY,
            cvxAPR: fapy.cvxAPR,
            keepCRV: fapy.keepCRV,
        };
    }
    catch (error) {
        console.log("error", error);
        return null;
    }
}
