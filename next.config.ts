import path from 'node:path';
import type { NextConfig } from 'next';

// Runtime config sourced from 1Password via yearn-gha vercel-deploy and
// injected at `vercel build` time (see .github/workflows/deploy.yml). Listed
// vars are inlined into the build output so nothing has to live in Vercel's
// env store. All are referenced server-side only, so they never reach the
// client bundle.
const INLINED_ENV = [
  'KONG_SECRET',
  'CRV_GAUGE_REGISTRY_URL',
  'CRV_POOLS_URL',
  'RPC_URI_FOR_1',
  'RPC_URI_FOR_10',
  'RPC_URI_FOR_42161',
  'RPC_URI_FOR_8453',
] as const;

// Only inline vars that are actually set, so code-level `|| default` fallbacks
// still apply when a var is absent (e.g. local dev).
const env = Object.fromEntries(
  INLINED_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : [])),
);

const nextConfig: NextConfig = {
  env,
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
