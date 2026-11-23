import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from './sentry-scrub';

const KEY = 'AbCdEfGhIjKlMnOpQrStUv'; // fake 22-char provider key

describe('scrubUrl', () => {
  it('redacts the key in an RPC gateway path', () => {
    expect(scrubUrl(`https://mainnet.gateway.tenderly.co/${KEY}`)).toBe(
      'https://mainnet.gateway.tenderly.co/<redacted>',
    );
  });

  it('drops query string, fragment and credentials', () => {
    expect(scrubUrl(`https://user:pw@api.example.com/v1/data?apikey=${KEY}#frag`)).toBe(
      'https://api.example.com/v1/data',
    );
  });

  it('keeps ordinary paths and 0x hex values', () => {
    expect(scrubUrl('https://api.curve.finance/api/getSubgraphData/ethereum')).toBe(
      'https://api.curve.finance/api/getSubgraphData/ethereum',
    );
    const addr = '0x' + 'a'.repeat(40);
    expect(scrubUrl(`https://example.test/tokens/${addr}`)).toBe(
      `https://example.test/tokens/${addr}`,
    );
  });

  it('leaves non-URLs untouched', () => {
    expect(scrubUrl('not a url')).toBe('not a url');
  });
});

describe('scrubText', () => {
  it('redacts keys inside error messages such as viem HTTP errors', () => {
    const text = `HTTP request failed.\n\nURL: https://base.gateway.tenderly.co/${KEY}\nRequest body: {}`;
    const out = scrubText(text);
    expect(out).not.toContain(KEY);
    expect(out).toContain('https://base.gateway.tenderly.co/<redacted>');
    expect(out).toContain('Request body: {}');
  });
});

describe('scrubBreadcrumb', () => {
  it('redacts every url-like string in http breadcrumb data and keeps the rest', () => {
    const out = scrubBreadcrumb({
      category: 'http',
      data: {
        url: `https://mainnet.gateway.tenderly.co/${KEY}`,
        status_code: 200,
        'http.request.method': 'POST',
      },
    });
    expect(out.data).toEqual({
      url: 'https://mainnet.gateway.tenderly.co/<redacted>',
      status_code: 200,
      'http.request.method': 'POST',
    });
  });

  it('passes breadcrumbs without data through', () => {
    const crumb = { category: 'console', message: 'hello' };
    expect(scrubBreadcrumb(crumb)).toBe(crumb);
  });
});

describe('scrubEvent', () => {
  it('redacts exception messages and the request url', () => {
    const out = scrubEvent({
      type: undefined,
      request: { url: `https://app.example.com/webhook?token=${KEY}` },
      exception: {
        values: [{ type: 'Error', value: `failed https://x.gateway.tenderly.co/${KEY}` }],
      },
    });
    expect(JSON.stringify(out)).not.toContain(KEY);
    expect(out.request?.url).toBe('https://app.example.com/webhook');
  });
});
