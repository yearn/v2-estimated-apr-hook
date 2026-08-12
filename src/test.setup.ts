import { config } from 'dotenv';

config();

// Live fapy tests hit RPC endpoints whose cert chains Node rejects by default.
const allow = process.env.ALLOW_INSECURE_TLS;
if (allow === '1' || allow?.toLowerCase() === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
