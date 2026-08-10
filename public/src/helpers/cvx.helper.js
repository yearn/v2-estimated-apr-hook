"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConvexRewardAPY = exports.getCVXForCRV = void 0;
const viem_1 = require("viem");
const prices_1 = require("../utils/prices");
const calculation_helper_1 = require("./calculation.helper");
const maps_helper_1 = require("./maps.helper");
const abis_1 = require("../abis");
const bignumber_float_1 = require("./bignumber-float");
const bignumber_int_1 = require("./bignumber-int");
const rpcs_1 = require("../utils/rpcs");
const getCVXForCRV = async (chainID, crvEarned) => {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainID),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainID}`]),
    });
    // Constants from Go code
    const cliffSize = new bignumber_float_1.Float(0).setString('100000000000000000000000'); // 1e23
    const cliffCount = new bignumber_float_1.Float(0).setString('1000'); // 1e3
    const maxSupply = new bignumber_float_1.Float(0).setString('100000000000000000000000000'); // 1e26
    try {
        // Get CVX total supply from contract
        const cvxTotalSupplyInt = await client.readContract({
            address: maps_helper_1.CVX_TOKEN_ADDRESS[chainID],
            abi: viem_1.erc20Abi,
            functionName: 'totalSupply',
        });
        // Convert to Float for calculations
        const cvxTotalSupply = new bignumber_float_1.Float(0).setInt(new bignumber_int_1.BigNumberInt(cvxTotalSupplyInt));
        const crvEarnedFloat = new bignumber_float_1.Float(0).setInt(new bignumber_int_1.BigNumberInt(crvEarned));
        // Calculate current cliff
        const currentCliff = new bignumber_float_1.Float(0).div(cvxTotalSupply, cliffSize);
        // If current cliff >= cliff count, return zero
        if (currentCliff.gte(cliffCount)) {
            return new bignumber_float_1.Float(0);
        }
        // Calculate remaining and cvxEarned
        const remaining = new bignumber_float_1.Float(0).sub(cliffCount, currentCliff);
        let cvxEarned = new bignumber_float_1.Float(0).mul(crvEarnedFloat, remaining);
        cvxEarned = new bignumber_float_1.Float(0).div(cvxEarned, cliffCount);
        // Check amount till max supply
        const amountTillMax = new bignumber_float_1.Float(0).sub(maxSupply, cvxTotalSupply);
        if (cvxEarned.gt(amountTillMax)) {
            cvxEarned = amountTillMax;
        }
        // Convert back to bigint
        return cvxEarned;
    }
    catch (error) {
        return new bignumber_float_1.Float(0);
    }
};
exports.getCVXForCRV = getCVXForCRV;
const getConvexRewardAPY = async (chainID, strategy, baseAssetPrice, poolPrice) => {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainID),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainID}`]),
    });
    // Get reward PID from strategy
    let rewardPID;
    try {
        rewardPID = await client.readContract({
            address: strategy,
            abi: abis_1.convexBaseStrategyAbi,
            functionName: 'pid',
        });
    }
    catch (error) {
        try {
            rewardPID = await client.readContract({
                address: strategy,
                abi: abis_1.convexBaseStrategyAbi,
                functionName: 'id',
            });
        }
        catch (error) {
            try {
                rewardPID = await client.readContract({
                    address: strategy,
                    abi: abis_1.convexBaseStrategyAbi,
                    functionName: 'fraxPid',
                });
            }
            catch (error) {
                return { totalRewardsAPR: new bignumber_float_1.Float(0), totalRewardsAPY: new bignumber_float_1.Float(0) };
            }
        }
    }
    // Get pool info from booster
    let poolInfo;
    try {
        poolInfo = await client.readContract({
            address: maps_helper_1.CVX_TOKEN_ADDRESS[chainID],
            abi: abis_1.cvxBoosterAbi,
            functionName: 'poolInfo',
            args: [rewardPID],
        });
    }
    catch (error) {
        return { totalRewardsAPR: new bignumber_float_1.Float(0), totalRewardsAPY: new bignumber_float_1.Float(0) };
    }
    // Get rewards length
    let rewardsLength;
    try {
        rewardsLength = await client.readContract({
            address: poolInfo.crvRewards,
            abi: abis_1.crvRewardsAbi,
            functionName: 'extraRewardsLength',
        });
    }
    catch (error) {
        return { totalRewardsAPR: new bignumber_float_1.Float(0), totalRewardsAPY: new bignumber_float_1.Float(0) };
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    let totalRewardsAPR = new bignumber_float_1.Float(0);
    if (rewardsLength > BigInt(0)) {
        for (let i = 0; i < Number(rewardsLength); i++) {
            try {
                const virtualRewardsPool = await client.readContract({
                    address: poolInfo.crvRewards,
                    abi: abis_1.crvRewardsAbi,
                    functionName: 'extraRewards',
                    args: [BigInt(i)],
                });
                // Parallelize reading from virtualRewardsPool
                const [periodFinish, rewardToken, rewardRateInt, totalSupplyInt] = await Promise.all([
                    client.readContract({
                        address: virtualRewardsPool,
                        abi: abis_1.crvRewardsAbi,
                        functionName: 'periodFinish',
                    }),
                    client.readContract({
                        address: virtualRewardsPool,
                        abi: abis_1.crvRewardsAbi,
                        functionName: 'rewardToken',
                    }),
                    client.readContract({
                        address: virtualRewardsPool,
                        abi: abis_1.crvRewardsAbi,
                        functionName: 'rewardRate',
                    }),
                    client.readContract({
                        address: virtualRewardsPool,
                        abi: abis_1.crvRewardsAbi,
                        functionName: 'totalSupply',
                    })
                ]);
                if (periodFinish < now) {
                    continue;
                }
                // Fetch price with fallback if not available
                const { priceUsd: rewardTokenPrice } = await (0, prices_1.fetchErc20PriceUsd)(chainID, rewardToken);
                if (!rewardTokenPrice) {
                    continue;
                }
                // Convert to Float following Go implementation pattern exactly
                const tokenPrice = new bignumber_float_1.Float(rewardTokenPrice); // rewardTokenPrice.HumanizedPrice equivalent
                // helpers.ToNormalizedAmount equivalent - using the proper function
                const rewardRate = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(rewardRateInt), 18);
                const totalSupply = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(totalSupplyInt), 18);
                const secondPerYear = new bignumber_float_1.Float(0).setFloat64(31556952);
                // Following the Go implementation calculations exactly
                let rewardAPRTop = new bignumber_float_1.Float(0).mul(rewardRate, secondPerYear);
                rewardAPRTop = new bignumber_float_1.Float(0).mul(rewardAPRTop, tokenPrice);
                let rewardAPRBottom = new bignumber_float_1.Float(0).div(poolPrice, new bignumber_float_1.Float(1)); // storage.ONE equivalent
                rewardAPRBottom = new bignumber_float_1.Float(0).mul(rewardAPRBottom, baseAssetPrice);
                rewardAPRBottom = new bignumber_float_1.Float(0).mul(rewardAPRBottom, totalSupply);
                const rewardAPR = new bignumber_float_1.Float(0).div(rewardAPRTop, rewardAPRBottom);
                totalRewardsAPR = new bignumber_float_1.Float(0).add(totalRewardsAPR, rewardAPR);
            }
            catch (error) {
                continue;
            }
        }
    }
    const [totalRewardsAPRFloat64] = totalRewardsAPR.toFloat64();
    const totalRewardsAPY = new bignumber_float_1.Float((0, calculation_helper_1.convertFloatAPRToAPY)(totalRewardsAPRFloat64, 365 / 15));
    return {
        totalRewardsAPR: totalRewardsAPR,
        totalRewardsAPY: totalRewardsAPY
    };
};
exports.getConvexRewardAPY = getConvexRewardAPY;
