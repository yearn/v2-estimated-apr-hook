export function convertFloatAPRToAPY(apr: number, periodsPerYear: number): number {
  // APR is expected as a decimal (e.g. 0.56 for 56%).
  // APY = (1 + r/n)^n - 1, where r is the APR in decimal form.
  return Math.pow(1 + (apr / periodsPerYear), periodsPerYear) - 1
}

export function toNormalizedAmount(amount: bigint, decimals: number): number {
  // Convert amount to a number and divide by 10^decimals
  return Number(amount) / Math.pow(10, decimals)
}
