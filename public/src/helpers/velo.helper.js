"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVeloGaugeFromVoter = getVeloGaugeFromVoter;
exports.getVeloGaugeData = getVeloGaugeData;
exports.determineLocalKeepVelo = determineLocalKeepVelo;
const viem_1 = require("viem");
const rpcs_1 = require("../utils/rpcs");
const abis_1 = require("../abis");
const maps_helper_1 = require("./maps.helper");
const abis_2 = require("../abis");
const bignumber_int_1 = require("./bignumber-int");
/**
 * Query the Velodrome/Aerodrome voter registry for the gauge address of a given LP token.
 * Returns null if no gauge exists (zero address response).
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:24-41
 */
async function getVeloGaugeFromVoter(chainId, lpTokenAddress) {
    const voterAddress = maps_helper_1.VELO_VOTER_ADDRESS[chainId];
    if (!voterAddress) {
        return null;
    }
    try {
        const client = (0, viem_1.createPublicClient)({
            chain: (0, rpcs_1.getChainFromChainId)(chainId),
            transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
        });
        const gaugeAddress = (await client.readContract({
            address: voterAddress,
            abi: abis_1.veloVoterAbi,
            functionName: 'gauges',
            args: [lpTokenAddress],
        }));
        // Zero address means no gauge exists
        if (gaugeAddress === viem_1.zeroAddress) {
            return null;
        }
        return gaugeAddress;
    }
    catch (error) {
        console.log(`Failed to fetch gauge for LP token ${lpTokenAddress} on chain ${chainId}:`, error);
        return null;
    }
}
/**
 * Fetch all required gauge data in parallel from the Velodrome/Aerodrome gauge contract.
 * Returns gauge state including periodFinish, rewardRate, totalSupply, rewardToken, and decimals.
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:48-62
 */
async function getVeloGaugeData(chainId, gaugeAddress) {
    try {
        const client = (0, viem_1.createPublicClient)({
            chain: (0, rpcs_1.getChainFromChainId)(chainId),
            transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
        });
        // Fetch all gauge data in parallel
        const [periodFinish, rewardRate, totalSupply, rewardToken, decimals] = await Promise.all([
            client.readContract({
                address: gaugeAddress,
                abi: abis_1.veloGaugeAbi,
                functionName: 'periodFinish',
            }),
            client.readContract({
                address: gaugeAddress,
                abi: abis_1.veloGaugeAbi,
                functionName: 'rewardRate',
            }),
            client.readContract({
                address: gaugeAddress,
                abi: abis_1.veloGaugeAbi,
                functionName: 'totalSupply',
            }),
            client.readContract({
                address: gaugeAddress,
                abi: abis_1.veloGaugeAbi,
                functionName: 'rewardToken',
            }),
            client.readContract({
                address: gaugeAddress,
                abi: abis_1.veloGaugeAbi,
                functionName: 'decimals',
            }),
        ]);
        return {
            periodFinish,
            rewardRate,
            totalSupply,
            rewardToken,
            decimals,
        };
    }
    catch (error) {
        console.log(`Failed to fetch gauge data for ${gaugeAddress} on chain ${chainId}:`, error);
        return null;
    }
}
/**
 * Read localKeepVelo from the strategy contract.
 * Returns 0 if the strategy doesn't have this field or if the call fails.
 * See: ~/git/ydaemon/process/apr/forward.velodrome.go:61-68
 */
async function determineLocalKeepVelo(chainId, strategyAddress) {
    try {
        const client = (0, viem_1.createPublicClient)({
            chain: (0, rpcs_1.getChainFromChainId)(chainId),
            transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
        });
        // Try to read localKeepVELO from the strategy
        const localKeepVeloRaw = (await client.readContract({
            address: strategyAddress,
            abi: abis_2.convexBaseStrategyAbi,
            functionName: 'localKeepVELO',
        }));
        // Normalize from 4 decimals (10000 = 100%)
        return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(localKeepVeloRaw), 4).toNumber();
    }
    catch (error) {
        // Strategy doesn't have localKeepVELO field, return 0
        return 0;
    }
}
