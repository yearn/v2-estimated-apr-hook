"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaAPY = getPrismaAPY;
const bignumber_1 = require("@ethersproject/bignumber");
const viem_1 = require("viem");
const prices_1 = require("../utils/prices");
const yprisma_receiver_abi_1 = require("../abis/yprisma-receiver.abi");
const rpcs_1 = require("../utils/rpcs");
async function getPrismaAPY(chainID, prismaReceiver) {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainID),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainID}`])
    });
    try {
        // Parallelize contract reads
        const [rewardRate, totalSupply, lpToken] = await Promise.all([
            client.readContract({
                address: prismaReceiver,
                abi: yprisma_receiver_abi_1.yprismaReceiverAbi,
                functionName: 'rewardRate',
                args: [viem_1.zeroAddress, bignumber_1.BigNumber.from(0)]
            }),
            client.readContract({
                address: prismaReceiver,
                abi: yprisma_receiver_abi_1.yprismaReceiverAbi,
                functionName: 'totalSupply',
            }),
            client.readContract({
                address: prismaReceiver,
                abi: yprisma_receiver_abi_1.yprismaReceiverAbi,
                functionName: 'lpToken',
            })
        ]);
        const rate = Number(rewardRate.toString()) / 1e18;
        const supply = Number(totalSupply.toString()) / 1e18;
        const prismaTokenAddress = '0xdA47862a83dac0c112BA89c6abC2159b95afd71C';
        // Parallelize token price fetches
        const [tokenPricePrisma, tokenPriceLpToken] = await Promise.all([
            getTokenPrice(chainID, prismaTokenAddress),
            getTokenPrice(chainID, lpToken)
        ]);
        let prismaPrice = 0;
        if (tokenPricePrisma) {
            prismaPrice = Math.floor(parseFloat(tokenPricePrisma.toString()) * 1e18);
        }
        let lpTokenPrice = 0;
        if (tokenPriceLpToken) {
            lpTokenPrice = Math.floor(parseFloat(tokenPriceLpToken.toString()) * 1e18);
        }
        const secondsPerYear = 31536000;
        const prismaAPR = (rate * prismaPrice * secondsPerYear) / (supply * lpTokenPrice);
        const compoundingPeriodsPerYear = 365;
        const scale = 1e18;
        const scaledAPR = prismaAPR / compoundingPeriodsPerYear;
        const prismaAPY = ((scale + scaledAPR) ** compoundingPeriodsPerYear) / scale - scale;
        return [prismaAPR, prismaAPY];
    }
    catch (error) {
        console.error('Error in getPrismaAPY:', error);
        return [0, 0];
    }
}
async function getTokenPrice(chainID, tokenAddress) {
    const { priceUsd } = await (0, prices_1.fetchErc20PriceUsd)(chainID, tokenAddress);
    return priceUsd;
}
