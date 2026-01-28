import { setGlobalDispatcher, Agent } from 'undici'
import { config } from 'dotenv'

// Load environment variables from .env file
config()

const allow = process.env.ALLOW_INSECURE_TLS
if (allow && (allow === '1' || allow.toLowerCase() === 'true')) {
    setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }))
}