import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Build-time env inlining for secrets loaded by yearn-gha vercel-deploy
 * (see `.github/workflows/deploy.yml`). Keep this list in lockstep with the
 * workflow `secrets:` map — each KEY must appear in both places.
 *
 * Values present at `next build` are baked into the server bundle so the app
 * does not need Vercel project env vars at runtime. Only set keys are inlined
 * so local `|| default` fallbacks still work when a var is absent.
 */
const INLINED_FROM_1PASSWORD = {
  KONG_SECRET: process.env.KONG_SECRET,
  CRV_GAUGE_REGISTRY_URL: process.env.CRV_GAUGE_REGISTRY_URL,
  CRV_POOLS_URL: process.env.CRV_POOLS_URL,
  RPC_URI_FOR_1: process.env.RPC_URI_FOR_1,
  RPC_URI_FOR_10: process.env.RPC_URI_FOR_10,
  RPC_URI_FOR_42161: process.env.RPC_URI_FOR_42161,
  RPC_URI_FOR_8453: process.env.RPC_URI_FOR_8453,
} as const;

const env = Object.fromEntries(
  Object.entries(INLINED_FROM_1PASSWORD).flatMap(([key, value]) => (value ? [[key, value]] : [])),
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
