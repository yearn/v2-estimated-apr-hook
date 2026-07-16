import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeFapy } from '@/output';
import { KongBatchWebhookSchema, OutputSchema } from '@/types/schemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyWebhookSignature(
  signatureHeader: string,
  secret: string,
  body: string,
  toleranceSeconds = 300,
): boolean {
  try {
    const elements = signatureHeader.split(',');
    const timestampElement = elements.find((el) => el.startsWith('t='));
    const signatureElement = elements.find((el) => el.startsWith('v1='));

    if (!timestampElement || !signatureElement) {
      return false;
    }

    const timestamp = parseInt(timestampElement.split('=')[1], 10);
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
      new Uint8Array(Buffer.from(expectedSignature, 'hex')),
    );
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const kongSecret = process.env.KONG_SECRET;
  if (!kongSecret) {
    console.error('KONG_SECRET is not configured');
    return NextResponse.json({ error: 'service unavailable' }, { status: 503 });
  }

  const signature = req.headers.get('kong-signature');
  if (!signature) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const rawBody = await req.text();

  if (!verifyWebhookSignature(signature, kongSecret, rawBody)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  try {
    const body = JSON.parse(rawBody) as unknown;
    const hook = KongBatchWebhookSchema.parse(body);
    const outputs = await computeFapy(hook);

    const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

    if (outputs.length === 0) {
      // 204 must not carry a body (NextResponse.json would throw).
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(JSON.stringify(OutputSchema.array().parse(outputs), replacer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fapy webhook error', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid payload', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
