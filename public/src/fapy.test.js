"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const _1 = require(".");
function getYDaemonURL(chainId, vaultAddress) {
    return `https://ydaemon.yearn.fi/${chainId}/vaults/${vaultAddress}`;
}
async function getYDaemonFAPY(chainId, vaultAddress) {
    const url = getYDaemonURL(chainId, vaultAddress);
    const res = await fetch(url);
    const data = await res.json();
    return data.apr.forwardAPR;
}
(0, vitest_1.describe)('Calculate FAPY', () => {
    vitest_1.describe.concurrent("crv like vaults", () => {
        (0, vitest_1.it)('should calculate fapy for yvCurve-reusdscrv-f', async () => {
            const chainId = 1;
            const vaultAddress = '0xf165a634296800812B8B0607a75DeDdcD4D3cC88';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 10000);
        (0, vitest_1.it)('should calculate fapy for yvCurve-YFIETH', async () => {
            const chainId = 1;
            const vaultAddress = '0x790a60024bC3aea28385b60480f15a0771f26D09';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 15000);
        (0, vitest_1.it)('should calculate fapy for vault 0x27B5739e22ad9033bcBf192059122d163b60349D', async () => {
            const chainId = 1;
            const vaultAddress = '0x27B5739e22ad9033bcBf192059122d163b60349D';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            console.log(res);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 10000);
        (0, vitest_1.it)('should calculate fapy for vault 0x57a2c7925bAA1894a939f9f6721Ea33F2EcFD0e2', async () => {
            const chainId = 1;
            const vaultAddress = '0x57a2c7925bAA1894a939f9f6721Ea33F2EcFD0e2';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 10000);
        (0, vitest_1.it)('should calculate fapy for vault 0xBfBC4acAE2ceC91A5bC80eCA1C9290F92959f7c3', async () => {
            const chainId = 1;
            const vaultAddress = '0xBfBC4acAE2ceC91A5bC80eCA1C9290F92959f7c3';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 10000);
        (0, vitest_1.it)('should calculate fapy for vault 0xb7b1C394b3F82091988A1e400C6499178eE64b99', async () => {
            const chainId = 1;
            const vaultAddress = '0xb7b1C394b3F82091988A1e400C6499178eE64b99';
            const [res, ydaemonFAPY] = await Promise.all([
                (0, _1.computeVaultFapy)(chainId, vaultAddress),
                getYDaemonFAPY(chainId, vaultAddress)
            ]);
            (0, vitest_1.expect)(res).toBeDefined();
            (0, vitest_1.expect)(ydaemonFAPY.netAPR).toBeCloseTo(res?.netAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boost).toBeCloseTo(res?.boost ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.poolAPY).toBeCloseTo(res?.poolAPY ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.boostedAPR).toBeCloseTo(res?.boostedAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.baseAPR).toBeCloseTo(res?.baseAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.cvxAPR).toBeCloseTo(res?.cvxAPR ?? 0, 0.01);
            (0, vitest_1.expect)(ydaemonFAPY.composite.rewardsAPR).toBeCloseTo(res?.rewardsAPY ?? 0, 0.01);
        }, 10000);
    });
});
