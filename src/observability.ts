import 'dotenv/config';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';

const SERVICE_NAME = 'fapy-hook';

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;

let provider: LoggerProvider | undefined;

// Reporting is a no-op until an OTLP endpoint is configured via the standard
// OTEL_EXPORTER_OTLP_* env vars. Point it at any OTLP-compatible backend.
if (endpoint) {
  provider = new LoggerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || SERVICE_NAME,
    }),
    processors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
  });
  logs.setGlobalLoggerProvider(provider);
}

export function captureError(error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const attributes: Record<string, string> = {
    [ATTR_EXCEPTION_TYPE]: err.name,
    [ATTR_EXCEPTION_MESSAGE]: err.message,
  };
  if (err.stack) {
    attributes[ATTR_EXCEPTION_STACKTRACE] = err.stack;
  }

  logs.getLogger(SERVICE_NAME).emit({
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: err.message,
    attributes,
  });
}

// Serverless functions may freeze before batched logs export; flush after capture.
export async function flushObservability(): Promise<void> {
  await provider?.forceFlush();
}
