// Money utilities. All amounts are integer cents; the demo currency is "Demo SGD".

import { CURRENCY } from "./config"
import type { Currency, MoneyAmount } from "./paymentTypes"

export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER

/** A valid cent amount is a finite, positive, safe integer. */
export function isValidCents(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n > 0 &&
    n <= MAX_SAFE_CENTS
  )
}

/**
 * Parse a user-entered amount (in whole currency units) into integer cents.
 * Returns null for malformed, nonpositive, or excessive-precision input.
 */
export function parseCents(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed === ".") return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [whole, frac = ""] = trimmed.split(".")
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2))
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) return null
  if (cents <= 0 || cents > MAX_SAFE_CENTS) return null
  return cents
}

/** Format integer cents as "Demo SGD 400" or "Demo SGD 280.50". */
export function formatMoney(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const dollars = Math.floor(abs / 100)
  const rem = abs % 100
  const text = rem === 0 ? `${dollars}` : `${dollars}.${String(rem).padStart(2, "0")}`
  return `${neg ? "-" : ""}${CURRENCY} ${text}`
}

/** Format an inclusive cent range as "Demo SGD 280–520". */
export function formatRange(minCents: number, maxCents: number): string {
  return `${CURRENCY} ${centsPlain(minCents)}–${centsPlain(maxCents)}`
}

function centsPlain(cents: number): string {
  const dollars = Math.floor(cents / 100)
  const rem = cents % 100
  return rem === 0 ? `${dollars}` : `${dollars}.${String(rem).padStart(2, "0")}`
}

/** Convert integer cents to a plain input string ("350" or "350.55"). */
export function centsToInput(cents: number): string {
  return centsPlain(cents)
}

// ---------------------------------------------------------------------------
// Currency-aware helpers (Demo SGD cents vs XRP drops) for the Testnet path.
// XRP is never formatted through the SGD `formatMoney`.
// ---------------------------------------------------------------------------

const XRP_DROPS = 1_000_000

/** Format a tagged money amount: "Demo SGD 400" or "4 XRP" / "3.5 XRP". */
export function formatAmount(m: MoneyAmount): string {
  if (m.currency === "Demo SGD") return formatMoney(m.minorUnits)
  return formatXrpDrops(m.minorUnits)
}

/** Format XRP drops as a trimmed decimal XRP string. */
export function formatXrpDrops(drops: number): string {
  const whole = Math.floor(drops / XRP_DROPS)
  const frac = drops % XRP_DROPS
  const fracStr = frac === 0 ? "" : "." + String(frac).padStart(6, "0").replace(/0+$/, "")
  return `${whole}${fracStr} XRP`
}

/** Parse a whole-unit input string into a tagged amount (SGD -> cents, XRP -> drops). */
export function parseAmount(input: string, currency: Currency): MoneyAmount | null {
  if (currency === "Demo SGD") {
    const cents = parseCents(input)
    return cents === null ? null : { currency, minorUnits: cents }
  }
  return parseXrp(input)
}

/** Parse an XRP input string (up to 6 decimal places) into drops. */
export function parseXrp(input: string): MoneyAmount | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed === ".") return null
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null
  const [whole, frac = ""] = trimmed.split(".")
  const drops = Number(whole) * XRP_DROPS + Number((frac + "000000").slice(0, 6))
  if (!Number.isFinite(drops) || !Number.isInteger(drops)) return null
  if (drops <= 0 || drops > MAX_SAFE_CENTS) return null
  return { currency: "XRP", minorUnits: drops }
}
