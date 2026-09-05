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

/**
 * Simulation anti-bot velocity policy (mirrors the server MPP meter).
 * Each persona gets this many guarded submissions (listings, intents,
 * checkouts) per window before the free tier is exhausted.
 */
export const VELOCITY_WINDOW_MS = 60_000
export const VELOCITY_FREE_LIMIT = 5

/** Number of most-recent seeded sales used to compute the base MMA. */
export const MMA_SAMPLE_COUNT = 10

/** Source label shown next to every valuation snapshot. */
export const MMA_SOURCE = "Based on 10 seeded demo sales"

/**
 * Source label for the live market price (seed baseline that listings and
 * completed sales move — the stock-like MMA).
 */
export const MARKET_SOURCE = "Market price: seeded baseline updated by listings & completed sales"

/**
 * Moving-MMA policy. Each accepted listing pushes the market price up and each
 * completed sale pushes it down, by an amount that scales with where the price
 * sits inside the accepted interval: at the low end the MMA barely moves, at
 * the high end it moves by a margin (maxPct), never more.
 */
export const MMA_TICK_MIN_PCT = 0.15 // barely — at the lowest acceptable price

export const MMA_TICK_MAX_PCT = 1.5 // significant margin, still bounded — at the highest acceptable price

/** Persisted-state version. Bump to force a reset on incompatible data. */
export const STORE_VERSION = 2

/** Seed fixture version. Bump to invalidate stale persisted seed data. */
export const SEED_VERSION = 1
