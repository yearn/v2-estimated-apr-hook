import { config } from 'dotenv';
import { afterEach, beforeEach, expect, vi } from 'vitest';

config();

const unexpectedFetch = vi.fn(() => {
  throw new Error('Unit tests must mock network requests.');
});

beforeEach(() => {
  unexpectedFetch.mockClear();
  vi.stubGlobal('fetch', unexpectedFetch);
});

afterEach(() => {
  try {
    expect(unexpectedFetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
