"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCurrentV2VaultAPY = computeCurrentV2VaultAPY;
const viem_1 = require("viem");
const rpcs_1 = require("../utils/rpcs");
const bignumber_float_1 = require("./bignumber-float");
const bignumber_int_1 = require("./bignumber-int");
// Helper function to get block number by period (days ago)
async function getBlockNumberByPeriod(chainId, daysAgo) {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainId),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
    });
    if (daysAgo === 0) {
        const block = await client.getBlock({ blockTag: 'latest' });
        return block.number;
    }
    // Estimate block number based on average block time
    // Ethereum ~12 seconds per block, ~7200 blocks per day
    const blocksPerDay = chainId === 1 ? 7200n : 6400n; // Adjust for different chains
    const currentBlock = await client.getBlock({ blockTag: 'latest' });
    const targetBlock = currentBlock.number - (blocksPerDay * BigInt(daysAgo));
    return targetBlock > 0n ? targetBlock : 1n;
}
// Fetch price per share at a specific block
async function fetchPricePerShare(chainId, vaultAddress, blockNumber, decimals) {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainId),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainId}`]),
    });
    try {
        const pricePerShare = await client.readContract({
            address: vaultAddress,
            abi: [{
                    name: 'pricePerShare',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [],
                    outputs: [{ type: 'uint256' }],
                }],
            functionName: 'pricePerShare',
            blockNumber,
        });
        return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(pricePerShare), decimals);
    }
    catch (error) {
        console.error(`Error fetching PPS at block ${blockNumber}:`, error);
        return new bignumber_float_1.Float(1);
    }
}
// Calculate APY from two price points
function calculateAPY(ppsNow, ppsThen, days) {
    if (days <= 0)
        return new bignumber_float_1.Float(0);
    // APY = ((ppsNow / ppsThen) ^ (365 / days)) - 1
    const ratio = new bignumber_float_1.Float().div(ppsNow, ppsThen);
    const periodsPerYear = 365 / days;
    // For simplicity, approximate (ratio ^ periodsPerYear) - 1
    // Using: APY ≈ (ratio - 1) * periodsPerYear for small changes
    const growth = new bignumber_float_1.Float().sub(ratio, new bignumber_float_1.Float(1));
    return new bignumber_float_1.Float().mul(growth, new bignumber_float_1.Float(periodsPerYear));
}
function calculateWeeklyAPY(ppsToday, ppsWeekAgo) {
    return calculateAPY(ppsToday, ppsWeekAgo, 7);
}
function calculateMonthlyAPY(ppsToday, ppsMonthAgo) {
    return calculateAPY(ppsToday, ppsMonthAgo, 30);
}
async function computeCurrentV2VaultAPY(vault, chainId) {
    const yieldVault = vault.address;
    const decimals = vault.decimals || vault.asset?.decimals || 18;
    const activation = BigInt(vault.activation || 0);
    const performanceFee = Number(vault.performanceFee || 0);
    const managementFee = Number(vault.managementFee || 0);
    // Get block numbers for different periods
    const [estBlockToday, estBlockLastWeek, estBlockLastMonth, estBlockLastYear] = await Promise.all([
        getBlockNumberByPeriod(chainId, 0),
        getBlockNumberByPeriod(chainId, 7),
        getBlockNumberByPeriod(chainId, 30),
        getBlockNumberByPeriod(chainId, 365),
    ]);
    const blocksSinceDeployment = estBlockToday - activation;
    // Use the current price per share from the vault data
    const ppsToday = vault.pricePerShare
        ? (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(vault.pricePerShare), decimals)
        : await fetchPricePerShare(chainId, yieldVault, estBlockToday, decimals);
    let ppsWeekAgo = new bignumber_float_1.Float(1);
    let ppsMonthAgo = new bignumber_float_1.Float(1);
    let ppsInception = new bignumber_float_1.Float(1);
    let weeklyAPY = new bignumber_float_1.Float(0);
    let monthlyAPY = new bignumber_float_1.Float(0);
    let inceptionAPY = new bignumber_float_1.Float(0);
    const isLessThanAWeekOld = activation > 0n && estBlockLastWeek < activation;
    const isLessThanAMonthOld = activation > 0n && estBlockLastMonth < activation;
    // Calculate APY based on vault age
    if (isLessThanAWeekOld) {
        // Vault is less than a week old
        const numBlocksIn7Days = estBlockToday - estBlockLastWeek;
        const numBlocksPerDay = Number(numBlocksIn7Days) / 7;
        let daysSinceDeployment = Number(blocksSinceDeployment) / numBlocksPerDay;
        if (daysSinceDeployment < 1) {
            daysSinceDeployment = 1;
        }
        ppsInception = await fetchPricePerShare(chainId, yieldVault, activation, decimals);
        weeklyAPY = calculateAPY(ppsToday, ppsInception, daysSinceDeployment);
        monthlyAPY = weeklyAPY;
        inceptionAPY = monthlyAPY;
    }
    else if (isLessThanAMonthOld) {
        // Vault is less than a month old but more than a week
        ppsWeekAgo = await fetchPricePerShare(chainId, yieldVault, estBlockLastWeek, decimals);
        weeklyAPY = calculateWeeklyAPY(ppsToday, ppsWeekAgo);
        const numBlocksIn30Days = estBlockToday - estBlockLastMonth;
        const numBlocksPerDay = Number(numBlocksIn30Days) / 30;
        let daysSinceDeployment = Number(blocksSinceDeployment) / numBlocksPerDay;
        if (daysSinceDeployment < 1) {
            daysSinceDeployment = 1;
        }
        ppsInception = await fetchPricePerShare(chainId, yieldVault, activation, decimals);
        monthlyAPY = calculateAPY(ppsToday, ppsInception, daysSinceDeployment);
        inceptionAPY = monthlyAPY;
    }
    else {
        // Vault is more than a month old
        ppsWeekAgo = await fetchPricePerShare(chainId, yieldVault, estBlockLastWeek, decimals);
        weeklyAPY = calculateWeeklyAPY(ppsToday, ppsWeekAgo);
        ppsMonthAgo = await fetchPricePerShare(chainId, yieldVault, estBlockLastMonth, decimals);
        monthlyAPY = calculateMonthlyAPY(ppsToday, ppsMonthAgo);
        const numBlocksIn365Days = estBlockToday - estBlockLastYear;
        const numBlocksPerDay = Number(numBlocksIn365Days) / 365;
        const daysSinceDeployment = Number(blocksSinceDeployment) / numBlocksPerDay;
        ppsInception = await fetchPricePerShare(chainId, yieldVault, activation, decimals);
        inceptionAPY = calculateAPY(ppsToday, ppsInception, daysSinceDeployment);
    }
    // Calculate fees
    const vaultPerformanceFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(performanceFee), 4);
    const vaultManagementFee = (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt(managementFee), 4);
    const oneMinusPerfFee = new bignumber_float_1.Float().sub(new bignumber_float_1.Float(1), vaultPerformanceFee);
    // Calculate net APY from gross APY
    let netAPY = new bignumber_float_1.Float().mul(monthlyAPY, oneMinusPerfFee);
    if (netAPY.gt(vaultManagementFee)) {
        netAPY = new bignumber_float_1.Float().sub(netAPY, vaultManagementFee);
    }
    else {
        netAPY = new bignumber_float_1.Float(0);
    }
    // Determine vault APR type
    let vaultAPRType = 'v2:averaged';
    if (activation > estBlockLastWeek) {
        vaultAPRType = 'v2:new_averaged';
    }
    const netAPR = netAPY; // Default APR = APY
    const vaultAPY = {
        type: vaultAPRType,
        netAPR,
        grossAPR: monthlyAPY,
        fees: {
            performance: vaultPerformanceFee,
            management: vaultManagementFee,
        },
        points: {
            weekAgo: weeklyAPY,
            monthAgo: monthlyAPY,
            inception: inceptionAPY,
        },
        pricePerShare: {
            today: ppsToday,
            weekAgo: ppsWeekAgo,
            monthAgo: ppsMonthAgo,
        },
    };
    return vaultAPY;
}
