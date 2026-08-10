"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const undici_1 = require("undici");
const allow = process.env.ALLOW_INSECURE_TLS;
if (allow && (allow === '1' || allow.toLowerCase() === 'true')) {
    (0, undici_1.setGlobalDispatcher)(new undici_1.Agent({ connect: { rejectUnauthorized: false } }));
}
