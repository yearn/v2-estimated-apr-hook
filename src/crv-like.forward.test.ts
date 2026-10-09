import { describe, beforeEach, it, vi, expect } from 'vitest'
import { Float } from './helpers/bignumber-float'
import { calculateGaugeBaseAPR, computeCurveLikeForwardAPY, determineCurveKeepCRV, getCVXPoolAPY, getPoolWeeklyAPY, getRewardsAPY } from './crv-like.forward'
import * as forwardAPY from './crv-like.forward'
import * as helpers from './helpers'
import { convertFloatAPRToAPY } from './helpers/calculation.helper'

const mockReadContract = vi.fn()
const mockMulticall = vi.fn()

vi.mock('viem', async (orig) => {
  const actual = await (orig as any)()
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      multicall: mockMulticall,
    })),
  }
})

vi.mock('http')
vi.mock('../src/utils/prices', () => ({
  fetchErc20PriceUsd: vi.fn().mockResolvedValue({ priceUsd: 1 })
}))

vi.mock('../src/helpers', async (orig) => {
  const mod = await orig() as any
  return {
    ...mod,
    getCurveBoost: vi.fn(),
    determineConvexKeepCRV: vi.fn(),
    getConvexRewardAPY: vi.fn(),
    getCVXForCRV: vi.fn()
  }
})


describe('crv-like.forward core helpers', () => {
  // Hex helper
  const hex = (s: string) => s as `0x${string}`

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    process.env.RPC_URI_FOR_1 = 'http://localhost:8545'
  })

  it('determineCurveKeepCRV prefers strategy.localKeepCRV when present', async () => {
    const strat: any = { localKeepCRV: BigInt(500), address: hex('0xS1') }
    const result = await determineCurveKeepCRV(strat, 1)
    const asNum = (result as any).toFloat64 ? (result as any).toFloat64()[0] : Number(result)
    expect(asNum).toBeCloseTo(0.05, 1e-9)

    // Should not call readContract
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('determineCurveKeepCRV falls back to on-chain calls in order', async () => {
    const strat: any = { address: hex('0xS2'), apiVersion: '0.4.0' }

    mockReadContract
      // keepCRV present -> resolve with 1000 (10%)
      .mockResolvedValueOnce(BigInt(1000))
      // keepCRVPercentage should not be called, but return if it is
      .mockResolvedValueOnce(BigInt(0))

    const result = await determineCurveKeepCRV(strat, 1)
    const asNum = (result as any).toFloat64 ? (result as any).toFloat64()[0] : Number(result)
    expect(asNum).toBeCloseTo(0.1, 1e-9)

    // Ensure keepCRV path used
    expect(mockReadContract).toHaveBeenCalled()
  })

  it('getPoolWeeklyAPY returns 0 when subgraph undefined', () => {
    const res = getPoolWeeklyAPY(undefined as any)
    const [num] = (res as any).toFloat64()
    expect(num).toBe(0)
  })

  it('getRewardsAPY accumulates rewards', () => {
    const pool: any = { gaugeRewards: [{ APY: 1.5 }, { APY: 3.5 }] }
    const res = getRewardsAPY(pool)
    const [num] = (res as any).toFloat64()
    expect(num).toBeCloseTo(0.05, 1e-9) // 1.5% + 3.5% = 5% -> 0.05
  })

  it('getCVXPoolAPY ignores expired Convex rewards periods', async () => {
    const nowSeconds = 1_780_000_000
    vi.useFakeTimers()
    vi.setSystemTime(nowSeconds * 1000)

    mockReadContract
      .mockResolvedValueOnce(BigInt(387))
      .mockResolvedValueOnce(['0xLP', '0xGauge', '0xToken', '0xRewards'])
      .mockResolvedValueOnce(BigInt('582199014705081'))
      .mockResolvedValueOnce(BigInt('219760210359908782'))
      .mockResolvedValueOnce(BigInt(nowSeconds - 1))

    vi.spyOn(helpers, 'getCVXForCRV' as any).mockResolvedValueOnce(new Float(1))

    const result = await getCVXPoolAPY(1, hex('0xStrategy'), new Float(1))

    expect(result.crvAPR.isZero()).toBe(true)
    expect(result.cvxAPR.isZero()).toBe(true)
    expect(result.crvAPY.isZero()).toBe(true)
    expect(result.cvxAPY.isZero()).toBe(true)
    expect(helpers.getCVXForCRV).not.toHaveBeenCalled()
  })

  it('calculateCurveForwardAPY composes pieces', async () => {
    // Minimal inputs
    const data = {
      gaugeAddress: hex('0xG'),
      vault: { performanceFee: 0, managementFee: 0, apiVersion: '0.4.0' } as any,
      strategy: { address: hex('0xS'), performanceFee: 0, managementFee: 0, debtRatio: 10000, apiVersion: '0.4.0' } as any,
      baseAPY: new Float(0.05),
      rewardAPY: new Float(0.02),
      poolAPY: new Float(0.01),
      chainId: 1,
      lastDebtRatio: new Float(10000)
    }

    // Mock imports
    vi.spyOn(helpers, 'getCurveBoost' as any).mockResolvedValueOnce(new Float(2.5))
    vi.spyOn(forwardAPY, 'determineCurveKeepCRV').mockResolvedValueOnce(0)
    mockMulticall.mockResolvedValueOnce([{ result: BigInt(2e6) }])

    const { weighted: res, raw } = await forwardAPY.calculateCurveForwardAPY(data as any)

    expect(res).toHaveProperty('type', 'crv')
    expect(res).toHaveProperty('netAPY')
    expect(res).toHaveProperty('boost')
    expect(res.netAPY).toBeGreaterThan(0) // performance/mgmt fees are 0 so should be positive

    // With new logic:
    // grossAPY = baseAPY * boost * (1 - keepCRV) + rewardAPY = 0.05 * 2.5 * 1 + 0.02 = 0.145
    // netAPR = 0.145 (no fees)
    // netAPY = convertFloatAPRToAPY(0.145, 52) + poolAPY ≈ 0.1556 + 0.01 ≈ 0.1656
    expect(res.netAPY).toBeGreaterThan(0.16)
    expect(res.netAPY).toBeLessThan(0.17)

    expect(raw.address).toBe(data.strategy.address)
    expect(raw.debtRatio).toBe(data.lastDebtRatio.toNumber() / 10000)
    expect(raw.netAPY).toBeGreaterThan(0)
  })

  it('convertFloatAPRToAPY accepts decimal inputs and returns decimal output', () => {
    // Test with 56% APR (0.56 as decimal)
    const result = convertFloatAPRToAPY(0.56, 52)

    // APY = (1 + 0.56/52)^52 - 1 ≈ 0.7405
    expect(result).toBeGreaterThan(0.74)
    expect(result).toBeLessThan(0.75)

    // Test with 10% APR (0.10 as decimal)
    const result2 = convertFloatAPRToAPY(0.10, 52)
    // APY = (1 + 0.10/52)^52 - 1 ≈ 0.1047
    expect(result2).toBeGreaterThan(0.104)
    expect(result2).toBeLessThan(0.106)
  })

  it('computeCurveLikeForwardAPY returns null for killed gauge', async () => {
    const killedGauge: any = {
      gauge: '0xGauge',
      swap: '0xSwap',
      swap_token: '0xAsset',
      is_killed: true,
      hasNoCrv: false,
    }
    const vault: any = { asset: { address: '0xAsset' } }

    const result = await computeCurveLikeForwardAPY({
      vault,
      gauges: [killedGauge],
      pools: [],
      subgraphData: [],
      fraxPools: [],
      allStrategiesForVault: [],
      chainId: 1,
    })

    expect(result).toBeNull()
  })

  it('computeCurveLikeForwardAPY returns null for gauge with hasNoCrv', async () => {
    const noCrvGauge: any = {
      gauge: '0xGauge',
      swap: '0xSwap',
      swap_token: '0xAsset',
      is_killed: false,
      hasNoCrv: true,
    }
    const vault: any = { asset: { address: '0xAsset' } }

    const result = await computeCurveLikeForwardAPY({
      vault,
      gauges: [noCrvGauge],
      pools: [],
      subgraphData: [],
      fraxPools: [],
      allStrategiesForVault: [],
      chainId: 1,
    })

    expect(result).toBeNull()
  })

  it('calculateGaugeBaseAPR returns zero when working supply is zero', async () => {
    const gauge: any = {
      gauge_controller: {
        inflation_rate: '1000000000000000000',
        gauge_relative_weight: '1000000000000000000',
      },
      gauge_data: {
        working_supply: '0',
      },
    }

    const result = await calculateGaugeBaseAPR(
      gauge,
      new Float(1),
      new Float(1),
      new Float(1),
    )

    expect(result.baseAPR.isZero()).toBe(true)
    expect(result.baseAPY.isZero()).toBe(true)
  })

  it('poolAPY is added AFTER fee deduction in Curve forward APY', async () => {
    const data = {
      gaugeAddress: hex('0xG'),
      vault: { performanceFee: 2000, managementFee: 200, apiVersion: '0.4.0' } as any, // 20% perf fee, 2% mgmt fee
      strategy: { address: hex('0xS'), performanceFee: 2000, managementFee: 200, debtRatio: 10000, apiVersion: '0.4.0' } as any,
      baseAPY: new Float(0.05),
      rewardAPY: new Float(0.02),
      poolAPY: new Float(0.03), // 3% pool APY
      chainId: 1,
      lastDebtRatio: new Float(10000)
    }

    vi.spyOn(helpers, 'getCurveBoost' as any).mockResolvedValueOnce(new Float(2.5))
    vi.spyOn(forwardAPY, 'determineCurveKeepCRV').mockResolvedValueOnce(0)
    mockMulticall.mockResolvedValueOnce([{ result: BigInt(2e6) }])

    const { weighted: res, raw } = await forwardAPY.calculateCurveForwardAPY(data as any)

    // grossAPY = 0.05 * 2.5 * 1 + 0.02 = 0.145
    // netAPR = 0.145 * 0.8 - 0.02 = 0.116 - 0.02 = 0.096
    // netAPY = convertFloatAPRToAPY(0.096, 52) + poolAPY ≈ 0.1006 + 0.03 ≈ 0.1306

    // The poolAPY should be visible in the final result
    expect(res.poolAPY).toBeCloseTo(0.03, 2)
    expect(res.netAPY).toBeGreaterThan(0.12)
    expect(res.netAPY).toBeLessThan(0.14)

    expect(raw.address).toBe(data.strategy.address)
    expect(raw.debtRatio).toBe(data.lastDebtRatio.toNumber() / 10000)
    expect(raw.netAPY).toBeGreaterThan(0)
    expect(raw.poolAPY).toBeCloseTo(0.03, 2)
    expect(raw.netAPY).toBeCloseTo(res.netAPY, 10)
  })

  describe('vault allocation weighting', () => {
    const unit = 10n ** 18n
    const gauge: any = {
      gauge: '0xGauge', swap: '0xPool', swap_token: '0xAsset', lpTokenPrice: 1,
      swap_data: { virtual_price: unit.toString() },
      gauge_controller: { inflation_rate: '0', gauge_relative_weight: unit.toString() },
      gauge_data: { working_supply: unit.toString() },
    }

    async function estimate(curveDebtRatio: number, convexDebtRatio: number, weeklyAPY?: number) {
      vi.mocked(helpers.getCurveBoost).mockReset().mockResolvedValue(new Float(1))
      vi.mocked(helpers.determineConvexKeepCRV).mockReset().mockResolvedValue(new Float(0))
      vi.mocked(helpers.getConvexRewardAPY).mockReset().mockResolvedValue({ totalRewardsAPY: new Float(0.08) } as any)
      mockReadContract.mockReset().mockImplementation(async ({ functionName }) => {
        if (functionName === 'poolInfo') return ['0xLP', '0xGauge', '0xToken', '0xRewards']
        if (functionName === 'totalSupply') return unit
        if (functionName === 'periodFinish') return BigInt(Math.floor(Date.now() / 1000) + 86400)
        return 0n
      })
      vi.mocked(helpers.getCVXForCRV).mockReset().mockResolvedValue(new Float(0))

      return computeCurveLikeForwardAPY({
        vault: {
          chainId: 1, address: hex('0xVault'), asset: { address: '0xAsset' } as any,
          performanceFee: 1000, managementFee: 200,
        },
        gauges: [gauge],
        pools: [{ lpTokenAddress: '0xAsset', gaugeRewards: [{ APY: 4 }] } as any],
        subgraphData: weeklyAPY == null ? [] : [{ address: '0xPool', latestWeeklyApy: weeklyAPY } as any],
        fraxPools: [],
        allStrategiesForVault: [
          { chainId: 1, address: hex('0xCurve'), name: 'StrategyCurve', debtRatio: curveDebtRatio },
          { chainId: 1, address: hex('0xConvex'), name: 'StrategyConvex', debtRatio: convexDebtRatio },
        ],
        chainId: 1,
      })
    }

    it.each([
      [0, 0], // Fully deallocated.
      [2500, 2500], // Partly allocated across Curve and Convex.
      [6000, 4000], // Fully allocated across Curve and Convex.
      [10000, 0], // Fully allocated to Curve.
      [0, 10000], // Fully allocated to Convex.
      [6000, 6000], // Inconsistent ratios must not produce a negative idle contribution.
    ])('adds only the unallocated pool yield: Curve %s bps, Convex %s bps', async (curveDebtRatio, convexDebtRatio) => {
      const result = await estimate(curveDebtRatio, convexDebtRatio, 1.3)
      const curveWeight = curveDebtRatio / 10000
      const convexWeight = convexDebtRatio / 10000
      const poolYield = 0.013 * Math.max(1, curveWeight + convexWeight)
      const curveFarmAPY = (1 + (0.04 * 0.9 - 0.02) / 52) ** 52 - 1
      const convexFarmAPY = (1 + (0.08 * 0.9 - 0.02) / 52) ** 52 - 1

      expect(result?.netAPY).toBeCloseTo(poolYield + curveWeight * curveFarmAPY + convexWeight * convexFarmAPY, 12)
      expect(result?.netAPR).toBe(result?.netAPY)
      expect(result?.poolAPY).toBeCloseTo(poolYield, 12)
      expect(result?.rewardsAPY).toBeCloseTo(curveWeight * 0.04 + convexWeight * 0.08, 12)
      expect(result?.boost).toBeCloseTo(curveWeight + convexWeight, 12)
      expect(result?.baseAPR).toBe(0)
      expect(result?.cvxAPR).toBe(0)
      expect(result?.strategies).toHaveLength(Number(curveDebtRatio > 0) + Number(convexDebtRatio > 0))
      if (curveDebtRatio + convexDebtRatio === 0) expect(mockReadContract).not.toHaveBeenCalled()
    })

    it.each([undefined, 0, -1])('preserves missing, zero, or negative pool yield: %s', async (weeklyAPY) => {
      const result = await estimate(0, 0, weeklyAPY)
      expect(result?.netAPY).toBe((weeklyAPY ?? 0) / 100)
      expect(result?.poolAPY).toBe(result?.netAPY)
      expect(result?.rewardsAPY).toBe(0)
    })
  })

})
