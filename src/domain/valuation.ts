// Valuation: derive the condition-adjusted Market Moving Average and the
// accepted price interval from the seeded sale history.

import {
  CONDITION_FACTORS,
  MARKET_SOURCE,
  MMA_SAMPLE_COUNT,
  MMA_SOURCE,
  MMA_TICK_MAX_PCT,
  MMA_TICK_MIN_PCT,
  PRICE_MAX_PCT,
  PRICE_MIN_PCT,
} from "./config"
import { formatMoney, formatRange } from "./money"
import type { Condition, SaleSample, ValuationSnapshot } from "./types"

/** Arithmetic mean of the most recent `MMA_SAMPLE_COUNT` sales for a product, rounded to cents. */
export function baseMmaCents(productId: string, sales: SaleSample[]): number {
  const samples = sales
    .filter((s) => s.productId === productId)
    .slice()
    .sort((a, b) => b.soldAt - a.soldAt)
    .slice(0, MMA_SAMPLE_COUNT)
  if (samples.length === 0) return 0
  const sum = samples.reduce((acc, s) => acc + s.amountCents, 0)
  return Math.round(sum / samples.length)
}

export function conditionFactor(condition: Condition): number {
  return CONDITION_FACTORS[condition]
}

/**
 * The inclusive allowed interval is [ceil(mma*70%), floor(mma*130%)] in cents.
 * Displaying the minimum with ceiling and the maximum with floor guarantees the
 * shown limits agree with integer validation.
 */
export function allowedRange(mmaCents: number): { minCents: number; maxCents: number } {
  const minCents = Math.ceil((mmaCents * PRICE_MIN_PCT) / 100)
  const maxCents = Math.floor((mmaCents * PRICE_MAX_PCT) / 100)
  return { minCents, maxCents }
}

export function computeSnapshot(
  productId: string,
  condition: Condition,
  sales: SaleSample[],
): ValuationSnapshot {
  const base = baseMmaCents(productId, sales)
  const factor = conditionFactor(condition)
  const adjusted = Math.round(base * factor)
  const { minCents, maxCents } = allowedRange(adjusted)
  const newest = sales
    .filter((s) => s.productId === productId)
    .slice()
    .sort((a, b) => b.soldAt - a.soldAt)[0]
  return {
    productId,
    condition,
    baseMmaCents: base,
    adjustedMmaCents: adjusted,
    minCents,
    maxCents,
    conditionFactor: factor,
    source: MMA_SOURCE,
    referenceDate: newest ? new Date(newest.soldAt).toISOString() : new Date(0).toISOString(),
  }
}

/** Integer comparison matching the interval: price >= min && price <= max. */
export function isWithinInterval(priceCents: number, snapshot: ValuationSnapshot): boolean {
  return priceCents >= snapshot.minCents && priceCents <= snapshot.maxCents
}

// ---------------------------------------------------------------------------
// Live market price (stock-like MMA). `marketPrices[productId]` is the base
// ("Good") price in cents; every other condition is a fixed factor of it.
// ---------------------------------------------------------------------------

export function baseFromMarket(
  productId: string,
  marketPrices: Record<string, number>,
  sales: SaleSample[],
): number {
  const stored = marketPrices[productId]
  return typeof stored === "number" && Number.isInteger(stored) && stored > 0 ? stored : baseMmaCents(productId, sales)
}

/** Snapshot from the live market price (falls back to seeded sales if missing). */
export function snapshotFromMarket(
  productId: string,
  condition: Condition,
  marketPrices: Record<string, number>,
  sales: SaleSample[],
): ValuationSnapshot {
  const base = baseFromMarket(productId, marketPrices, sales)
  const factor = conditionFactor(condition)
  const adjusted = Math.round(base * factor)
  const { minCents, maxCents } = allowedRange(adjusted)
  const newest = sales
    .filter((s) => s.productId === productId)
    .slice()
    .sort((a, b) => b.soldAt - a.soldAt)[0]
  return {
    productId,
    condition,
    baseMmaCents: base,
    adjustedMmaCents: adjusted,
    minCents,
    maxCents,
    conditionFactor: factor,
    source: MARKET_SOURCE,
    referenceDate: newest ? new Date(newest.soldAt).toISOString() : new Date(0).toISOString(),
  }
}

/** Where `priceCents` sits inside the accepted interval, 0 (lowest) .. 1 (highest). */
export function positionInRange(priceCents: number, minCents: number, maxCents: number): number {
  const span = maxCents - minCents
  if (span <= 0) return 0.5
  return Math.min(1, Math.max(0, (priceCents - minCents) / span))
}

/** Tick percentage for a price position: barely at the low end, bounded at the top. */
export function mmaTickPct(position: number): number {
  return MMA_TICK_MIN_PCT + (MMA_TICK_MAX_PCT - MMA_TICK_MIN_PCT) * position
}

/**
 * The new base market price after an event at `priceCents` for `condition`.
 * direction `1` = accepted listing (market price moves up), `-1` = completed
 * sale (moves down). Moves scale with where the price sits in the range but
 * are bounded to [MMA_TICK_MIN_PCT, MMA_TICK_MAX_PCT] of the base.
 */
export function movedBaseCents(
  baseCents: number,
  priceCents: number,
  condition: Condition,
  direction: 1 | -1,
): number {
  const factor = conditionFactor(condition)
  const adjusted = Math.round(baseCents * factor)
  const { minCents, maxCents } = allowedRange(adjusted)
  const pct = mmaTickPct(positionInRange(priceCents, minCents, maxCents))
  const delta = Math.max(1, Math.round((baseCents * pct) / 100))
  if (direction === 1) return baseCents + delta
  return Math.max(1, baseCents - delta)
}

/** Returns a NEW marketPrices map with the product's base moved (immutable). */
export function moveMarketPrice(
  marketPrices: Record<string, number>,
  productId: string,
  priceCents: number,
  condition: Condition,
  direction: 1 | -1,
  sales: SaleSample[],
): Record<string, number> {
  const base = baseFromMarket(productId, marketPrices, sales)
  const moved = movedBaseCents(base, priceCents, condition, direction)
  if (moved === base) return marketPrices
  return { ...marketPrices, [productId]: moved }
}

export type RejectionDirection = "below" | "above" | null

export function rejectionDirection(priceCents: number, snapshot: ValuationSnapshot): RejectionDirection {
  if (priceCents < snapshot.minCents) return "below"
  if (priceCents > snapshot.maxCents) return "above"
  return null
}

export function rejectionReason(priceCents: number, snapshot: ValuationSnapshot): string | null {
  const dir = rejectionDirection(priceCents, snapshot)
  if (dir === null) return null
  const range = formatRange(snapshot.minCents, snapshot.maxCents)
  if (dir === "below") {
    return `Rejected — ${formatMoney(priceCents)} is below the accepted range (${range}).`
  }
  return `Rejected — ${formatMoney(priceCents)} is above the accepted range (${range}).`
}
