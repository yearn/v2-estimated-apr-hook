import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Avoid picking a parent-directory lockfile as the monorepo root locally.
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      { source: '/webhook', destination: '/api/webhook' },
      { source: '/healthcheck', destination: '/api/health' },
    ];
  },
};

export default nextConfig;
