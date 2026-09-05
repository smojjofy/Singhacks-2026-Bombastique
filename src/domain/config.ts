// Centralized configuration for the Yardle demo. All business-rule constants
// live here so they can be changed in one place (see PLANNING.md section 2).

import type { Condition } from "./types"

/** The currency label used everywhere in the demo. No real funds. */
export const CURRENCY = "Demo SGD" as const
export type Currency = typeof CURRENCY

/**
 * Price-policy interval as integer percentages of the condition-adjusted MMA.
 * Allowed prices are within [MIN_PCT, MAX_PCT] percent inclusive (70%–130%).
 * Integer percentages are used so validation and displayed limits never drift.
 */
export const PRICE_MIN_PCT = 70
export const PRICE_MAX_PCT = 130

/** Condition adjustment factors applied to the base (Good) MMA. */
export const CONDITION_FACTORS: Record<Condition, number> = {
  "Like new": 1.1,
  Good: 1.0,
  Fair: 0.8,
}

export const CONDITIONS: Condition[] = ["Like new", "Good", "Fair"]

/** Buyer-intent Need Window lifetime in days. */
export const NEED_WINDOW_DAYS = 90

/** Authorization window for a prepared payment proposal (simulation). */
export const AUTHORIZATION_WINDOW_MS = 5 * 60_000

/** Number of most-recent seeded sales used to compute the base MMA. */
export const MMA_SAMPLE_COUNT = 10

/** Source label shown next to every valuation snapshot. */
export const MMA_SOURCE = "Based on 10 seeded demo sales"

/** Persisted-state version. Bump to force a reset on incompatible data. */
export const STORE_VERSION = 1

/** Seed fixture version. Bump to invalidate stale persisted seed data. */
export const SEED_VERSION = 1
