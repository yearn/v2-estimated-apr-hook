"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bignumber_float_1 = require("./helpers/bignumber-float");
const crv_like_forward_1 = require("./crv-like.forward");
const forwardAPY = __importStar(require("./crv-like.forward"));
const helpers = __importStar(require("./helpers"));
const mockReadContract = vitest_1.vi.fn();
const mockMulticall = vitest_1.vi.fn();
vitest_1.vi.mock('viem', async (orig) => {
    const actual = await orig();
    return {
        ...actual,
        createPublicClient: vitest_1.vi.fn(() => ({
            readContract: mockReadContract,
            multicall: mockMulticall,
        })),
    };
});
vitest_1.vi.mock('http');
vitest_1.vi.mock('../src/utils/prices', () => ({
    fetchErc20PriceUsd: vitest_1.vi.fn().mockResolvedValue({ priceUsd: 1 })
}));
vitest_1.vi.mock('../src/helpers', async (orig) => {
    const mod = await orig();
    return {
        ...mod,
        getCurveBoost: vitest_1.vi.fn(),
        determineConvexKeepCRV: vitest_1.vi.fn(),
        getConvexRewardAPY: vitest_1.vi.fn(),
        getCVXForCRV: vitest_1.vi.fn(),
        getPrismaAPY: vitest_1.vi.fn()
    };
});
(0, vitest_1.describe)('crv-like.forward core helpers', () => {
    // Hex helper
    const hex = (s) => s;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('determineCurveKeepCRV prefers strategy.localKeepCRV when present', async () => {
        const strat = { localKeepCRV: BigInt(500), address: hex('0xS1') };
        const result = await (0, crv_like_forward_1.determineCurveKeepCRV)(strat, 1);
        const asNum = result.toFloat64 ? result.toFloat64()[0] : Number(result);
        (0, vitest_1.expect)(asNum).toBeCloseTo(0.05, 1e-9);
        // Should not call readContract
        (0, vitest_1.expect)(mockReadContract).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('determineCurveKeepCRV falls back to on-chain calls in order', async () => {
        const strat = { address: hex('0xS2'), apiVersion: '0.4.0' };
        mockReadContract
            // keepCRV present -> resolve with 1000 (10%)
            .mockResolvedValueOnce(BigInt(1000))
            // keepCRVPercentage should not be called, but return if it is
            .mockResolvedValueOnce(BigInt(0));
        const result = await (0, crv_like_forward_1.determineCurveKeepCRV)(strat, 1);
        const asNum = result.toFloat64 ? result.toFloat64()[0] : Number(result);
        (0, vitest_1.expect)(asNum).toBeCloseTo(0.1, 1e-9);
        // Ensure keepCRV path used
        (0, vitest_1.expect)(mockReadContract).toHaveBeenCalled();
    });
    (0, vitest_1.it)('getPoolWeeklyAPY returns 0 when subgraph undefined', () => {
        const res = (0, crv_like_forward_1.getPoolWeeklyAPY)(undefined);
        const [num] = res.toFloat64();
        (0, vitest_1.expect)(num).toBe(0);
    });
    (0, vitest_1.it)('getRewardsAPY accumulates rewards', () => {
        const pool = { gaugeRewards: [{ APY: 1.5 }, { APY: 3.5 }] };
        const res = (0, crv_like_forward_1.getRewardsAPY)(pool);
        const [num] = res.toFloat64();
        (0, vitest_1.expect)(num).toBeCloseTo(0.05, 1e-9); // 1.5% + 3.5% = 5% -> 0.05
    });
    (0, vitest_1.it)('calculateCurveForwardAPY composes pieces', async () => {
        // Minimal inputs
        const data = {
            gaugeAddress: hex('0xG'),
            vault: { performanceFee: 0, managementFee: 0, apiVersion: '0.4.0' },
            strategy: { address: hex('0xS'), performanceFee: 0, managementFee: 0, debtRatio: 10000, apiVersion: '0.4.0' },
            baseAPY: new bignumber_float_1.Float(0.05),
            rewardAPY: new bignumber_float_1.Float(0.02),
            poolAPY: new bignumber_float_1.Float(0.01),
            chainId: 1,
            lastDebtRatio: new bignumber_float_1.Float(10000)
        };
        // Mock imports
        vitest_1.vi.spyOn(helpers, 'getCurveBoost').mockResolvedValueOnce(new bignumber_float_1.Float(2.5));
        vitest_1.vi.spyOn(forwardAPY, 'determineCurveKeepCRV').mockResolvedValueOnce(0);
        mockMulticall.mockResolvedValueOnce([{ result: BigInt(2e6) }]);
        const res = await forwardAPY.calculateCurveForwardAPY(data);
        (0, vitest_1.expect)(res).toHaveProperty('type', 'crv');
        (0, vitest_1.expect)(res).toHaveProperty('netAPY');
        (0, vitest_1.expect)(res).toHaveProperty('boost');
        (0, vitest_1.expect)(res.netAPY).toBeGreaterThan(0); // performance/mgmt fees are 0 so should be positive
    });
});
