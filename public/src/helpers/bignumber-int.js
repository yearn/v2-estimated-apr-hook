"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigNumberInt = void 0;
exports.toNormalizedAmount = toNormalizedAmount;
const bignumber_1 = require("@ethersproject/bignumber");
const bignumber_float_1 = require("./bignumber-float");
class BigNumberInt {
    constructor(value) {
        if (value === undefined) {
            this.value = 0n;
        }
        else if (typeof value === 'bigint') {
            this.value = value;
        }
        else if (typeof value === 'number') {
            this.value = BigInt(value);
        }
        else if (typeof value === 'string') {
            this.value = value === '' ? 0n : BigInt(value);
        }
        else {
            this.value = 0n;
        }
    }
    static from(value) {
        return new BigNumberInt(value);
    }
    clone(source) {
        if (!source)
            return this;
        this.value = source.value;
        return this;
    }
    set(val) {
        if (typeof val === 'bigint')
            this.value = val;
        else if (typeof val === 'number')
            this.value = BigInt(val);
        else if (typeof val === 'string')
            this.value = val === '' ? 0n : BigInt(val);
        return this;
    }
    setString(s) {
        this.value = s === '' || s === '""' ? 0n : BigInt(s);
        return this;
    }
    setUint64(s) {
        this.value = typeof s === 'bigint' ? s : BigInt(s);
        return this;
    }
    add(x, y) {
        if (y) {
            this.value = x.value + y.value;
        }
        else {
            this.value = this.value + x.value;
        }
        return this;
    }
    sub(x, y) {
        if (y) {
            this.value = x.value - y.value;
        }
        else {
            this.value = this.value - x.value;
        }
        return this;
    }
    mul(x, y) {
        if (y) {
            this.value = x.value * y.value;
        }
        else {
            this.value = this.value * x.value;
        }
        return this;
    }
    div(x, y) {
        if (y) {
            if (y.value === 0n) {
                this.value = 0n;
            }
            else {
                this.value = x.value / y.value;
            }
        }
        else {
            if (x.value === 0n) {
                this.value = 0n;
            }
            else {
                this.value = this.value / x.value;
            }
        }
        return this;
    }
    exp(x, y, z) {
        // Modular exponentiation: x^y mod |z|
        const base = x.value;
        const exponent = y.value;
        const modulus = z ? (z.value < 0n ? -z.value : z.value) : 0n;
        // Special case: if modulus is 0 or undefined, return 1 for non-positive exponent
        if (modulus === 0n) {
            this.value = exponent <= 0n ? 1n : base ** exponent;
            return this;
        }
        let result = 1n;
        let b = base % modulus;
        let e = exponent;
        while (e > 0) {
            if (e % 2n === 1n)
                result = (result * b) % modulus;
            e = e / 2n;
            b = (b * b) % modulus;
        }
        this.value = result;
        return this;
    }
    toUint64() {
        return Number(this.value);
    }
    toString() {
        return this.value.toString();
    }
    isZero() {
        return this.value === 0n;
    }
    gt(x) {
        return this.value > x.value;
    }
    gte(x) {
        return this.value >= x.value;
    }
    lt(x) {
        return this.value < x.value;
    }
    lte(x) {
        return this.value <= x.value;
    }
    eq(x) {
        return this.value === x.value;
    }
    not(x) {
        return this.value !== x.value;
    }
    // JSON serialization as string (for compatibility with JS/JSON)
    toJSON() {
        return this.toString();
    }
    // For CSV serialization
    toCSV() {
        return this.toString();
    }
    // Nil-safe static method
    static safe(s, defaultValue) {
        if (!s)
            return defaultValue || new BigNumberInt(0n);
        return s;
    }
}
exports.BigNumberInt = BigNumberInt;
function toNormalizedAmount(amount, decimals) {
    const exponential = bignumber_1.BigNumber.from(10).pow(decimals);
    return new bignumber_float_1.Float(0).quo(new bignumber_float_1.Float().setInt(amount), new bignumber_float_1.Float().setInt(new BigNumberInt(exponential.toString())));
}
