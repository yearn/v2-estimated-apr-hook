import { describe, beforeEach, it, vi, expect } from 'vitest'
import { determineVeloKeepVELO, isVeloVault, isAeroVault, isVeloLikeVault, calculateVeloLikeStrategyAPY } from './velo-like.forward'
import * as forwardAPY from './velo-like.forward'

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
vi.mock('./utils/prices', () => ({
  fetchErc20PriceUsd: vi.fn().mockResolvedValue({ priceUsd: 1 })
}))

describe('velo-like.forward core helpers', () => {
  const hex = (s: string) => s as `0x${string}`
  const ZERO_ADDRESS = hex('0x0000000000000000000000000000000000000000')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isVeloVault', () => {
    it('returns false for non-Optimism chains', async () => {
      const result = await isVeloVault(1, hex('0xAsset'))
      expect(result).toEqual([null, false])
      expect(mockReadContract).not.toHaveBeenCalled()
    })

    it('returns gauge address when gauge exists on Optimism', async () => {
      const gaugeAddress = hex('0xGauge123')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const result = await isVeloVault(10, hex('0xAsset'))
      expect(result).toEqual([gaugeAddress, true])
    })

    it('returns false when gauge is zero address', async () => {
      mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS)

      const result = await isVeloVault(10, hex('0xAsset'))
      expect(result).toEqual([null, false])
    })
  })

  describe('isAeroVault', () => {
    it('returns false for non-Base chains', async () => {
      const result = await isAeroVault(1, hex('0xAsset'))
      expect(result).toEqual([null, false])
      expect(mockReadContract).not.toHaveBeenCalled()
    })

    it('returns gauge address when gauge exists on Base', async () => {
      const gaugeAddress = hex('0xAeroGauge456')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const result = await isAeroVault(8453, hex('0xAsset'))
      expect(result).toEqual([gaugeAddress, true])
    })

    it('returns false when gauge is zero address', async () => {
      mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS)

      const result = await isAeroVault(8453, hex('0xAsset'))
      expect(result).toEqual([null, false])
    })
  })

  describe('isVeloLikeVault', () => {
    it('delegates to isVeloVault for chainId 10', async () => {
      const gaugeAddress = hex('0xVeloGauge')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const result = await isVeloLikeVault(10, hex('0xAsset'))
      expect(result).toEqual([gaugeAddress, true])
    })

    it('delegates to isAeroVault for chainId 8453', async () => {
      const gaugeAddress = hex('0xAeroGauge')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const result = await isVeloLikeVault(8453, hex('0xAsset'))
      expect(result).toEqual([gaugeAddress, true])
    })

    it('returns false for unsupported chains', async () => {
      const result = await isVeloLikeVault(1, hex('0xAsset'))
      expect(result).toEqual([null, false])
    })
  })

  describe('determineVeloKeepVELO', () => {
    it('prefers strategy.localKeepVELO when present', async () => {
      const strat: any = { localKeepVELO: BigInt(500), address: hex('0xS1') }
      const result = await determineVeloKeepVELO(strat, 10)
      expect(result).toBeCloseTo(0.05, 5)
      expect(mockReadContract).not.toHaveBeenCalled()
    })

    it('falls back to on-chain call when localKeepVELO not present', async () => {
      const strat: any = { address: hex('0xS2') }
      mockReadContract.mockResolvedValueOnce(BigInt(1000))

      const result = await determineVeloKeepVELO(strat, 10)
      expect(result).toBeCloseTo(0.1, 5)
      expect(mockReadContract).toHaveBeenCalled()
    })

    it('returns 0 when on-chain call fails', async () => {
      const strat: any = { address: hex('0xS3') }
      mockReadContract.mockRejectedValueOnce(new Error('RPC error'))

      const result = await determineVeloKeepVELO(strat, 10)
      expect(result).toBe(0)
    })

    it('returns 0 when localKeepVELO is 0', async () => {
      const strat: any = { localKeepVELO: BigInt(0), address: hex('0xS4') }
      mockReadContract.mockResolvedValueOnce(BigInt(0))

      const result = await determineVeloKeepVELO(strat, 10)
      expect(result).toBe(0)
    })
  })

  describe('calculateVeloLikeStrategyAPY', () => {
    it('returns unpopular type when periodFinish is in the past', async () => {
      const vault: any = { performanceFee: 0, managementFee: 0, asset: { address: hex('0xAsset') } }
      const strategy: any = { address: hex('0xS'), debtRatio: 10000 }
      const gaugeAddress = hex('0xGauge')

      const pastTime = Math.floor(Date.now() / 1000) - 1000
      mockMulticall.mockResolvedValueOnce([
        { result: BigInt(pastTime) },
        { result: BigInt(1e18) },
        { result: BigInt(1000e18) },
        { result: hex('0xVELO') },
      ])

      const result = await calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, 10)
      expect(result.type).toBe('v2:velo_unpopular')
      expect(result.netAPY).toBe(0)
    })

    it('returns unpopular type when totalSupply is 0', async () => {
      const vault: any = { performanceFee: 0, managementFee: 0, asset: { address: hex('0xAsset') } }
      const strategy: any = { address: hex('0xS'), debtRatio: 10000 }
      const gaugeAddress = hex('0xGauge')

      const futureTime = Math.floor(Date.now() / 1000) + 100000
      mockMulticall.mockResolvedValueOnce([
        { result: BigInt(futureTime) },
        { result: BigInt(1e18) },
        { result: BigInt(0) },
        { result: hex('0xVELO') },
      ])

      const result = await calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, 10)
      expect(result.type).toBe('v2:velo_unpopular')
      expect(result.netAPY).toBe(0)
    })

    it('calculates positive APY with valid gauge data', async () => {
      const vault: any = {
        performanceFee: 0,
        managementFee: 0,
        asset: { address: hex('0xAsset') },
      }
      const strategy: any = { address: hex('0xS'), debtRatio: 10000 }
      const gaugeAddress = hex('0xGauge')

      const futureTime = Math.floor(Date.now() / 1000) + 100000
      mockMulticall.mockResolvedValueOnce([
        { result: BigInt(futureTime) },
        { result: BigInt(1e18) },
        { result: BigInt(1000e18) },
        { result: hex('0xVELO') },
      ])

      vi.spyOn(forwardAPY, 'determineVeloKeepVELO').mockResolvedValueOnce(0)

      const result = await calculateVeloLikeStrategyAPY(vault, strategy, gaugeAddress, 10)
      expect(result.type).toBe('v2:velo')
      expect(result.netAPY).toBeGreaterThan(0)
      expect(result).toHaveProperty('keepVelo')
    })
  })

  describe('computeVeloLikeForwardAPY', () => {
    it('returns empty result when no asset address', async () => {
      const vault: any = { asset: null }
      const strategies: any[] = []

      const result = await forwardAPY.computeVeloLikeForwardAPY({
        vault,
        allStrategiesForVault: strategies,
        chainId: 10,
      })

      expect(result.type).toBe('')
      expect(result.netAPY).toBe(0)
    })

    it('returns empty result when not a velo-like vault', async () => {
      const vault: any = { asset: { address: hex('0xAsset') } }
      const strategies: any[] = []

      mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS)

      const result = await forwardAPY.computeVeloLikeForwardAPY({
        vault,
        allStrategiesForVault: strategies,
        chainId: 10,
      })

      expect(result.type).toBe('')
      expect(result.netAPY).toBe(0)
    })

    it('aggregates APY from multiple strategies', async () => {
      const vault: any = {
        performanceFee: 0,
        managementFee: 0,
        asset: { address: hex('0xAsset') },
      }
      const strategies: any[] = [
        { address: hex('0xS1'), debtRatio: 5000 },
        { address: hex('0xS2'), debtRatio: 5000 },
      ]

      const gaugeAddress = hex('0xGauge')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const futureTime = Math.floor(Date.now() / 1000) + 100000
      mockMulticall
        .mockResolvedValueOnce([
          { result: BigInt(futureTime) },
          { result: BigInt(1e18) },
          { result: BigInt(1000e18) },
          { result: hex('0xVELO') },
        ])
        .mockResolvedValueOnce([
          { result: BigInt(futureTime) },
          { result: BigInt(1e18) },
          { result: BigInt(1000e18) },
          { result: hex('0xVELO') },
        ])

      vi.spyOn(forwardAPY, 'determineVeloKeepVELO').mockResolvedValue(0)

      const result = await forwardAPY.computeVeloLikeForwardAPY({
        vault,
        allStrategiesForVault: strategies,
        chainId: 10,
      })

      expect(result.type).toContain('v2:velo')
      expect(result).toHaveProperty('netAPY')
      expect(result).toHaveProperty('keepVelo')
    })

    it('skips strategies with zero debtRatio', async () => {
      const vault: any = {
        performanceFee: 0,
        managementFee: 0,
        asset: { address: hex('0xAsset') },
      }
      const strategies: any[] = [
        { address: hex('0xS1'), debtRatio: 0 },
        { address: hex('0xS2'), debtRatio: 10000 },
      ]

      const gaugeAddress = hex('0xGauge')
      mockReadContract.mockResolvedValueOnce(gaugeAddress)

      const futureTime = Math.floor(Date.now() / 1000) + 100000
      mockMulticall.mockResolvedValueOnce([
        { result: BigInt(futureTime) },
        { result: BigInt(1e18) },
        { result: BigInt(1000e18) },
        { result: hex('0xVELO') },
      ])

      vi.spyOn(forwardAPY, 'determineVeloKeepVELO').mockResolvedValue(0)

      const result = await forwardAPY.computeVeloLikeForwardAPY({
        vault,
        allStrategiesForVault: strategies,
        chainId: 10,
      })

      expect(mockMulticall).toHaveBeenCalledTimes(1)
    })
  })
})
