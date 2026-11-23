import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const REDACTED = '<redacted>';

// RPC and API providers put the access key in the URL path (e.g. gateway.tenderly.co/<key>),
// so Sentry's HTTP breadcrumbs and viem/undici error messages would store it verbatim.
// A path segment of 20+ url-safe characters is treated as a secret, except 0x hex values
// (addresses and hashes are public and useful when debugging).
const SECRET_SEGMENT = /^(?!0x[0-9a-fA-F]+$)[A-Za-z0-9_-]{20,}$/;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>)\]]+/g;

export function scrubUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname
    .split('/')
    .map((segment) => (SECRET_SEGMENT.test(segment) ? REDACTED : segment))
    .join('/');
  // URL percent-encodes the angle brackets; keep the marker readable.
  return url
    .toString()
    .replaceAll(encodeURIComponent('<'), '<')
    .replaceAll(encodeURIComponent('>'), '>');
}

export function scrubText(input: string): string {
  return input.replace(URL_IN_TEXT, (match) => scrubUrl(match));
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data: Record<string, unknown> = { ...breadcrumb.data };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && /^https?:\/\//.test(value)) data[key] = scrubUrl(value);
  }
  return { ...breadcrumb, data };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.request?.url) event.request.url = scrubUrl(event.request.url);
  return event;
}
