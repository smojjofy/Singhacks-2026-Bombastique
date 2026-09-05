// Tagged money types so XRP can never be mistaken for Demo SGD. The simulator
// uses "Demo SGD" (minor unit = cent); the Testnet path uses "XRP" (minor unit
// = drop). Calculations stay in integer minor units.

export type Currency = "Demo SGD" | "XRP"

export interface MoneyAmount {
  currency: Currency
  /** Integer minor units: cents for "Demo SGD", drops for "XRP". */
  minorUnits: number
}

export const MINOR_UNITS_PER_UNIT: Record<Currency, number> = {
  "Demo SGD": 100,
  XRP: 1_000_000,
}

/** Positive/zero, finite, safe integer minor units. */
export function isValidMinorUnits(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 0 &&
    n <= Number.MAX_SAFE_INTEGER
  )
}

export function isCurrency(c: unknown): c is Currency {
  return c === "Demo SGD" || c === "XRP"
}
