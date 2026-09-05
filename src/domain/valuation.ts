// Valuation: derive the condition-adjusted Market Moving Average and the
// accepted price interval from the seeded sale history.

import {
  CONDITION_FACTORS,
  MMA_SAMPLE_COUNT,
  MMA_SOURCE,
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
