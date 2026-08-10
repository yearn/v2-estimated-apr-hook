"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '../.env' });
const _1 = require("./");
async function main() {
    const result = await (0, _1.computeVaultFapy)(1, "0x790a60024bC3aea28385b60480f15a0771f26D09");
    console.log("result", result);
}
main();
