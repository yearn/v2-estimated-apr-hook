"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
require("dotenv/config");
const zod_1 = require("zod");
const node_crypto_1 = require("node:crypto");
const schemas_1 = require("../src/types/schemas");
const output_1 = require("../src/output");
function verifyWebhookSignature(signatureHeader, secret, body, toleranceSeconds = 300) {
    try {
        const elements = signatureHeader.split(',');
        const timestampElement = elements.find(el => el.startsWith('t='));
        const signatureElement = elements.find(el => el.startsWith('v1='));
        if (!timestampElement || !signatureElement) {
            return false;
        }
        const timestamp = parseInt(timestampElement.split('=')[1]);
        const receivedSignature = signatureElement.split('=')[1];
        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
            return false;
        }
        const expectedSignature = (0, node_crypto_1.createHmac)('sha256', secret)
            .update(`${timestamp}.${body}`, 'utf8')
            .digest('hex');
        return (0, node_crypto_1.timingSafeEqual)(new Uint8Array(Buffer.from(receivedSignature, 'hex')), new Uint8Array(Buffer.from(expectedSignature, 'hex')));
    }
    catch (error) {
        console.error(error);
        return false;
    }
}
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const signature = req.headers['kong-signature'];
    if (!signature) {
        return res.status(403).json({ error: 'unauthorized' });
    }
    if (!verifyWebhookSignature(signature, process.env.KONG_SECRET || 'NO SECRET', JSON.stringify(req.body))) {
        return res.status(403).json({ error: 'unauthorized' });
    }
    try {
        const hook = schemas_1.KongWebhookSchema.parse(req.body);
        const outputs = await (0, output_1.computeFapy)(hook);
        const replacer = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
        res.status(200).send(JSON.stringify(schemas_1.OutputSchema.array().parse(outputs), replacer));
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'invalid payload', issues: err.issues });
        }
        console.error('fapy webhook error', err);
        return res.status(500).json({ error: 'internal error' });
    }
}
