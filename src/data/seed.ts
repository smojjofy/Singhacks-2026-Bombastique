// Deterministic seed data and demo fixtures. Reset restores exactly this state.

import { PRODUCTS } from "./catalog"
import { SEED_VERSION, STORE_VERSION } from "../domain/config"
import { reduce } from "../domain/transitions"
import { baseMmaCents, computeSnapshot } from "../domain/valuation"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import type { DemoState, Persona, SaleSample } from "../domain/types"

export const PERSONAS: Persona[] = [
  { id: "seller-maya", name: "Maya (Seller)", role: "seller", initialFundsCents: 0 },
  { id: "buyer-alex", name: "Alex (Buyer A)", role: "buyer", initialFundsCents: 100_000 },
  { id: "buyer-blake", name: "Blake (Buyer B)", role: "buyer", initialFundsCents: 100_000 },
  { id: "buyer-lee", name: "Lee (Low balance)", role: "buyer", initialFundsCents: 10_000 },
]

const DAY_MS = 86_400_000

/** Deterministic PRNG so reset and test runs reproduce identical samples. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function generateSamples(productId: string, baseCents: number, count: number, now: number): SaleSample[] {
  const rng = mulberry32(hashString(productId))
  const samples: SaleSample[] = []
  for (let i = 0; i < count; i++) {
    const jitter = (rng() - 0.5) * 0.16 // ±8%
    const amountCents = Math.max(100, Math.round(baseCents * (1 + jitter)))
    const daysAgo = 4 + i * (170 / count) + rng() * 2
    const soldAt = now - Math.round(daysAgo * DAY_MS)
    samples.push({ id: `sale_${productId}_${i}`, productId, amountCents, soldAt })
  }
  return samples
}

/** 10 samples whose arithmetic mean is exactly 40000 cents (Demo SGD 400). */
const MAIN_PHONE_AMOUNTS = [36000, 37000, 38000, 39000, 40000, 41000, 42000, 43000, 44000, 40000]

/** Seed base (Good-condition) price targets for sample generation. */
const SEED_BASE: Record<string, number> = {
  "phone-iphone-13": 40000,
  "phone-pixel-9": 60000,
  "phone-galaxy-s23": 45000,
  "bike-trek-fx": 38000,
  "scooter-xiaomi": 35000,
  "ebike-rad": 140000,
  "vacuum-dyson": 30000,
  "pot-instant": 9000,
  "airfryer-ninja": 8000,
  "microwave-panasonic": 15000,
  "washer-compact": 20000,
  "console-switch": 25000,
  "headphones-sony-xm5": 28000,
  "camera-fuji-x100v": 139500,
  "console-ps5": 48000,
}

function buildSales(now: number): SaleSample[] {
  const sales: SaleSample[] = []
  for (const p of PRODUCTS) {
    if (p.id === "phone-iphone-13") {
      MAIN_PHONE_AMOUNTS.forEach((amount, i) => {
        sales.push({
          id: `sale_${p.id}_${i}`,
          productId: p.id,
          amountCents: amount,
          soldAt: now - (i + 1) * DAY_MS,
        })
      })
    } else {
      const base = SEED_BASE[p.id] ?? 40000
      sales.push(...generateSamples(p.id, base, 12, now))
    }
  }
  return sales
}

export function buildBaseState(now: number): DemoState {
  const sales = buildSales(now)
  return {
    version: STORE_VERSION,
    seedVersion: SEED_VERSION,
    personas: PERSONAS.map((p) => ({ ...p })),
    catalog: PRODUCTS.map((p) => ({ ...p })),
    sales,
    // Canonical starting market price per product = mean of its seeded sales.
    marketPrices: Object.fromEntries(PRODUCTS.map((p) => [p.id, baseMmaCents(p.id, sales)])),
    listings: [],
    intents: [],
    orders: [],
    proposals: [],
    ledger: [],
    notifications: [],
    currentPersonaId: "seller-maya",
    carts: {},
    resetAt: now,
    seedNow: now,
  }
}

/**
 * Build the full seeded demo state. Fixtures are applied through the command
 * layer so they exercise the same validation, notifications, and matching as
 * interactive use.
 */
export function buildSeedState(now: number): DemoState {
  const provider = new SimulatedPaymentProvider()
  let state = buildBaseState(now)
  const dispatch = (cmd: Parameters<typeof reduce>[1], at: number) => reduce(state, cmd, at, provider)

  // 1. A live camera listing with no matching intent (sits in inventory).
  const camera = computeSnapshot("camera-fuji-x100v", "Good", state.sales)
  state = dispatch(
    { type: "createListing", actorId: "seller-maya", productId: "camera-fuji-x100v", condition: "Good", amountCents: camera.adjustedMmaCents },
    now,
  )

  // 2. A below-range listing that is automatically rejected.
  const pot = computeSnapshot("pot-instant", "Good", state.sales)
  state = dispatch(
    { type: "createListing", actorId: "seller-maya", productId: "pot-instant", condition: "Good", amountCents: Math.max(1, Math.floor(pot.minCents / 2)) },
    now,
  )

  // 3. Fairness fixture: two I Need intents for a vacuum with no listing yet.
  //    Blake's expires first, so Blake should win when a listing is published.
  const vacuum = computeSnapshot("vacuum-dyson", "Good", state.sales)
  state = dispatch(
    { type: "submitIntent", actorId: "buyer-blake", source: "need", productId: "vacuum-dyson", condition: "Good", ceilingCents: vacuum.adjustedMmaCents },
    now - 3 * DAY_MS,
  )
  state = dispatch(
    { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "vacuum-dyson", condition: "Good", ceilingCents: vacuum.adjustedMmaCents },
    now - 1 * DAY_MS,
  )

  // 4. Insufficient-funds fixture: a microwave listing that the low-balance
  //    persona cannot fund. The listing stays live; the intent is funding_failed.
  //    The intent is submitted first (so its snapshot uses the canonical MMA),
  //    then the listing triggers matching.
  const micro = computeSnapshot("microwave-panasonic", "Good", state.sales)
  state = dispatch(
    { type: "submitIntent", actorId: "buyer-lee", source: "need", productId: "microwave-panasonic", condition: "Good", ceilingCents: micro.adjustedMmaCents },
    now,
  )
  state = dispatch(
    { type: "createListing", actorId: "seller-maya", productId: "microwave-panasonic", condition: "Good", amountCents: micro.adjustedMmaCents },
    now,
  )
  // Lee authorizes, but funding fails (low balance): intent -> funding_failed,
  // listing released back to live. Exercises the authorization gate in the seed.
  const leeProposal = state.proposals.find((p) => p.buyerId === "buyer-lee" && p.status === "awaiting_authorization")?.id
  if (leeProposal) {
    state = dispatch({ type: "authorizeProposal", actorId: "buyer-lee", proposalId: leeProposal }, now)
  }

  // Fixtures were built by moving the market price; reset to the canonical
  // baseline so a fresh demo starts at the same MMA every time.
  const baseline = Object.fromEntries(PRODUCTS.map((p) => [p.id, baseMmaCents(p.id, state.sales)]))
  return { ...state, marketPrices: baseline }
}
