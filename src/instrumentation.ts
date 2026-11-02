import * as Sentry from '@sentry/nextjs';

export function register() {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

export const onRequestError = Sentry.captureRequestError;
