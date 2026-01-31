import { describe, beforeEach, it, vi, expect } from 'vitest'
import { Float } from './helpers/bignumber-float'
import { determineCurveKeepCRV, getPoolWeeklyAPY, getRewardsAPY } from './crv-like.forward'
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
    getCVXForCRV: vi.fn(),
    getPrismaAPY: vi.fn()
  }
})


describe('crv-like.forward core helpers', () => {
  // Hex helper
  const hex = (s: string) => s as `0x${string}`

  beforeEach(() => {
    vi.clearAllMocks()
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

})