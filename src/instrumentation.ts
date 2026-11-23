import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

export function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
