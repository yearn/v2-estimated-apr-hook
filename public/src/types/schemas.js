"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputSchema = exports.KongWebhookSchema = exports.WebhookSubscriptionSchema = exports.AddressSchema = void 0;
const zod_1 = require("zod");
exports.AddressSchema = zod_1.z.custom((val) => typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val), 'invalid evm address');
exports.WebhookSubscriptionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    url: zod_1.z.string().url(),
    abiPath: zod_1.z.string(),
    type: zod_1.z.enum(['timeseries']),
    label: zod_1.z.string(),
});
exports.KongWebhookSchema = zod_1.z.object({
    abiPath: zod_1.z.string(),
    chainId: zod_1.z.number(),
    address: exports.AddressSchema,
    blockNumber: zod_1.z.bigint({ coerce: true }),
    blockTime: zod_1.z.bigint({ coerce: true }),
    subscription: exports.WebhookSubscriptionSchema,
});
exports.OutputSchema = zod_1.z.object({
    chainId: zod_1.z.number(),
    address: exports.AddressSchema,
    label: zod_1.z.string(),
    component: zod_1.z.string().nullish(),
    value: zod_1.z
        .any()
        .transform((val) => {
        const result = zod_1.z.number().safeParse(val);
        if (result.success && isFinite(result.data))
            return result.data;
        return undefined;
    })
        .nullish(),
    blockNumber: zod_1.z.bigint({ coerce: true }),
    blockTime: zod_1.z.bigint({ coerce: true }),
});
