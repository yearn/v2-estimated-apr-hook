"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFapy = computeFapy;
const schemas_1 = require("./types/schemas");
const _1 = require("./");
const COMPONENTS = [
    'netAPR',
    'netAPY',
    'boost',
    'poolAPY',
    'boostedAPR',
    'baseAPR',
    'rewardsAPR',
    'rewardsAPY',
    'cvxAPR',
    'keepCRV',
];
async function computeFapy(hook) {
    const res = await (0, _1.computeVaultFapy)(hook.chainId, hook.address);
    if (res) {
        const outputs = COMPONENTS.map((component) => schemas_1.OutputSchema.parse({
            chainId: hook.chainId,
            address: hook.address,
            label: 'crv-estimated-apr',
            component,
            value: res[component] ?? 0,
            blockNumber: hook.blockNumber,
            blockTime: hook.blockTime,
        }));
        return schemas_1.OutputSchema.array().parse(outputs);
    }
    return null;
}
