"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineConvexKeepCRV = exports.getCurveBoost = void 0;
const convex_base_strategy_abi_1 = require("../abis/convex-base-strategy.abi");
const crv_gauge_abi_1 = require("../abis/crv-gauge.abi");
const strategy_base_abi_1 = require("../abis/strategy-base.abi");
const rpcs_1 = require("../utils/rpcs");
const bignumber_int_1 = require("./bignumber-int");
const bignumber_1 = require("@ethersproject/bignumber");
const bignumber_float_1 = require("./bignumber-float");
const viem_1 = require("viem");
const getCurveBoost = async (chainID, voter, gauge) => {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainID),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainID}`]),
    });
    const [{ result: workingBalance }, { result: balanceOf }] = await client.multicall({
        contracts: [
            {
                address: gauge,
                abi: crv_gauge_abi_1.curveGaugeAbi,
                functionName: 'working_balances',
                args: [voter],
            },
            {
                address: gauge,
                abi: crv_gauge_abi_1.curveGaugeAbi,
                functionName: 'balanceOf',
                args: [voter],
            },
        ],
    });
    if (!balanceOf || bignumber_1.BigNumber.from(balanceOf ?? '0').lte(bignumber_1.BigNumber.from(0))) {
        if (chainID === 1) {
            return new bignumber_float_1.Float(2.5);
        }
        return new bignumber_float_1.Float(1);
    }
    const boost = new bignumber_float_1.Float().div((0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(workingBalance ?? 0n), 18), new bignumber_float_1.Float().mul(new bignumber_float_1.Float(0.4), (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(balanceOf ?? 0n), 18)));
    return boost;
};
exports.getCurveBoost = getCurveBoost;
const determineConvexKeepCRV = async (chainID, strategy) => {
    const client = (0, viem_1.createPublicClient)({
        chain: (0, rpcs_1.getChainFromChainId)(chainID),
        transport: (0, viem_1.http)(process.env[`RPC_CHAIN_URL_${chainID}`]),
    });
    try {
        const uselLocalCRV = await client.readContract({
            address: strategy.address,
            abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
            functionName: 'uselLocalCRV',
        });
        if (uselLocalCRV) {
            // Try to read both keepCVX and localKeepCRV in parallel
            const [cvxKeepCRVResult, localKeepCRVResult] = await Promise.allSettled([
                client.readContract({
                    address: strategy.address,
                    abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
                    functionName: 'keepCVX',
                }),
                client.readContract({
                    address: strategy.address,
                    abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
                    functionName: 'localKeepCRV',
                })
            ]);
            if (cvxKeepCRVResult.status === 'fulfilled') {
                return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(BigInt(cvxKeepCRVResult.value)), 4);
            }
            else if (localKeepCRVResult.status === 'fulfilled') {
                return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(BigInt(localKeepCRVResult.value)), 4);
            }
            else {
                return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(BigInt(0)), 4);
            }
        }
        const curveGlobal = await client.readContract({
            address: strategy.address,
            abi: convex_base_strategy_abi_1.convexBaseStrategyAbi,
            functionName: 'curveGlobal',
        });
        if (!curveGlobal) {
            return new bignumber_float_1.Float(0);
        }
        try {
            const keepCRV = await client.readContract({
                address: curveGlobal,
                abi: strategy_base_abi_1.strategyBaseAbi,
                functionName: 'keepCRV',
            });
            return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(keepCRV), 4);
        }
        catch (err) {
            return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(0n), 4);
        }
    }
    catch (err) {
        return (0, bignumber_int_1.toNormalizedAmount)(new bignumber_int_1.BigNumberInt().set(0n), 4);
    }
};
exports.determineConvexKeepCRV = determineConvexKeepCRV;
