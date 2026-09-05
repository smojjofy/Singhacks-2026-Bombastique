import { describe, expect, it } from "vitest"
import { buildBaseState, buildSeedState } from "../data/seed"
import { productById } from "../data/catalog"
import { reduce } from "./transitions"
import {
  availableCents,
  balancesReconcile,
  escrowCents,
  incomingPendingCents,
  totalSeededFunds,
} from "./balances"
import { allowedRange, computeSnapshot, isWithinInterval, rejectionReason } from "./valuation"
import { formatMoney, parseCents } from "./money"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import type { Command, DemoState } from "./types"

const NOW = new Date("2026-09-05T12:00:00Z").getTime()
const DAY = 86_400_000
const provider = new SimulatedPaymentProvider()

const run = (state: DemoState, cmd: Command, at = NOW) => reduce(state, cmd, at, provider)
const authorize = (state: DemoState, buyerId: string): DemoState => {
  const proposal = state.proposals.find((p) => p.buyerId === buyerId && p.status === "awaiting_authorization")
  if (!proposal) throw new Error(`No awaiting proposal for ${buyerId}`)
  return run(state, { type: "authorizeProposal", actorId: buyerId, proposalId: proposal.id })
}

const phone = () => computeSnapshot("phone-iphone-13", "Good", buildBaseState(NOW).sales)

const lastListing = (s: DemoState, productId: string) =>
  s.listings.find((l) => l.productId === productId) ?? s.listings[0]
const lastIntent = (s: DemoState, buyerId: string) => s.intents.find((i) => i.buyerId === buyerId)!

describe("catalog and valuation", () => {
  it("seeds 12-18 recognizable products across required categories", () => {
    const s = buildBaseState(NOW)
    expect(s.catalog.length).toBeGreaterThanOrEqual(12)
    expect(s.catalog.length).toBeLessThanOrEqual(18)
    const cats = new Set(s.catalog.map((p) => p.category))
    expect(cats.has("Phones")).toBe(true)
    expect(cats.has("Bicycles & E-Scooters")).toBe(true)
    expect(cats.has("Household Appliances")).toBe(true)
  })

  it("gives every product at least 10 seeded sales", () => {
    const s = buildBaseState(NOW)
    for (const p of s.catalog) {
      expect(s.sales.filter((x) => x.productId === p.id).length).toBeGreaterThanOrEqual(10)
    }
  })

  it("main phone Good-condition MMA is exactly Demo SGD 400 with interval 280-520", () => {
    const snap = phone()
    expect(snap.baseMmaCents).toBe(40000)
    expect(snap.adjustedMmaCents).toBe(40000)
    expect(snap.minCents).toBe(28000)
    expect(snap.maxCents).toBe(52000)
    expect(allowedRange(40000)).toEqual({ minCents: 28000, maxCents: 52000 })
  })

  it("applies condition factors (Like new 1.10, Fair 0.80)", () => {
    const s = buildBaseState(NOW)
    expect(computeSnapshot("phone-iphone-13", "Like new", s.sales).adjustedMmaCents).toBe(44000)
    expect(computeSnapshot("phone-iphone-13", "Fair", s.sales).adjustedMmaCents).toBe(32000)
  })

  it("accepts exact boundaries and rejects just outside", () => {
    const snap = phone()
    expect(isWithinInterval(28000, snap)).toBe(true)
    expect(isWithinInterval(52000, snap)).toBe(true)
    expect(isWithinInterval(27999, snap)).toBe(false)
    expect(isWithinInterval(52001, snap)).toBe(false)
  })
})

describe("money", () => {
  it("parses whole currency to cents and rejects malformed input", () => {
    expect(parseCents("350")).toBe(35000)
    expect(parseCents("350.5")).toBe(35050)
    expect(parseCents("350.55")).toBe(35055)
    expect(parseCents("0")).toBeNull()
    expect(parseCents("-5")).toBeNull()
    expect(parseCents("350.555")).toBeNull()
    expect(parseCents("abc")).toBeNull()
    expect(parseCents("")).toBeNull()
  })

  it("formats money and ranges", () => {
    expect(formatMoney(40000)).toBe("Demo SGD 400")
    expect(formatMoney(28050)).toBe("Demo SGD 280.50")
    expect(rejectionReason(20000, phone())).toContain("below")
    expect(rejectionReason(55000, phone())).toContain("above")
  })
})

describe("price policy (two-sided automatic rejection)", () => {
  it("rejects seller prices below and above the band, with reasons and no money movement", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 20000 })
    let listing = lastListing(s, "phone-iphone-13")
    expect(listing.status).toBe("rejected")
    expect(listing.reason).toContain("below")
    expect(availableCents(s, "seller-maya")).toBe(0)
    expect(s.ledger.length).toBe(0)

    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 55000 })
    listing = lastListing(s, "phone-iphone-13")
    expect(listing.status).toBe("rejected")
    expect(listing.reason).toContain("above")
    expect(s.ledger.length).toBe(0)
  })

  it("rejects buyer ceilings below/above the band with a visible reason", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 20000 })
    expect(lastIntent(s, "buyer-alex").status).toBe("rejected")
    expect(lastIntent(s, "buyer-alex").reason).toContain("below")

    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 55000 })
    const intents = s.intents.filter((i) => i.buyerId === "buyer-alex")
    expect(intents[0].status).toBe("rejected")
    expect(intents[0].reason).toContain("above")
    expect(s.ledger.length).toBe(0)
  })

  it("corrected resubmission publishes and matches", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 20000 })
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const live = s.listings.filter((l) => l.productId === "phone-iphone-13" && l.status === "live")
    expect(live.length).toBe(1)
  })

  it("editing a live listing outside the band delists it", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const id = lastListing(s, "phone-iphone-13").id
    s = run(s, { type: "editListing", actorId: "seller-maya", listingId: id, amountCents: 20000 })
    expect(s.listings.find((l) => l.id === id)!.status).toBe("rejected")
  })
})

describe("matching and lifecycle", () => {
  it("matches listing-first arrival automatically", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listing = lastListing(s, "phone-iphone-13")
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listing.id, ceilingCents: 38000 })
    expect(s.orders.length).toBe(0)
    expect(s.proposals.length).toBe(1)
    expect(s.listings.find((l) => l.id === listing.id)!.status).toBe("reserved")
    s = authorize(s, "buyer-alex")
    expect(s.orders.length).toBe(1)
    expect(s.orders[0].amountCents).toBe(35000)
    expect(availableCents(s, "buyer-alex")).toBe(65000)
    expect(escrowCents(s)).toBe(35000)
  })

  it("matches intent-first arrival automatically", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    expect(lastIntent(s, "buyer-alex").status).toBe("searching")
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    expect(s.orders.length).toBe(0)
    expect(lastIntent(s, "buyer-alex").status).toBe("reserved")
    s = authorize(s, "buyer-alex")
    expect(s.orders.length).toBe(1)
    expect(s.orders[0].buyerId).toBe("buyer-alex")
  })

  it("picks the oldest-expiring eligible buyer", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 }, NOW)
    s = run(s, { type: "submitIntent", actorId: "buyer-blake", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 }, NOW - 2 * DAY)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    expect(s.orders.length).toBe(0)
    expect(s.proposals[0].buyerId).toBe("buyer-blake")
    s = authorize(s, "buyer-blake")
    expect(s.orders.length).toBe(1)
    expect(s.orders[0].buyerId).toBe("buyer-blake")
  })

  it("excludes self-purchase and requires ceiling to cover asking price", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listing = lastListing(s, "phone-iphone-13")
    s = run(s, { type: "submitIntent", actorId: "seller-maya", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listing.id, ceilingCents: 38000 })
    expect(s.orders.length).toBe(0)
    expect(lastIntent(s, "seller-maya").status).toBe("searching")

    // ceiling below asking price stays searching even though in range
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 30000 })
    expect(s.orders.length).toBe(0)
    expect(lastIntent(s, "buyer-alex").status).toBe("searching")
  })

  it("insufficient funds marks funding_failed on authorization, moves no money, and lets another buyer match", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listing = lastListing(s, "phone-iphone-13")
    s = run(s, { type: "submitIntent", actorId: "buyer-lee", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listing.id, ceilingCents: 38000 })
    expect(lastIntent(s, "buyer-lee").status).toBe("reserved")
    expect(s.orders.length).toBe(0)
    expect(availableCents(s, "buyer-lee")).toBe(10000)
    s = authorize(s, "buyer-lee")
    expect(lastIntent(s, "buyer-lee").status).toBe("funding_failed")
    expect(lastIntent(s, "buyer-lee").reason).toContain("Insufficient")
    expect(s.orders.length).toBe(0)
    expect(availableCents(s, "buyer-lee")).toBe(10000)
    expect(s.listings.find((l) => l.id === listing.id)!.status).toBe("live")

    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listing.id, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    expect(s.orders.length).toBe(1)
    expect(s.orders[0].buyerId).toBe("buyer-alex")
  })

  it("receipt and refund are idempotent and affect only the linked order", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listing = lastListing(s, "phone-iphone-13")
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listing.id, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    const orderId = s.orders[0].id
    expect(escrowCents(s)).toBe(35000)
    expect(incomingPendingCents(s, "seller-maya")).toBe(35000)

    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId })
    expect(s.orders[0].status).toBe("complete")
    expect(availableCents(s, "seller-maya")).toBe(35000)
    expect(escrowCents(s)).toBe(0)
    expect(incomingPendingCents(s, "seller-maya")).toBe(0)
    const releaseCount = s.ledger.filter((e) => e.kind === "release").length
    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId })
    expect(s.ledger.filter((e) => e.kind === "release").length).toBe(releaseCount)

    // completed order cannot be cancelled
    s = run(s, { type: "cancelOrder", actorId: "buyer-alex", orderId })
    expect(s.orders[0].status).toBe("complete")
  })

  it("funded cancellation refunds once and relists, and the request cannot rematch", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listingId = lastListing(s, "phone-iphone-13").id
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listingId, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    const orderId = s.orders[0].id
    s = run(s, { type: "cancelOrder", actorId: "buyer-alex", orderId })
    expect(s.orders[0].status).toBe("cancelled")
    expect(s.listings.find((l) => l.id === listingId)!.status).toBe("live")
    expect(availableCents(s, "buyer-alex")).toBe(100000)
    expect(escrowCents(s)).toBe(0)
    // cancelled request must not immediately rematch the relisted item
    expect(s.orders.length).toBe(1)
    s = run(s, { type: "cancelOrder", actorId: "buyer-alex", orderId })
    expect(s.ledger.filter((e) => e.kind === "refund").length).toBe(1)
  })

  it("expires searching intents and leaves funded escrow intact past expiry", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    const searchingId = lastIntent(s, "buyer-alex").id
    s = run(s, { type: "markAllRead", actorId: "buyer-alex" }, NOW + 91 * DAY)
    expect(s.intents.find((i) => i.id === searchingId)!.status).toBe("expired")

    // funded order must survive a far-future clock tick
    let t = buildBaseState(NOW)
    t = run(t, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const lid = lastListing(t, "phone-iphone-13").id
    t = run(t, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: lid, ceilingCents: 38000 })
    t = authorize(t, "buyer-alex")
    t = run(t, { type: "markAllRead", actorId: "buyer-alex" }, NOW + 91 * DAY)
    expect(t.orders[0].status).toBe("escrow")
    expect(t.listings.find((l) => l.id === lid)!.status).toBe("escrow")
  })

  it("conserves total funds through fund/release/refund", () => {
    const s0 = buildBaseState(NOW)
    expect(balancesReconcile(s0)).toBe(true)
    let s = s0
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const lid = lastListing(s, "phone-iphone-13").id
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: lid, ceilingCents: 38000 })
    expect(balancesReconcile(s)).toBe(true)
    s = authorize(s, "buyer-alex")
    expect(balancesReconcile(s)).toBe(true)
    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId: s.orders[0].id })
    expect(balancesReconcile(s)).toBe(true)
    expect(totalSeededFunds(s)).toBe(210000)
  })
})

describe("cart checkout", () => {
  it("supports mixed outcomes, retaining rejected lines and removing approved ones", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "selectPersona", personaId: "buyer-alex" })
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-pixel-9", condition: "Good", amountCents: 60000 })
    const phoneId = s.listings.find((l) => l.productId === "phone-iphone-13")!.id
    const pixelId = s.listings.find((l) => l.productId === "phone-pixel-9")!.id
    s = run(s, { type: "addToCart", actorId: "buyer-alex", listingId: phoneId })
    s = run(s, { type: "addToCart", actorId: "buyer-alex", listingId: pixelId })

    s = run(s, {
      type: "checkoutCart",
      actorId: "buyer-alex",
      lines: [
        { listingId: phoneId, ceilingCents: 38000 }, // valid
        { listingId: pixelId, ceilingCents: 10000 }, // below pixel band -> rejected
      ],
    })
    const cart = s.carts["buyer-alex"] ?? []
    expect(cart.map((c) => c.listingId)).toEqual([pixelId])
    const phoneIntent = s.intents.find((i) => i.buyerId === "buyer-alex" && i.productId === "phone-iphone-13")!
    const pixelIntent = s.intents.find((i) => i.buyerId === "buyer-alex" && i.productId === "phone-pixel-9")!
    expect(phoneIntent.status).toBe("reserved")
    expect(pixelIntent.status).toBe("rejected")
  })

  it("I Need preserves the cart and stale cart lines cannot buy unavailable inventory", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "selectPersona", personaId: "buyer-alex" })
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const phoneId = s.listings.find((l) => l.productId === "phone-iphone-13")!.id
    s = run(s, { type: "addToCart", actorId: "buyer-alex", listingId: phoneId })

    // I Need does not touch the cart
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "vacuum-dyson", condition: "Good", ceilingCents: 30000 })
    expect((s.carts["buyer-alex"] ?? []).length).toBe(1)

    // delist the phone, then try to checkout the stale line
    s = run(s, { type: "editListing", actorId: "seller-maya", listingId: phoneId, amountCents: 20000 })
    s = run(s, { type: "checkoutCart", actorId: "buyer-alex", lines: [{ listingId: phoneId, ceilingCents: 38000 }] })
    const stale = s.intents.find((i) => i.targetListingId === phoneId)!
    expect(stale.status).toBe("rejected")
    expect(stale.reason).toContain("no longer available")
    expect(s.orders.length).toBe(0)
  })
})

describe("seed fixtures", () => {
  it("produces the expected demo fixtures and reconciles balances", () => {
    const s = buildSeedState(NOW)
    const live = s.listings.filter((l) => l.status === "live").map((l) => l.productId)
    expect(live).toContain("camera-fuji-x100v")
    expect(live).toContain("microwave-panasonic")
    expect(s.listings.some((l) => l.status === "rejected")).toBe(true)
    // no phone listing seeded, so the main scenario starts clean
    expect(s.listings.some((l) => l.productId === "phone-iphone-13")).toBe(false)

    const searching = s.intents.filter((i) => i.status === "searching")
    expect(searching.length).toBe(2)
    expect(searching.every((i) => i.productId === "vacuum-dyson")).toBe(true)
    expect(s.intents.some((i) => i.status === "funding_failed" && i.buyerId === "buyer-lee")).toBe(true)
    expect(balancesReconcile(s)).toBe(true)
    expect(productById("phone-iphone-13")).toBeTruthy()
  })

  it("lists against seeded I Need intents and picks the oldest-expiring buyer", () => {
    let s = buildSeedState(NOW)
    const vacuum = computeSnapshot("vacuum-dyson", "Good", s.sales)
    s = run(s, {
      type: "createListing",
      actorId: "seller-maya",
      productId: "vacuum-dyson",
      condition: "Good",
      amountCents: vacuum.adjustedMmaCents,
    })
    expect(s.proposals.find((p) => p.productId === "vacuum-dyson")?.buyerId).toBe("buyer-blake")
    s = authorize(s, "buyer-blake")
    expect(s.orders.find((o) => o.productId === "vacuum-dyson")?.buyerId).toBe("buyer-blake")
  })
})
