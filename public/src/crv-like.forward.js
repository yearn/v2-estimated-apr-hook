"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurveStrategy = isCurveStrategy;
exports.isConvexStrategy = isConvexStrategy;
exports.isFraxStrategy = isFraxStrategy;
exports.isPrismaStrategy = isPrismaStrategy;
exports.findGaugeForVault = findGaugeForVault;
exports.findPoolForVault = findPoolForVault;
exports.findFraxPoolForVault = findFraxPoolForVault;
exports.findSubgraphItemForVault = findSubgraphItemForVault;
exports.getPoolWeeklyAPY = getPoolWeeklyAPY;
exports.getPoolDailyAPY = getPoolDailyAPY;
exports.getPoolPrice = getPoolPrice;
exports.getRewardsAPY = getRewardsAPY;
exports.getCVXPoolAPY = getCVXPoolAPY;
exports.determineCurveKeepCRV = determineCurveKeepCRV;
exports.calculateCurveForwardAPY = calculateCurveForwardAPY;
exports.calculateConvexForwardAPY = calculateConvexForwardAPY;
exports.calculateFraxForwardAPY = calculateFraxForwardAPY;
exports.calculatePrismaForwardAPR = calculatePrismaForwardAPR;
exports.calculateGaugeBaseAPR = calculateGaugeBaseAPR;
exports.calculateCurveLikeStrategyAPR = calculateCurveLikeStrategyAPR;
exports.computeCurveLikeForwardAPY = computeCurveLikeForwardAPY;
const viem_1 = require("viem");
const prices_1 = require("./utils/prices");
const convex_base_strategy_abi_1 = require("./abis/convex-base-strategy.abi");
const crv_rewards_abi_1 = require("./abis/crv-rewards.abi");
const cvx_booster_abi_1 = require("./abis/cvx-booster.abi");
const yprisma_abi_1 = require("./abis/yprisma.abi");
const helpers_1 = require("./helpers");
const bignumber_float_1 = require("./helpers/bignumber-float");
const bignumber_int_1 = require("./helpers/bignumber-int");
const rpcs_1 = require("./utils/rpcs");
const _0xAbis_abi_1 = require("./abis/0xAbis.abi");
function isCurveStrategy(vault) {
    const vaultName = (vault?.name || '').toLowerCase();
    return ((vaultName.includes('curve') || vaultName.includes('convex') || vaultName.includes('crv')) &&
        !vaultName.includes('ajna-'));
}
function isConvexStrategy(strategy) {
    const strategyName = strategy.name?.toLowerCase();
    return strategyName?.includes('convex') && !strategyName?.includes('curve');
}
function isFraxStrategy(strategy) {
    return strategy?.name?.toLowerCase().includes('frax');
}
function isPrismaStrategy(strategy) {
    return strategy?.name?.toLowerCase().includes('prisma');
}
function findGaugeForVault(assetAddress, gauges) {
    if (!assetAddress)
        return null;
    return gauges.find((gauge) => {
        // Match Go logic: check SwapToken field first
        if (gauge.swap_token?.toLowerCase() === assetAddress.toLowerCase()) {
            return true;
        }
        if (gauge.swap?.toLowerCase() === assetAddress.toLowerCase()) {
            return true;
        }
        return false;
    });
}
function findPoolForVault(assetAddress, pools) {
    return pools.find((pool) => pool.lpTokenAddress?.toLowerCase() === assetAddress.toLowerCase());
}
function findFraxPoolForVault(assetAddress, fraxPools) {
    return fraxPools.find((pool) => pool.underlyingTokenAddress.toLowerCase() === assetAddress.toLowerCase());
}
function findSubgraphItemForVault(swapAddress, subgraphData) {
    return subgraphData.find((item) => item.address && item.address.toLowerCase() === swapAddress?.toLowerCase());
}
function getPoolWeeklyAPY(subgraphItem) {
    return new bignumber_float_1.Float().div(new bignumber_float_1.Float(subgraphItem?.latestWeeklyApy || 0), new bignumber_float_1.Float(100));
}
function getPoolDailyAPY(subgraphItem) {
    return new bignumber_float_1.Float().div(new bignumber_float_1.Float(subgraphItem?.latestDailyApy || 0), new bignumber_float_1.Float(100));
}
function getPoolPrice(gauge) {
    const vp = gauge.swap_data?.virtual_price
        ? new bignumber_int_1.BigNumberInt(gauge.swap_data.virtual_price)
        : new bignumber_int_1.BigNumberInt(0);
    return (0, bignumber_int_1.toNormalizedAmount)(vp, 18);
}
function getRewardsAPY(pool) {
    let total = new bignumber_float_1.Float(0);
    if (!pool?.gaugeRewards?.length)
        return total;
    for (const reward of pool.gaugeRewards) {
        const apr = new bignumber_float_1.Float().div(new bignumber_float_1.Float(reward.APY), new bignumber_float_1.Float(100));
        total = new bignumber_float_1.Float().add(total, apr);
    }
    return total;
}
async function getCVXPoolAPY(chainId, strategyAddress, baseAssetPrice) {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainId),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
    });
    let crvAPR = new bignumber_float_1.Float(0), cvxAPR = new bignumber_float_1.Float(0), crvAPY = new bignumber_float_1.Float(0), cvxAPY = new bignumber_float_1.Float(0);
    try {
        let rewardPID;
        try {
            rewardPID = await client.readContract({
                address: strategyAddress,
                abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
                functionName: 'PID',
                args: [],
            });
        }
        catch {
            try {
                rewardPID = await client.readContract({
                    address: strategyAddress,
                    abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
                    functionName: 'ID',
                    args: [],
                });
            }
            catch {
                try {
                    rewardPID = await client.readContract({
                        address: strategyAddress,
                        abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
                        functionName: 'fraxPid',
                        args: [],
                    });
                }
                catch {
                    return { crvAPR, cvxAPR, crvAPY, cvxAPY };
                }
            }
        }
        let poolInfo;
        try {
            poolInfo = (await client.readContract({
                address: helpers_1.CVX_BOOSTER_ADDRESS[chainId],
                abi: cvx_booster_abi_1.cvxBoosterAbi,
                functionName: 'poolInfo',
                args: [rewardPID],
            }));
        }
        catch {
            return { crvAPR, cvxAPR, crvAPY, cvxAPY };
        }
        const [rateResult, totalSupply] = (await Promise.all([
            client.readContract({
                address: poolInfo.crvRewards,
                abi: crv_rewards_abi_1.crvRewardsAbi,
                functionName: 'rewardRate',
                args: [],
            }),
            client.readContract({
                address: poolInfo.crvRewards,
                abi: crv_rewards_abi_1.crvRewardsAbi,
                functionName: 'totalSupply',
                args: [],
            }),
        ]));
        const rate = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(rateResult), 18);
        const supply = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(totalSupply), 18);
        let crvPerUnderlying = new bignumber_float_1.Float(0);
        const virtualSupply = new bignumber_float_1.Float(0).mul(supply, baseAssetPrice);
        if (virtualSupply.gt(new bignumber_float_1.Float(0)))
            crvPerUnderlying = new bignumber_float_1.Float(0).div(rate, virtualSupply);
        const crvPerUnderlyingPerYear = new bignumber_float_1.Float(0).mul(crvPerUnderlying, new bignumber_float_1.Float(31536000));
        const cvxPerYear = await (0, helpers_1.getCVXForCRV)(chainId, BigInt(crvPerUnderlyingPerYear.toNumber()));
        const [{ priceUsd: crvPrice }, { priceUsd: cvxPrice }] = await Promise.all([
            (0, prices_1.fetchErc20PriceUsd)(chainId, helpers_1.CRV_TOKEN_ADDRESS[chainId]),
            (0, prices_1.fetchErc20PriceUsd)(chainId, helpers_1.CVX_TOKEN_ADDRESS[chainId]),
        ]);
        crvAPR = new bignumber_float_1.Float(0).mul(crvPerUnderlyingPerYear, new bignumber_float_1.Float(crvPrice));
        cvxAPR = new bignumber_float_1.Float(0).mul(cvxPerYear, new bignumber_float_1.Float(cvxPrice));
        const [crvAPRFloat64] = crvAPR.toFloat64();
        const [cvxAPRFloat64] = cvxAPR.toFloat64();
        crvAPY = new bignumber_float_1.Float().setFloat64((0, helpers_1.convertFloatAPRToAPY)(crvAPRFloat64, 365 / 15));
        cvxAPY = new bignumber_float_1.Float().setFloat64((0, helpers_1.convertFloatAPRToAPY)(cvxAPRFloat64, 365 / 15));
    }
    catch { }
    return { crvAPR, cvxAPR, crvAPY, cvxAPY };
}
function getStrategyContractAbi(strategy) {
    if (strategy.apiVersion === '0.2.2') {
        return _0xAbis_abi_1.YEARN_VAULT_V022_ABI;
    }
    if (strategy.apiVersion === '0.3.0' || strategy.apiVersion === '0.3.1') {
        return _0xAbis_abi_1.YEARN_VAULT_V030_ABI;
    }
    return _0xAbis_abi_1.YEARN_VAULT_ABI_04;
}
async function determineCurveKeepCRV(strategy, chainId) {
    if (strategy.localKeepCRV && BigInt(strategy.localKeepCRV) > 0) {
        return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(BigInt(strategy.localKeepCRV)), 4).toNumber();
    }
    let keepPercentage = BigInt(0);
    let keepCRV = BigInt(0);
    try {
        const client = (0, viem_1.createPublicClient)({
            chain: (0, rpcs_1.getChainFromChainId)(chainId),
            transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
        });
        const abi = getStrategyContractAbi(strategy);
        // Run both contract reads in parallel (matching kong logic)
        const [keepCRVResult, keepPercentageResult] = await Promise.all([
            client.readContract({
                address: strategy.address,
                abi,
                functionName: 'keepCRV',
                args: [],
            }),
            client.readContract({
                address: strategy.address,
                abi,
                functionName: 'keepCRVPercentage',
                args: [],
            }),
        ]);
        keepCRV = keepCRVResult;
        keepPercentage = keepPercentageResult;
    }
    catch {
        return 0;
    }
    // Add keepCRV and keepPercentage together (kong logic)
    const keepValue = new bignumber_int_1.BigNumberInt(keepCRV).add(new bignumber_int_1.BigNumberInt(keepPercentage));
    return (0, bignumber_int_1.toNormalizedAmount)(keepValue, 4).toNumber();
}
async function calculateCurveForwardAPY(data) {
    const chainId = data.chainId;
    const [yboost, keepCrv] = await Promise.all([
        (0, helpers_1.getCurveBoost)(chainId, helpers_1.YEARN_VOTER_ADDRESS[chainId], data.gaugeAddress),
        determineCurveKeepCRV(data.strategy, chainId),
    ]);
    const debtRatio = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(data.lastDebtRatio.toNumber()), 4);
    const performanceFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(data.vault.performanceFee ?? 0), 4);
    const managementFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(data.vault.managementFee ?? 0), 4);
    const oneMinusPerfFee = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), performanceFee);
    let crvAPY = new bignumber_float_1.Float().mul(data.baseAPY, yboost);
    crvAPY = new bignumber_float_1.Float().add(crvAPY, data.rewardAPY);
    const keepCRVRatio = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), new bignumber_float_1.Float(Number(keepCrv))); // 1 - keepCRV
    let grossAPY = new bignumber_float_1.Float().mul(data.baseAPY, yboost); // baseAPR * yBoost
    grossAPY = new bignumber_float_1.Float().mul(grossAPY, keepCRVRatio); // (baseAPR * yBoost) * (1 - keepCRV)
    grossAPY = new bignumber_float_1.Float().add(grossAPY, data.rewardAPY); // + rewardAPY
    grossAPY = new bignumber_float_1.Float().add(grossAPY, data.poolAPY); // + poolAPY
    let netAPR = new bignumber_float_1.Float().mul(grossAPY, oneMinusPerfFee);
    if (netAPR.gt(managementFee))
        netAPR = new bignumber_float_1.Float().sub(netAPR, managementFee);
    else
        netAPR = new bignumber_float_1.Float(0);
    // Calculate APY from APR based on vault version
    // For vaults < 0.3.0, APY = APR (simple interest)
    // For vaults >= 0.3.0, APY could use compound formula but keeping it simple for forward APR
    let netAPY;
    const apiVersion = data.vault.apiVersion || '0.0.0';
    const versionParts = apiVersion.split('.');
    const majorVersion = parseInt(versionParts[0] || '0');
    const minorVersion = parseInt(versionParts[1] || '0');
    if (majorVersion === 0 && minorVersion < 3) {
        // For v0.2.x and below, APY = APR
        netAPY = netAPR;
    }
    else {
        // For v0.3.0 and above, keep APY = APR for forward-looking calculations
        // The compound interest would be: APY = (1 + APR/52)^52 - 1 for weekly compounding
        netAPY = netAPR;
    }
    return {
        type: 'crv',
        debtRatio: debtRatio.toFloat64()[0],
        netAPR: new bignumber_float_1.Float().mul(netAPR, debtRatio).toFloat64()[0],
        netAPY: new bignumber_float_1.Float().mul(netAPY, debtRatio).toFloat64()[0],
        boost: new bignumber_float_1.Float().mul(yboost, debtRatio).toFloat64()[0],
        poolAPY: new bignumber_float_1.Float().mul(data.poolAPY, debtRatio).toFloat64()[0],
        boostedAPR: new bignumber_float_1.Float().mul(crvAPY, debtRatio).toFloat64()[0],
        baseAPR: new bignumber_float_1.Float().mul(data.baseAPY, debtRatio).toFloat64()[0],
        rewardsAPY: new bignumber_float_1.Float().mul(data.rewardAPY, debtRatio).toFloat64()[0],
        keepCRV: new bignumber_float_1.Float(keepCrv).toFloat64()[0],
    };
}
async function calculateConvexForwardAPY(data) {
    const { gaugeAddress, strategy, baseAssetPrice, poolPrice, baseAPY, poolWeeklyAPY, chainId, lastDebtRatio, } = data;
    const [cvxBoost, keepCRV] = await Promise.all([
        (0, helpers_1.getCurveBoost)(chainId, helpers_1.CONVEX_VOTER_ADDRESS[chainId], gaugeAddress),
        (0, helpers_1.determineConvexKeepCRV)(chainId, strategy),
    ]);
    const debtRatio = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(lastDebtRatio.toNumber()), 4);
    const performanceFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(strategy.performanceFee ?? 0), 4);
    const managementFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(strategy.managementFee ?? 0), 4);
    const oneMinusPerfFee = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), performanceFee);
    const [{ crvAPR, cvxAPR, crvAPY, cvxAPY }, { totalRewardsAPY: rewardsAPY }] = await Promise.all([
        getCVXPoolAPY(chainId, strategy.address, baseAssetPrice),
        (0, helpers_1.getConvexRewardAPY)(chainId, strategy.address, baseAssetPrice, poolPrice),
    ]);
    const keepCRVRatio = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), keepCRV);
    let grossAPY = new bignumber_float_1.Float().mul(crvAPY, keepCRVRatio);
    grossAPY = new bignumber_float_1.Float().add(grossAPY, rewardsAPY);
    grossAPY = new bignumber_float_1.Float().add(grossAPY, poolWeeklyAPY);
    grossAPY = new bignumber_float_1.Float().add(grossAPY, cvxAPY);
    let netAPR = new bignumber_float_1.Float().mul(grossAPY, oneMinusPerfFee);
    if (netAPR.gt(managementFee))
        netAPR = new bignumber_float_1.Float().sub(netAPR, managementFee);
    else
        netAPR = new bignumber_float_1.Float(0);
    // For Convex strategies, APY = APR (keeping it simple for forward-looking calculations)
    const netAPY = netAPR;
    return {
        type: 'cvx',
        debtRatio: debtRatio.toFloat64()[0],
        netAPY: new bignumber_float_1.Float().mul(netAPY, debtRatio).toFloat64()[0],
        boost: new bignumber_float_1.Float().mul(cvxBoost, debtRatio).toFloat64()[0],
        poolAPY: new bignumber_float_1.Float().mul(poolWeeklyAPY, debtRatio).toFloat64()[0],
        boostedAPR: new bignumber_float_1.Float().mul(crvAPR, debtRatio).toFloat64()[0],
        baseAPR: new bignumber_float_1.Float().mul(baseAPY, debtRatio).toFloat64()[0],
        cvxAPR: new bignumber_float_1.Float().mul(cvxAPR, debtRatio).toFloat64()[0],
        rewardsAPY: new bignumber_float_1.Float().mul(rewardsAPY, debtRatio).toFloat64()[0],
        keepCRV: keepCRV.toFloat64()[0],
    };
}
async function calculateFraxForwardAPY(data, fraxPool) {
    if (!fraxPool)
        return null;
    const base = await calculateConvexForwardAPY(data);
    const minRewardsAPR = parseFloat(fraxPool.totalRewardAprs.min);
    return {
        ...base,
        type: 'frax',
        netAPY: base.netAPY + minRewardsAPR,
        rewardsAPY: base.rewardsAPY + minRewardsAPR,
    };
}
async function calculatePrismaForwardAPR(data) {
    const { vault, chainId } = data;
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainId),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
    });
    const [receiver] = (await client.readContract({
        address: vault.address,
        abi: yprisma_abi_1.yprismaAbi,
        functionName: 'prismaReceiver',
        args: [],
    }));
    if (receiver === viem_1.zeroAddress)
        return null;
    const [base, [, prismaAPY]] = await Promise.all([
        calculateConvexForwardAPY({ ...data, lastDebtRatio: new bignumber_float_1.Float(data.strategy?.debtRatio || 0) }),
        (0, helpers_1.getPrismaAPY)(chainId, receiver),
    ]);
    return {
        type: 'prisma',
        debtRatio: base.debtRatio,
        netAPY: base.netAPY + prismaAPY,
        boost: base.boost,
        poolAPY: base.poolAPY,
        boostedAPR: base.boostedAPR,
        baseAPR: base.baseAPR,
        cvxAPR: base.cvxAPR,
        rewardsAPY: base.rewardsAPY + prismaAPY,
        keepCRV: base.keepCRV,
    };
}
async function calculateGaugeBaseAPR(gauge, crvTokenPrice, poolPrice, baseAssetPrice) {
    let inflationRate = new bignumber_float_1.Float(0);
    if (typeof gauge.gauge_controller.inflation_rate === 'string')
        inflationRate = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(gauge.gauge_controller.inflation_rate), 18);
    else
        inflationRate = new bignumber_float_1.Float().setFloat64(gauge.gauge_controller.inflation_rate);
    const gaugeWeight = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(gauge.gauge_controller.gauge_relative_weight), 18);
    const secondsPerYear = new bignumber_float_1.Float(31556952); // Match Go exactly
    const workingSupply = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(gauge.gauge_data.working_supply), 18);
    const perMaxBoost = new bignumber_float_1.Float(0.4);
    const crvPrice = crvTokenPrice instanceof bignumber_float_1.Float ? crvTokenPrice : new bignumber_float_1.Float(crvTokenPrice);
    const poolPriceFloat = poolPrice instanceof bignumber_float_1.Float ? poolPrice : new bignumber_float_1.Float(poolPrice);
    const baseAssetPriceFloat = baseAssetPrice instanceof bignumber_float_1.Float ? baseAssetPrice : new bignumber_float_1.Float(baseAssetPrice);
    let baseAPR = new bignumber_float_1.Float(0).mul(inflationRate, gaugeWeight);
    const yearsBySupply = new bignumber_float_1.Float(0).div(secondsPerYear, workingSupply);
    baseAPR = new bignumber_float_1.Float().mul(baseAPR, yearsBySupply);
    const boostByPool = new bignumber_float_1.Float(0).div(perMaxBoost, poolPriceFloat);
    baseAPR = new bignumber_float_1.Float().mul(baseAPR, boostByPool);
    baseAPR = new bignumber_float_1.Float().mul(baseAPR, crvPrice);
    baseAPR = new bignumber_float_1.Float().div(baseAPR, baseAssetPriceFloat);
    const [baseAPRFloat] = baseAPR.toFloat64();
    const baseAPY = new bignumber_float_1.Float().setFloat64((0, helpers_1.convertFloatAPRToAPY)(baseAPRFloat, 365 / 15));
    return { baseAPY, baseAPR };
}
async function calculateCurveLikeStrategyAPR(vault, strategy, gauge, pool, fraxPool, subgraphItem, chainId) {
    const baseAssetPrice = new bignumber_float_1.Float().setFloat64(gauge.lpTokenPrice || 0);
    const [{ priceUsd }, poolPrice] = await Promise.all([
        (0, prices_1.fetchErc20PriceUsd)(chainId, helpers_1.CRV_TOKEN_ADDRESS[chainId]),
        Promise.resolve(getPoolPrice(gauge)),
    ]);
    // TODO: Remove this fallback once price fetching is fixed
    const fallbackCrvPrice = priceUsd || 0.8618; // closer to current CRV price
    const crvPrice = new bignumber_float_1.Float(fallbackCrvPrice);
    const { baseAPY } = await calculateGaugeBaseAPR(gauge, crvPrice, poolPrice, baseAssetPrice);
    const rewardAPY = getRewardsAPY(pool);
    const poolWeeklyAPY = getPoolWeeklyAPY(subgraphItem);
    if (isPrismaStrategy(strategy))
        return calculatePrismaForwardAPR({
            vault,
            chainId,
            gaugeAddress: gauge.gauge,
            strategy: strategy,
            baseAssetPrice,
            poolPrice,
            baseAPY,
            rewardAPY,
            poolWeeklyAPY,
        });
    if (isFraxStrategy(strategy))
        return calculateFraxForwardAPY({
            gaugeAddress: gauge.gauge,
            strategy: strategy,
            baseAssetPrice,
            poolPrice,
            baseAPY,
            rewardAPY,
            poolWeeklyAPY,
            chainId,
            lastDebtRatio: new bignumber_float_1.Float(strategy.debtRatio || 0),
        }, fraxPool);
    if (isConvexStrategy(strategy))
        return calculateConvexForwardAPY({
            gaugeAddress: gauge.gauge,
            strategy: strategy,
            baseAssetPrice,
            poolPrice,
            baseAPY,
            rewardAPY,
            poolWeeklyAPY,
            chainId,
            lastDebtRatio: new bignumber_float_1.Float(strategy.debtRatio || 0),
        });
    return calculateCurveForwardAPY({
        gaugeAddress: gauge.gauge,
        vault,
        strategy: strategy,
        baseAPY,
        rewardAPY,
        poolAPY: poolWeeklyAPY,
        chainId,
        lastDebtRatio: new bignumber_float_1.Float(strategy.debtRatio || 0),
    });
}
async function computeCurveLikeForwardAPY({ vault, gauges, pools, subgraphData, fraxPools, allStrategiesForVault, chainId, }) {
    // Match kong logic: use vault.defaults.asset directly
    const vaultAsset = vault.asset?.address;
    const gauge = findGaugeForVault(vaultAsset, gauges);
    if (!gauge)
        return { type: '', netAPY: 0 };
    const pool = findPoolForVault(vaultAsset, pools);
    const fraxPool = findFraxPoolForVault(vaultAsset, fraxPools);
    const subgraphItem = findSubgraphItemForVault(gauge.swap, subgraphData);
    let typeOf = '', netAPY = new bignumber_float_1.Float(0), boost = new bignumber_float_1.Float(0), poolAPY = new bignumber_float_1.Float(0), boostedAPR = new bignumber_float_1.Float(0), baseAPR = new bignumber_float_1.Float(0), cvxAPR = new bignumber_float_1.Float(0), rewardsAPY = new bignumber_float_1.Float(0), keepCRV = new bignumber_float_1.Float(0);
    const strategyAPRs = await Promise.all(allStrategiesForVault.map(async (strategy) => {
        if (!strategy.debtRatio || strategy.debtRatio === 0)
            return null;
        return calculateCurveLikeStrategyAPR(vault, strategy, gauge, pool, fraxPool, subgraphItem, chainId);
    }));
    for (const s of strategyAPRs) {
        if (!s)
            continue;
        typeOf += s.type;
        netAPY = new bignumber_float_1.Float(0).add(netAPY, new bignumber_float_1.Float(s.netAPY || 0));
        boost = new bignumber_float_1.Float(0).add(boost, new bignumber_float_1.Float(s.boost || 0));
        poolAPY = new bignumber_float_1.Float(0).add(poolAPY, new bignumber_float_1.Float(s.poolAPY || 0));
        boostedAPR = new bignumber_float_1.Float(0).add(boostedAPR, new bignumber_float_1.Float(s.boostedAPR || 0));
        baseAPR = new bignumber_float_1.Float(0).add(baseAPR, new bignumber_float_1.Float(s.baseAPR || 0));
        cvxAPR = new bignumber_float_1.Float(0).add(cvxAPR, new bignumber_float_1.Float(s.cvxAPR || 0));
        rewardsAPY = new bignumber_float_1.Float(0).add(rewardsAPY, new bignumber_float_1.Float(s.rewardsAPY || 0));
        keepCRV = new bignumber_float_1.Float(0).add(keepCRV, new bignumber_float_1.Float(0).mul(new bignumber_float_1.Float(s.keepCRV || 0), new bignumber_float_1.Float(s.debtRatio || 0)));
    }
    return {
        type: typeOf,
        netAPR: netAPY.toFloat64()[0],
        netAPY: netAPY.toFloat64()[0],
        boost: boost.toFloat64()[0],
        poolAPY: poolAPY.toFloat64()[0],
        boostedAPR: boostedAPR.toFloat64()[0],
        baseAPR: baseAPR.toFloat64()[0],
        cvxAPR: cvxAPR.toFloat64()[0],
        rewardsAPY: rewardsAPY.toFloat64()[0],
        keepCRV: keepCRV.toFloat64()[0],
    };
}
