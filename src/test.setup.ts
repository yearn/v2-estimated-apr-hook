import { config } from 'dotenv'

// Load environment variables from .env file
config()

const allow = process.env.ALLOW_INSECURE_TLS
if (allow && (allow === '1' || allow.toLowerCase() === 'true')) {
  // Test-only: some RPC endpoints used in live fapy tests present cert chains
  // Node rejects by default. Prefer this over depending on undici's Agent API.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}
