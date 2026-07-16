import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  return new NextResponse('ok', { status: 200 });
}
