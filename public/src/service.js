"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVaultWithStrategies = getVaultWithStrategies;
const kongClient_1 = require("./clients/kongClient");
async function getVaultWithStrategies(chainId, vaultAddress) {
    const kong = new kongClient_1.KongClient();
    const vault = await kong.getVault(chainId, vaultAddress);
    const allStrategies = await Promise.all((vault?.strategies || []).map((s) => kong.getStrategy(chainId, s)));
    const strategies = allStrategies
        .filter((s) => s !== null)
        .map((strategy) => {
        const debtRatio = vault?.debts?.find((d) => d.strategy === strategy.address)?.debtRatio;
        return {
            name: strategy.name,
            token: strategy.want,
            symbol: strategy.symbol,
            rewards: strategy.rewards,
            guardian: strategy.guardian,
            totalDebt: BigInt(strategy.totalDebt ?? 0),
            totalIdle: BigInt(strategy.totalIdle ?? 0),
            debtRatio: Number(debtRatio ?? 0),
            decimals: Number(strategy.decimals ?? 18),
            management: strategy.management,
            managementFee: Number(vault?.managementFee ?? 0),
            totalAssets: BigInt(strategy.totalAssets ?? 0),
            totalSupply: BigInt(strategy.totalSupply ?? 0),
            performanceFee: Number(strategy?.performanceFee ?? 0),
            localKeepCRV: BigInt(strategy.localKeepCRV ?? 0),
            pricePerShare: BigInt(strategy.pricePerShare ?? 0),
            apiVersion: strategy.apiVersion,
            ...strategy,
        };
    });
    if (!strategies && !vault)
        return null;
    return {
        vault,
        strategies,
    };
}
