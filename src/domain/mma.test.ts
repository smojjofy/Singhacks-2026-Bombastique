// Stock-like Market Moving Average: accepted listings push the market price up,
// completed sales push it down, scaled by where the price sits in the accepted
// interval (barely at the low end, a bounded margin at the high end).

import { describe, expect, it } from "vitest"
import { buildSeedState } from "../data/seed"
import { reduce } from "./transitions"
import {
  baseFromMarket,
  movedBaseCents,
  positionInRange,
  snapshotFromMarket,
  mmaTickPct,
} from "./valuation"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import type { Command, DemoState } from "./types"

const NOW = new Date("2026-09-05T12:00:00Z").getTime()
const DAY = 86_400_000
const provider = new SimulatedPaymentProvider()
const run = (state: DemoState, cmd: Command, at = NOW) => reduce(state, cmd, at, provider)

const PHONE = "phone-iphone-13"
const seed = () => buildSeedState(NOW)
const price = (s: DemoState) => baseFromMarket(PHONE, s.marketPrices, s.sales)

describe("moving MMA policy (pure helpers)", () => {
  it("starts at the canonical seeded baseline of Demo SGD 400", () => {
    const s = seed()
    expect(price(s)).toBe(40_000)
    const snap = snapshotFromMarket(PHONE, "Good", s.marketPrices, s.sales)
    expect(snap.minCents).toBe(28_000)
    expect(snap.maxCents).toBe(52_000)
  })

  it("positions prices inside the accepted interval from 0 (lowest) to 1 (highest)", () => {
    expect(positionInRange(28_000, 28_000, 52_000)).toBe(0)
    expect(positionInRange(52_000, 28_000, 52_000)).toBe(1)
    expect(positionInRange(40_000, 28_000, 52_000)).toBeCloseTo(0.5)
    expect(positionInRange(10_000, 28_000, 52_000)).toBe(0) // below range clamps
  })

  it("ticks barely at the lowest acceptable price and by a bounded margin at the highest", () => {
    expect(mmaTickPct(0)).toBe(0.15)
    expect(mmaTickPct(1)).toBe(1.5)
    // Listing at the lowest acceptable price (28_000) moves the MMA up by a hair.
    expect(movedBaseCents(40_000, 28_000, "Good", 1)).toBe(40_060) // +0.15%
    // Listing at the highest acceptable price (52_000) moves it up by a margin.
    expect(movedBaseCents(40_000, 52_000, "Good", 1)).toBe(40_600) // +1.5%
    // Completed sales move it down by the same magnitudes.
    expect(movedBaseCents(40_000, 28_000, "Good", -1)).toBe(39_940)
    expect(movedBaseCents(40_000, 52_000, "Good", -1)).toBe(39_400)
    // A mid-range price moves it a small amount between the two extremes.
    const mid = movedBaseCents(40_000, 35_000, "Good", 1)
    expect(mid).toBeGreaterThan(40_060)
    expect(mid).toBeLessThan(40_600)
    // Condition-adjusted events move the same product base (Like new ×1.1).
    const ln = movedBaseCents(40_000, 55_000, "Like new", 1)
    expect(ln).toBeGreaterThan(40_000)
    expect(ln).toBeLessThan(40_600)
  })
})

describe("moving MMA through the command layer", () => {
  it("rejects an out-of-range listing without moving the market price", () => {
    let s = seed()
    const before = price(s)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 20_000 }, NOW + 1)
    expect(price(s)).toBe(before)
    expect(s.listings[0].status).toBe("rejected")
  })

  it("an accepted listing at the top of the range moves the MMA up significantly", () => {
    let s = seed()
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 52_000 }, NOW + 1)
    expect(s.listings[0].status).toBe("live")
    expect(price(s)).toBe(40_600)
    // The next accepted range follows the moved MMA.
    const snap = snapshotFromMarket(PHONE, "Good", s.marketPrices, s.sales)
    expect(snap.adjustedMmaCents).toBe(40_600)
    expect(snap.maxCents).toBeGreaterThan(52_000)
  })

  it("an accepted listing at the bottom of the range barely moves the MMA up", () => {
    let s = seed()
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 28_000 }, NOW + 1)
    expect(s.listings[0].status).toBe("live")
    expect(price(s)).toBe(40_060)
  })

  it("a completed sale pushes the MMA back down (full buy journey)", () => {
    let s = seed()
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 52_000 }, NOW + 1)
    expect(price(s)).toBe(40_600)
    const listing = s.listings.find((l) => l.productId === PHONE)!

    // Alex wants it with a ceiling at the top of the range.
    s = run(
      s,
      { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: PHONE, condition: "Good", targetListingId: listing.id, ceilingCents: 52_000 },
      NOW + 2,
    )
    const proposal = s.proposals.find((p) => p.buyerId === "buyer-alex" && p.status === "awaiting_authorization")
    expect(proposal).toBeTruthy()
    // Authorizing does not move the MMA (no sale yet).
    s = run(s, { type: "authorizeProposal", actorId: "buyer-alex", proposalId: proposal!.id }, NOW + 3)
    expect(price(s)).toBe(40_600)
    // Confirming receipt completes the sale at 52_000 (top of range) -> down by a margin.
    const order = s.orders.find((o) => o.buyerId === "buyer-alex")
    expect(order).toBeTruthy()
    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId: order!.id }, NOW + 4)
    expect(order!.status).toBe("escrow")
    expect(price(s)).toBeLessThan(40_600)
    expect(price(s)).toBeGreaterThan(40_000) // bounded: does not over-correct
    expect(s.orders.find((o) => o.id === order!.id)!.status).toBe("complete")
  })

  it("listing up then selling at the same price returns close to the baseline", () => {
    let s = seed()
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 35_000 }, NOW + 1)
    const afterListing = price(s)
    expect(afterListing).toBe(40_218)
    const listing = s.listings.find((l) => l.productId === PHONE)!
    s = run(
      s,
      { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: PHONE, condition: "Good", targetListingId: listing.id, ceilingCents: 35_000 },
      NOW + 2,
    )
    const proposal = s.proposals.find((p) => p.buyerId === "buyer-alex" && p.status === "awaiting_authorization")!
    s = run(s, { type: "authorizeProposal", actorId: "buyer-alex", proposalId: proposal.id }, NOW + 3)
    const order = s.orders.find((o) => o.buyerId === "buyer-alex")!
    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId: order.id }, NOW + 4)
    expect(price(s)).toBeLessThan(afterListing)
    expect(price(s)).toBeGreaterThanOrEqual(40_000) // symmetric drift stays ~baseline
  })

  it("keeps market prices product-scoped (phone moves do not touch the camera)", () => {
    let s = seed()
    const cameraBefore = baseFromMarket("camera-fuji-x100v", s.marketPrices, s.sales)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: PHONE, condition: "Good", amountCents: 52_000 }, NOW + 1)
    expect(price(s)).toBe(40_600)
    expect(baseFromMarket("camera-fuji-x100v", s.marketPrices, s.sales)).toBe(cameraBefore)
    expect(s.marketPrices).not.toBe(seed().marketPrices) // immutable copy
  })
})
