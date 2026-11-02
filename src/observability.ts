import * as Sentry from '@sentry/nextjs';

export function captureError(error: unknown): void {
  Sentry.captureException(error);
}

export async function flushObservability(): Promise<void> {
  await Sentry.flush(2000);
}
