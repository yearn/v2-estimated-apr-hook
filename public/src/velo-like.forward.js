"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVelodromeVault = isVelodromeVault;
exports.isVelodromeStrategy = isVelodromeStrategy;
exports.calculateVeloLikeStrategyAPY = calculateVeloLikeStrategyAPY;
exports.computeVeloLikeForwardAPY = computeVeloLikeForwardAPY;
const prices_1 = require("./utils/prices");
const bignumber_float_1 = require("./helpers/bignumber-float");
const bignumber_int_1 = require("./helpers/bignumber-int");
const calculation_helper_1 = require("./helpers/calculation.helper");
const helpers_1 = require("./helpers");
/**
 * Check if the vault is a Velodrome/Aerodrome vault based on name.
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:24-41
 */
function isVelodromeVault(vault) {
    const vaultName = (vault?.name || '').toLowerCase();
    return vaultName.includes('velodrome') || vaultName.includes('aerodrome') || vaultName.includes('velo');
}
/**
 * Check if the strategy is a Velodrome/Aerodrome strategy based on name.
 */
function isVelodromeStrategy(strategy) {
    const strategyName = (strategy?.name || '').toLowerCase();
    return strategyName.includes('velodrome') || strategyName.includes('aerodrome') || strategyName.includes('velo');
}
/**
 * Calculate the forward APY for a single Velodrome/Aerodrome strategy.
 *
 * Formula breakdown:
 * 1. Gross APR = (rewardRate × (1 - keepVELO) × rewardTokenPrice × 31,536,000) / (poolPrice × totalSupply)
 * 2. Net APR = (grossAPR × (1 - performanceFee)) - managementFee
 * 3. Net APY = (1 + APR/n)^n - 1, where n = 24.33 (365/15 day compounding)
 * 4. Final APY = netAPY × debtRatio
 *
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:43-177
 */
async function calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, chainId) {
    // Fetch gauge data
    const gaugeData = await (0, helpers_1.getVeloGaugeData)(chainId, gaugeAddress);
    if (!gaugeData) {
        console.log(`No gauge data found for ${gaugeAddress}`);
        return null;
    }
    const { periodFinish, rewardRate, totalSupply, rewardToken } = gaugeData;
    // Get localKeepVelo from strategy
    const localKeepVelo = await (0, helpers_1.determineLocalKeepVelo)(chainId, strategy.address);
    // Check if rewards period has expired
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:73-81
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (periodFinish < now) {
        console.log(`Rewards period expired for gauge ${gaugeAddress}`);
        return {
            type: 'v2:velo_unpopular',
            debtRatio: 0,
            netAPY: 0,
            netAPR: 0,
            grossAPR: 0,
            keepVelo: localKeepVelo,
        };
    }
    // Check if total supply is zero (no staked liquidity)
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:86-93
    if (totalSupply === BigInt(0)) {
        console.log(`No liquidity staked in gauge ${gaugeAddress}`);
        return {
            type: 'v2:velo_unpopular',
            debtRatio: 0,
            netAPY: 0,
            netAPR: 0,
            grossAPR: 0,
            keepVelo: localKeepVelo,
        };
    }
    // Check if reward rate is zero or keepVelo is 100%
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:112-119
    const oneMinusKeepVelo = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), new bignumber_float_1.Float(localKeepVelo));
    if (rewardRate === BigInt(0) || oneMinusKeepVelo.isZero()) {
        console.log(`Zero reward rate or 100% keepVelo for gauge ${gaugeAddress}`);
        return {
            type: 'v2:velo_unpopular',
            debtRatio: 0,
            netAPY: 0,
            netAPR: 0,
            grossAPR: 0,
            keepVelo: localKeepVelo,
        };
    }
    // Get vault/strategy parameters
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:100-107
    const debtRatio = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(strategy.debtRatio || 0), 4);
    const performanceFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(vault.performanceFee ?? 0), 4);
    const managementFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(vault.managementFee ?? 0), 4);
    const oneMinusPerfFee = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), performanceFee);
    // Normalize reward rate and total supply
    const rewardRateNorm = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(rewardRate), 18);
    const totalSupplyNorm = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(totalSupply), 18);
    const secondsPerYear = new bignumber_float_1.Float(31556952); // Match ydaemon exactly
    // Fetch prices
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:125-133
    const vaultAsset = vault.asset?.address;
    const [{ priceUsd: poolPriceUsd }, { priceUsd: rewardPriceUsd }] = await Promise.all([
        (0, prices_1.fetchErc20PriceUsd)(chainId, vaultAsset),
        (0, prices_1.fetchErc20PriceUsd)(chainId, rewardToken),
    ]);
    if (!poolPriceUsd || !rewardPriceUsd) {
        console.log(`Missing price data for gauge ${gaugeAddress}`);
        return null;
    }
    const poolPrice = new bignumber_float_1.Float(poolPriceUsd);
    const rewardPrice = new bignumber_float_1.Float(rewardPriceUsd);
    // Calculate Gross APR
    // Formula: (rewardRate × (1 - keepVELO) × rewardTokenPrice × SECONDS_PER_YEAR) / (poolPrice × totalSupply)
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:138-142
    let adjustedRewardRate = new bignumber_float_1.Float().mul(rewardRateNorm, oneMinusKeepVelo); // rewardRate * (1 - keepVelo)
    let grossAPRTop = new bignumber_float_1.Float().mul(adjustedRewardRate, rewardPrice); // rewardRate * tokenPrice
    grossAPRTop = new bignumber_float_1.Float().mul(grossAPRTop, secondsPerYear); // rewardRate * tokenPrice * SECONDS_PER_YEAR
    const grossAPRBottom = new bignumber_float_1.Float().mul(poolPrice, totalSupplyNorm); // poolPrice * totalSupply
    const grossAPR = new bignumber_float_1.Float().div(grossAPRTop, grossAPRBottom); // (rewardRate * tokenPrice * SECONDS_PER_YEAR) / (poolPrice * totalSupply)
    // Calculate Net APR
    // Formula: (grossAPR × (1 - performanceFee)) - managementFee
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:148-153
    let netAPR = new bignumber_float_1.Float().mul(grossAPR, oneMinusPerfFee); // grossAPR * (1 - perfFee)
    if (netAPR.gt(managementFee)) {
        netAPR = new bignumber_float_1.Float().sub(netAPR, managementFee); // (grossAPR * (1 - perfFee)) - managementFee
    }
    else {
        netAPR = new bignumber_float_1.Float(0);
    }
    // Calculate Net APY with 15-day compounding (24.33 periods per year)
    // Formula: (1 + APR/n)^n - 1, where n = 365/15 = 24.33
    // See: ~/git/ydaemon/process/apr/forward.velodrome.go:159-166
    // and ~/git/ydaemon/process/apr/helpers.go:12-23
    const [netAPRFloat64] = netAPR.toFloat64();
    const netAPRPercentage = netAPRFloat64 * 100; // Convert to percentage for convertFloatAPRToAPY
    const compoundingPeriodsPerYear = 365 / 15; // 24.33 periods
    const netAPYPercentage = (0, calculation_helper_1.convertFloatAPRToAPY)(netAPRPercentage, compoundingPeriodsPerYear);
    const netAPY = new bignumber_float_1.Float(netAPYPercentage / 100); // Convert back to decimal
    return {
        type: 'v2:velo',
        debtRatio: debtRatio.toFloat64()[0],
        netAPY: new bignumber_float_1.Float().mul(netAPY, debtRatio).toFloat64()[0],
        netAPR: new bignumber_float_1.Float().mul(netAPR, debtRatio).toFloat64()[0],
        grossAPR: new bignumber_float_1.Float().mul(grossAPR, debtRatio).toFloat64()[0],
        keepVelo: localKeepVelo,
    };
}
/**
 * Compute forward APY for a Velodrome/Aerodrome vault by aggregating all strategies.
 *
 * For vaults with multiple strategies, this sums the APYs weighted by debt ratio.
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:183-230
 */
async function computeVeloLikeForwardAPY({ vault, allStrategiesForVault, chainId, }) {
    // Only support Optimism (10) and Base (8453)
    if (chainId !== 10 && chainId !== 8453) {
        console.log(`Velodrome not supported on chain ${chainId}`);
        return { type: '', netAPY: 0 };
    }
    // Get gauge address from voter registry
    const vaultAsset = vault.asset?.address;
    const gaugeAddress = await (0, helpers_1.getVeloGaugeFromVoter)(chainId, vaultAsset);
    if (!gaugeAddress) {
        console.log(`No gauge found for vault ${vault.address} on chain ${chainId}`);
        return { type: '', netAPY: 0 };
    }
    // Calculate APY for each strategy and aggregate
    let typeOf = '';
    let netAPY = new bignumber_float_1.Float(0);
    let keepVelo = new bignumber_float_1.Float(0);
    const strategyAPRs = await Promise.all(allStrategiesForVault.map(async (strategy) => {
        // Skip strategies with zero debt ratio
        if (!strategy.debtRatio || strategy.debtRatio === 0) {
            return null;
        }
        return calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, chainId);
    }));
    // Aggregate results
    for (const s of strategyAPRs) {
        if (!s)
            continue;
        typeOf += ` ${s.type}`.trim();
        netAPY = new bignumber_float_1.Float().add(netAPY, new bignumber_float_1.Float(s.netAPY || 0));
        // Weight keepVelo by debt ratio
        const debtRatio = new bignumber_float_1.Float(s.debtRatio || 0);
        keepVelo = new bignumber_float_1.Float().add(keepVelo, new bignumber_float_1.Float().mul(new bignumber_float_1.Float(s.keepVelo || 0), debtRatio));
    }
    return {
        type: typeOf.trim(),
        netAPR: netAPY.toFloat64()[0],
        netAPY: netAPY.toFloat64()[0],
        keepVelo: keepVelo.toFloat64()[0],
    };
}
