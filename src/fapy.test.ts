import { describe, expect, it } from 'vitest'
import { computeVaultFapy } from '.'
import { YearnVaultData } from './types/ydaemon'

function getYDaemonURL(chainId: number, vaultAddress: `0x${string}`) {
    return `https://ydaemon.yearn.fi/${chainId}/vaults/${vaultAddress}`
}

async function getYDaemonFAPY(chainId: number, vaultAddress: `0x${string}`) {
    const url = getYDaemonURL(chainId, vaultAddress)
    const res = await fetch(url)
    const data = await res.json() as YearnVaultData
    return data.apr.forwardAPR as YearnVaultData["apr"]["forwardAPR"]
}

// Helper to check if two numbers are within a threshold
function expectCloseTo(actual: number, expected: number, threshold: number = 0.001) {
    const diff = Math.abs(actual - expected)
    expect(diff, `Expected ${actual} to be within ${threshold} of ${expected}, but diff was ${diff}`).toBeLessThanOrEqual(threshold)
}

describe('Calculate FAPY', () => {
    describe.concurrent("crv like vaults", () => {
        const vaults = [
            '0x8A5f20dA6B393fE25aCF1522C828166D22eF8321', // Curve DOLA-wstUSR Factory
            '0xf165a634296800812B8B0607a75DeDdcD4D3cC88', // Curve reUSD-scrvUSD Factory
            '0x6E9455D109202b426169F0d8f01A3332DAE160f3', // LP Yearn CRV Vault v2
            '0x790a60024bC3aea28385b60480f15a0771f26D09', // Curve YFI-ETH Pool yVault
            '0x1Fc80CfCF5B345b904A0fB36d4222196Ed9eB8a5', // Curve DOLA-sUSDe Factory yVault
            '0x342D24F2a3233F7Ac8A7347fA239187BFd186066', // Curve DOLA-sUSDS Factory yVault
            '0x04c8bfe2eb09a1e2e9fA97A2fd970E06d87B43de', // Curve GEAR-ETH Factory yVault
            '0x57a2c7925bAA1894a939f9f6721Ea33F2EcFD0e2', // Curve DOLA-USR Factory
            '0xBfBC4acAE2ceC91A5bC80eCA1C9290F92959f7c3', // Curve eUSDUSDC Factory yVault
            '0xb7b1C394b3F82091988A1e400C6499178eE64b99', // Curve alUSD-sDOLA Factory
            '0xe0287cA62fE23f4FFAB827d5448d68aFe6DD9Fd7', // Curve msUSD-frxUSD Factory
            '0xb37094c1B5614Bd6EcE40AFb295C26F4377069d3', // Curve FRAX Factory yVault
            // '0xd6627F7dE81eB517A32F0F81537Ea2636B27B8CC' // wbeth - needs investigation (1.24% diff)
        ] as const

        it.each(vaults)('should calculate fapy for %s', async (vaultAddress) => {
            const chainId = 1
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ])

            expect(res).toBeDefined()

            // Use 0.005 (50 basis points) tolerance for live API comparisons
            // Curve subgraph data (poolAPY) has timing variance between data sources
            expectCloseTo(res?.netAPY ?? 0, ydaemonFAPY.netAPR ?? 0, 0.005)
            expectCloseTo(res?.boost ?? 0, ydaemonFAPY.composite.boost ?? 0, 0.005)
            expectCloseTo(res?.poolAPY ?? 0, ydaemonFAPY.composite.poolAPY ?? 0, 0.005)
            expectCloseTo(res?.boostedAPR ?? 0, ydaemonFAPY.composite.boostedAPR ?? 0, 0.005)
            expectCloseTo(res?.baseAPR ?? 0, ydaemonFAPY.composite.baseAPR ?? 0, 0.005)
            expectCloseTo(res?.cvxAPR ?? 0, ydaemonFAPY.composite.cvxAPR ?? 0, 0.005)
            expectCloseTo(res?.rewardsAPY ?? 0, ydaemonFAPY.composite.rewardsAPR ?? 0, 0.005)

            expect(res?.strategies).toBeDefined()
            expect(res?.strategies?.length).toBeGreaterThan(0)
            res?.strategies?.forEach(strategy => {
                expect(strategy.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
                expect(['crv', 'cvx', 'frax']).toContain(strategy.type)
                expect(strategy.netAPY).toBeGreaterThan(0)
                expect(strategy.debtRatio).toBeDefined()
            })
        }, 15000)

        it('should calculate fapy for 0x27B5739e22ad9033bcBf192059122d163b60349D - Yearn yCRV Vault', async () => {
            const chainId = 1
            const vaultAddress = '0x27B5739e22ad9033bcBf192059122d163b60349D'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ])
            expect(res).toBeDefined();
            expect(res?.netAPY ?? 0).toEqual(ydaemonFAPY.netAPR ?? 0);
        })
    })


    describe.concurrent("velo like vaults", () => {
        const vaults = [
            '0xDdDCAeE873f2D9Df0E18a80709ef2B396d4a6EA5',
            '0x00Cb8E36A9C40491A39e8bF2864Ed30C1B579860'
        ] as const

        it.each(vaults)('should calculate fapy for %s', async (vaultAddress) => {
            const chainId = 10
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ])

            expect(res).toBeDefined()

            // Use 0.003 (30 basis points) tolerance for live API comparisons
            // Data sources may have timing/caching differences
            expectCloseTo(res?.netAPY ?? 0, ydaemonFAPY.netAPR ?? 0, 0.003)
            expectCloseTo(res?.boost ?? 0, ydaemonFAPY.composite.boost ?? 0, 0.003)
            expectCloseTo(res?.poolAPY ?? 0, ydaemonFAPY.composite.poolAPY ?? 0, 0.003)
            expectCloseTo(res?.boostedAPR ?? 0, ydaemonFAPY.composite.boostedAPR ?? 0, 0.003)
            expectCloseTo(res?.baseAPR ?? 0, ydaemonFAPY.composite.baseAPR ?? 0, 0.003)
            expectCloseTo(res?.rewardsAPY ?? 0, ydaemonFAPY.composite.rewardsAPR ?? 0, 0.003)

            // Velo specific: keepVelo instead of keepCRV
            expect(res?.keepVelo).toBeDefined()

            expect(res?.strategies).toBeDefined()
            expect(res?.strategies?.length).toBeGreaterThan(0)
            res?.strategies?.forEach(strategy => {
                expect(strategy.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
                expect(strategy.type).toMatch(/^v2:velo/)
                expect(strategy.netAPY).toBeGreaterThanOrEqual(0)
                expect(strategy.debtRatio).toBeDefined()
            })
        }, 15000)
    })


    describe.concurrent("aero like vaults", () => {
        const vaults = [
            '0x4d3ceBA4349ADB06d2De8EBD2F9320A61303aD81',
            '0x31Ce9aB5A358E5c802Cc01080F29a65a14EB45b8',
            '0x68393A804c9fe4f1c7148d37796436e450Ad98E8',
            '0x68A0ba9EcaD98BFd16D2457E2546226e8FB7C101'
        ] as const

        it.each(vaults)('should calculate fapy for %s', async (vaultAddress) => {
            const chainId = 8453
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ])

            expect(res).toBeDefined()

            // Use 0.003 (30 basis points) tolerance for live API comparisons
            // Data sources may have timing/caching differences
            expectCloseTo(res?.netAPY ?? 0, ydaemonFAPY.netAPR ?? 0, 0.003)
            expectCloseTo(res?.boost ?? 0, ydaemonFAPY.composite.boost ?? 0, 0.003)
            expectCloseTo(res?.poolAPY ?? 0, ydaemonFAPY.composite.poolAPY ?? 0, 0.003)
            expectCloseTo(res?.boostedAPR ?? 0, ydaemonFAPY.composite.boostedAPR ?? 0, 0.003)
            expectCloseTo(res?.baseAPR ?? 0, ydaemonFAPY.composite.baseAPR ?? 0, 0.003)
            expectCloseTo(res?.rewardsAPY ?? 0, ydaemonFAPY.composite.rewardsAPR ?? 0, 0.003)

            // Aero/Velo specific: keepVelo instead of keepCRV
            expect(res?.keepVelo).toBeDefined()

            expect(res?.strategies).toBeDefined()
            expect(res?.strategies?.length).toBeGreaterThan(0)
            res?.strategies?.forEach(strategy => {
                expect(strategy.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
                expect(strategy.type).toMatch(/^v2:velo/)
                expect(strategy.netAPY).toBeGreaterThanOrEqual(0)
                expect(strategy.debtRatio).toBeDefined()
            })
        }, 15000)
    })
})
