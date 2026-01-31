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

describe('Calculate FAPY', () => {
    describe.concurrent("crv like vaults", () => {
        [
            '0x8A5f20dA6B393fE25aCF1522C828166D22eF8321',
            '0xf165a634296800812B8B0607a75DeDdcD4D3cC88',
            '0x6E9455D109202b426169F0d8f01A3332DAE160f3',
            '0x790a60024bC3aea28385b60480f15a0771f26D09',
        ].forEach(vaultAddress => {
            it(`should calculate fapy for ${vaultAddress}`, async () => {
                const chainId = 1
                const [res, ydaemonFAPY] = await Promise.all([
                    computeVaultFapy(chainId, vaultAddress as `0x${string}`),
                    getYDaemonFAPY(chainId, vaultAddress as `0x${string}`)
                ]);

                expect(res).toBeDefined()
                expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY || 0, 0.01)
                expect(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01)
                expect(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01)
                expect(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01)
                expect(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01)
                expect(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01)
                expect(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01)

                // Verify strategies output
                expect(res?.strategies).toBeDefined()
                expect(res?.strategies?.length).toBeGreaterThan(0)
                res?.strategies?.forEach(strategy => {
                    expect(strategy.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
                    expect(['crv', 'cvx', 'frax']).toContain(strategy.type)
                    expect(strategy.netAPY).toBeGreaterThan(0)
                    expect(strategy.debtRatio).toBeDefined()
                })

            }, 10000)
        })

        it('should calculate fapy for vault 0x27B5739e22ad9033bcBf192059122d163b60349D', async () => {
            const chainId = 1
            const vaultAddress = '0x27B5739e22ad9033bcBf192059122d163b60349D'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);

            expect(res).toBeDefined()
            expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01)
            expect(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01)
        }, 10000)

        it('should calculate fapy for vault 0x57a2c7925bAA1894a939f9f6721Ea33F2EcFD0e2', async () => {
            const chainId = 1
            const vaultAddress = '0x57a2c7925bAA1894a939f9f6721Ea33F2EcFD0e2'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);

            expect(res).toBeDefined()
            expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01)
            expect(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01)
        }, 10000)

        it('should calculate fapy for vault 0xBfBC4acAE2ceC91A5bC80eCA1C9290F92959f7c3', async () => {
            const chainId = 1
            const vaultAddress = '0xBfBC4acAE2ceC91A5bC80eCA1C9290F92959f7c3'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);

            expect(res).toBeDefined()
            expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01)
            expect(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01)
        }, 10000)

        it('should calculate fapy for vault 0xb7b1C394b3F82091988A1e400C6499178eE64b99', async () => {
            const chainId = 1
            const vaultAddress = '0xb7b1C394b3F82091988A1e400C6499178eE64b99'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);

            expect(res).toBeDefined()
            expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01)
            expect(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01)
            expect(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01)
            expect(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01)
        }, 10000)
    })

    describe.concurrent("velo like vaults", () => {
        it('should calculate fapy for Velodrome vault 0xDdDCAeE873f2D9Df0E18a80709ef2B396d4a6EA5', async () => {
            const chainId = 10
            const vaultAddress = '0xDdDCAeE873f2D9Df0E18a80709ef2B396d4a6EA5'
            const [res, ydaemonFAPY] = await Promise.all([
                computeVaultFapy(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);

            expect(res).toBeDefined()
            expect(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01)
        }, 15000)
    })
})