import type { NextConfig } from 'next';

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
  async rewrites() {
    return [
      { source: '/webhook', destination: '/api/webhook' },
      { source: '/healthcheck', destination: '/api/health' },
    ];
  },
};

export default nextConfig;
