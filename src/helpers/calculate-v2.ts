import { createPublicClient, http } from 'viem';
import { getChainFromChainId, getRPCUrl } from '../utils/rpcs';
import { Float } from './bignumber-float';
import { BigNumberInt, toNormalizedAmount } from './bignumber-int';
import { GqlVault } from '../types/kongTypes';

interface TFees {
    performance: Float;
    management: Float;
}

interface THistoricalPoints {
    weekAgo: Float;
    monthAgo: Float;
    inception: Float;
}

interface TPricePerShare {
    today: Float;
    weekAgo: Float;
    monthAgo: Float;
}

export interface TVaultAPY {
    type: string;
    netAPR?: Float;
    grossAPR?: Float;
    fees: TFees;
    points: THistoricalPoints;
    pricePerShare: TPricePerShare;
}

// Helper function to get block number by period (days ago)
async function getBlockNumberByPeriod(chainId: number, daysAgo: number): Promise<bigint> {
    const client = createPublicClient({
        chain: getChainFromChainId(chainId),
        transport: http(getRPCUrl(chainId)),
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
async function fetchPricePerShare(
    chainId: number,
    vaultAddress: `0x${string}`,
    blockNumber: bigint,
    decimals: number
): Promise<Float> {
    const client = createPublicClient({
        chain: getChainFromChainId(chainId),
        transport: http(getRPCUrl(chainId)),
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
        }) as bigint;

        return toNormalizedAmount(new BigNumberInt(pricePerShare), decimals);
    } catch (error) {
        console.error(`Error fetching PPS at block ${blockNumber}:`, error);
        return new Float(1);
    }
}

// Calculate APY from two price points
function calculateAPY(ppsNow: Float, ppsThen: Float, days: number): Float {
    if (days <= 0) return new Float(0);

    // APY = ((ppsNow / ppsThen) ^ (365 / days)) - 1
    const ratio = new Float().div(ppsNow, ppsThen);
    const periodsPerYear = 365 / days;

    // For simplicity, approximate (ratio ^ periodsPerYear) - 1
    // Using: APY ≈ (ratio - 1) * periodsPerYear for small changes
    const growth = new Float().sub(ratio, new Float(1));
    return new Float().mul(growth, new Float(periodsPerYear));
}

function calculateWeeklyAPY(ppsToday: Float, ppsWeekAgo: Float): Float {
    return calculateAPY(ppsToday, ppsWeekAgo, 7);
}

function calculateMonthlyAPY(ppsToday: Float, ppsMonthAgo: Float): Float {
    return calculateAPY(ppsToday, ppsMonthAgo, 30);
}

export async function computeCurrentV2VaultAPY(
    vault: GqlVault,
    chainId: number,
): Promise<TVaultAPY> {
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
        ? toNormalizedAmount(new BigNumberInt(vault.pricePerShare), decimals)
        : await fetchPricePerShare(chainId, yieldVault, estBlockToday, decimals);

    let ppsWeekAgo = new Float(1);
    let ppsMonthAgo = new Float(1);
    let ppsInception = new Float(1);
    let weeklyAPY = new Float(0);
    let monthlyAPY = new Float(0);
    let inceptionAPY = new Float(0);

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
    } else if (isLessThanAMonthOld) {
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
    } else {
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
    const vaultPerformanceFee = toNormalizedAmount(new BigNumberInt(performanceFee), 4);
    const vaultManagementFee = toNormalizedAmount(new BigNumberInt(managementFee), 4);
    const oneMinusPerfFee = new Float().sub(new Float(1), vaultPerformanceFee);

    // Calculate net APY from gross APY
    let netAPY = new Float().mul(monthlyAPY, oneMinusPerfFee);
    if (netAPY.gt(vaultManagementFee)) {
        netAPY = new Float().sub(netAPY, vaultManagementFee);
    } else {
        netAPY = new Float(0);
    }

    // Determine vault APR type
    let vaultAPRType = 'v2:averaged';
    if (activation > estBlockLastWeek) {
        vaultAPRType = 'v2:new_averaged';
    }

    const netAPR = netAPY; // Default APR = APY

    const vaultAPY: TVaultAPY = {
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