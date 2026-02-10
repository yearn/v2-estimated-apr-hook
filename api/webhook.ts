import 'dotenv/config';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { KongBatchWebhookSchema, OutputSchema } from '../src/types/schemas';
import { computeFapy } from '../src/output';

function verifyWebhookSignature(
  signatureHeader: string,
  secret: string,
  body: string,
  toleranceSeconds = 300
): boolean {
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

    const expectedSignature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('hex');

    return timingSafeEqual(
      new Uint8Array(Buffer.from(receivedSignature, 'hex')),
      new Uint8Array(Buffer.from(expectedSignature, 'hex'))
    );
  } catch (error) {
    console.error(error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['kong-signature'];

  if (!signature) {
    return res.status(403).json({ error: 'unauthorized' });
  }

  if (!verifyWebhookSignature(signature as string, process.env.KONG_SECRET || 'NO SECRET', JSON.stringify(req.body))) {
    return res.status(403).json({ error: 'unauthorized' });
  }

  try {
    const hook = KongBatchWebhookSchema.parse(req.body);
    const outputs = await computeFapy(hook);
    const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
    res.status(200).send(JSON.stringify(OutputSchema.array().parse(outputs), replacer));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid payload', issues: err.issues });
    }
    console.error('fapy webhook error', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
