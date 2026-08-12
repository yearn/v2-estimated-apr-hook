import { describe, expect, it } from 'vitest';
import { getOtlpLogsEndpoint } from './observability';

describe('getOtlpLogsEndpoint', () => {
  it('uses a signal-specific endpoint unchanged, as required by Sentry', () => {
    const endpoint = 'https://o123.ingest.sentry.io/api/0/otlp/v1/logs';

    expect(
      getOtlpLogsEndpoint({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example',
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: endpoint,
      }),
    ).toBe(endpoint);
  });

  it('adds the logs path to a generic OTLP/HTTP endpoint', () => {
    expect(getOtlpLogsEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example/' })).toBe(
      'https://collector.example/v1/logs',
    );
  });

  it('disables exporting when no OTLP endpoint is configured', () => {
    expect(getOtlpLogsEndpoint({})).toBeUndefined();
  });
});
