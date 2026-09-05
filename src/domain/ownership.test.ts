import { describe, expect, it } from "vitest"
import { buildBaseState } from "../data/seed"
import { reduce } from "./transitions"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import { availableCents, escrowCents } from "./balances"
import type { Command, DemoState } from "./types"

const NOW = new Date("2026-09-05T12:00:00Z").getTime()
const provider = new SimulatedPaymentProvider()
const run = (s: DemoState, cmd: Command, at = NOW) => reduce(s, cmd, at, provider)
const authorize = (s: DemoState, buyerId: string): DemoState => {
  const proposal = s.proposals.find((p) => p.buyerId === buyerId && p.status === "awaiting_authorization")
  if (!proposal) throw new Error(`No awaiting proposal for ${buyerId}`)
  return run(s, { type: "authorizeProposal", actorId: buyerId, proposalId: proposal.id })
}

const phoneListing = (s: DemoState) =>
  run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })

const phoneListingId = (s: DemoState) => s.listings.find((l) => l.productId === "phone-iphone-13")!.id

describe("actor ownership", () => {
  it("rejects an unknown actor with no effect", () => {
    const s = buildBaseState(NOW)
    const out = run(s, { type: "createListing", actorId: "ghost", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    expect(out).toBe(s)
    expect(out.listings.length).toBe(0)
  })

  it("rejects a wrong-owner listing edit", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "editListing", actorId: "buyer-alex", listingId: id, amountCents: 20000 })
    expect(s.listings.find((l) => l.id === id)!.status).toBe("live")
    expect(s.listings.find((l) => l.id === id)!.amountCents).toBe(35000)
  })

  it("rejects a wrong-owner receipt confirmation", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    const orderId = s.orders[0].id
    s = run(s, { type: "confirmReceipt", actorId: "seller-maya", orderId })
    expect(s.orders[0].status).toBe("escrow")
    expect(escrowCents(s)).toBe(35000)
    expect(availableCents(s, "seller-maya")).toBe(0)
  })

  it("rejects a wrong-owner order cancellation", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    const orderId = s.orders[0].id
    s = run(s, { type: "cancelOrder", actorId: "buyer-blake", orderId })
    expect(s.orders[0].status).toBe("escrow")
    expect(s.ledger.filter((e) => e.kind === "refund").length).toBe(0)
  })

  it("rejects a wrong-owner intent cancellation", () => {
    let s = run(buildBaseState(NOW), { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    const intentId = s.intents.find((i) => i.buyerId === "buyer-alex")!.id
    s = run(s, { type: "cancelIntent", actorId: "buyer-blake", intentId })
    expect(s.intents.find((i) => i.id === intentId)!.status).toBe("searching")
  })

  it("rejects marking another persona's notification read", () => {
    let s = phoneListing(buildBaseState(NOW)) // seller gets a publish notification
    const notif = s.notifications.find((n) => n.recipientId === "seller-maya")!
    s = run(s, { type: "markRead", actorId: "buyer-alex", notificationId: notif.id })
    expect(s.notifications.find((n) => n.id === notif.id)!.read).toBe(false)
  })
})

describe("two-order isolation", () => {
  it("receipt on one order does not release or refund the other", () => {
    let s = buildBaseState(NOW)
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listingA = s.listings.find((l) => l.productId === "phone-iphone-13")!.id
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: listingA, ceilingCents: 38000 })
    s = authorize(s, "buyer-alex")
    const orderA = s.orders[0].id

    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const listingB = s.listings.find((l) => l.productId === "phone-iphone-13" && l.status === "live")!.id
    s = run(s, { type: "submitIntent", actorId: "buyer-blake", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    s = authorize(s, "buyer-blake")
    expect(s.orders.length).toBe(2)
    const orderB = s.orders.find((o) => o.listingId === listingB)!.id

    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId: orderA })
    expect(s.orders.find((o) => o.id === orderA)!.status).toBe("complete")
    expect(s.orders.find((o) => o.id === orderB)!.status).toBe("escrow")
    expect(escrowCents(s)).toBe(35000) // only orderB remains in escrow
    expect(availableCents(s, "seller-maya")).toBe(35000) // released once, not twice
    expect(availableCents(s, "buyer-blake")).toBe(65000) // still locked in escrow
    expect(s.listings.find((l) => l.id === listingB)!.status).toBe("escrow")
  })
})
