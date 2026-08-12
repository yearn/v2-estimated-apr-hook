import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/health route', () => {
  it('returns ok', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
