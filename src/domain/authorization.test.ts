import { describe, expect, it } from "vitest"
import { buildBaseState } from "../data/seed"
import { reduce } from "./transitions"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import { availableCents, balancesReconcile, escrowCents } from "./balances"
import type { Command, DemoState } from "./types"

const NOW = new Date("2026-09-05T12:00:00Z").getTime()
const MIN = 60_000
const provider = new SimulatedPaymentProvider()
const run = (s: DemoState, cmd: Command, at = NOW) => reduce(s, cmd, at, provider)

const phoneListing = (s: DemoState) =>
  run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
const phoneListingId = (s: DemoState) => s.listings.find((l) => l.productId === "phone-iphone-13")!.id

const authorize = (s: DemoState, buyerId: string): DemoState => {
  const p = s.proposals.find((x) => x.buyerId === buyerId && x.status === "awaiting_authorization")!
  return run(s, { type: "authorizeProposal", actorId: buyerId, proposalId: p.id })
}

describe("authorization gate", () => {
  it("reservation moves no money and funds only on authorization", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    expect(s.proposals.length).toBe(1)
    expect(s.orders.length).toBe(0)
    expect(s.ledger.length).toBe(0)
    expect(availableCents(s, "buyer-alex")).toBe(100000)
    expect(escrowCents(s)).toBe(0)
    expect(s.listings.find((l) => l.id === id)!.status).toBe("reserved")
    expect(s.intents.find((i) => i.buyerId === "buyer-alex")!.status).toBe("reserved")

    s = authorize(s, "buyer-alex")
    expect(s.orders.length).toBe(1)
    expect(escrowCents(s)).toBe(35000)
    expect(availableCents(s, "buyer-alex")).toBe(65000)
  })

  it("authorize is idempotent (second authorize is a no-op)", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    const pid = s.proposals[0].id
    s = authorize(s, "buyer-alex")
    s = run(s, { type: "authorizeProposal", actorId: "buyer-alex", proposalId: pid })
    expect(s.orders.length).toBe(1)
    expect(s.ledger.filter((e) => e.kind === "fund").length).toBe(1)
  })

  it("decline releases the reservation and does not recreate the request", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    const pid = s.proposals[0].id
    s = run(s, { type: "declineProposal", actorId: "buyer-alex", proposalId: pid })
    expect(s.proposals.find((p) => p.id === pid)!.status).toBe("declined")
    expect(s.intents.find((i) => i.buyerId === "buyer-alex")!.status).toBe("cancelled")
    expect(s.listings.find((l) => l.id === id)!.status).toBe("live")
    expect(s.ledger.length).toBe(0)

    // A subsequent matching pass must not loop the cancelled request back in.
    const before = s.proposals.length
    s = run(s, { type: "markAllRead", actorId: "buyer-alex" })
    expect(s.proposals.length).toBe(before)
  })

  it("only one competing buyer reserves a single listing at a time", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    s = run(s, { type: "submitIntent", actorId: "buyer-blake", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    expect(s.proposals.length).toBe(1) // blake cannot reserve the reserved listing
    expect(s.intents.find((i) => i.buyerId === "buyer-blake")!.status).toBe("searching")

    // After alex declines, blake becomes the eligible buyer.
    s = run(s, { type: "declineProposal", actorId: "buyer-alex", proposalId: s.proposals[0].id })
    expect(s.proposals.find((p) => p.buyerId === "buyer-blake")?.status).toBe("awaiting_authorization")
  })

  it("expired proposal releases the reservation", () => {
    let s = phoneListing(buildBaseState(NOW))
    const id = phoneListingId(s)
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: id, ceilingCents: 38000 })
    s = run(s, { type: "markAllRead", actorId: "buyer-alex" }, NOW + 6 * MIN)
    expect(s.proposals[0].status).toBe("expired")
    expect(s.listings.find((l) => l.id === id)!.status).toBe("live")
    expect(s.intents.find((i) => i.buyerId === "buyer-alex")!.status).toBe("cancelled")
  })

  it("concurrent approvals cannot overspend (funds rechecked at authorize)", () => {
    let s = buildBaseState(NOW)
    s = { ...s, personas: s.personas.map((p) => (p.id === "buyer-alex" ? { ...p, initialFundsCents: 60000 } : p)) }
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const a = s.listings.find((l) => l.productId === "phone-iphone-13")!.id
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    const b = s.listings.find((l) => l.productId === "phone-iphone-13" && l.status === "live")!.id

    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    expect(s.proposals.length).toBe(1) // reserves listing a
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "need", productId: "phone-iphone-13", condition: "Good", ceilingCents: 38000 })
    expect(s.proposals.length).toBe(2) // reserves listing b

    s = authorize(s, "buyer-alex") // funds the first awaiting proposal (35000), available 25000
    expect(availableCents(s, "buyer-alex")).toBe(25000)
    expect(s.orders.length).toBe(1)
    s = authorize(s, "buyer-alex") // second proposal fails funds
    expect(s.orders.length).toBe(1)
    expect(s.intents.filter((i) => i.buyerId === "buyer-alex" && i.status === "funding_failed").length).toBe(1)
    expect(availableCents(s, "buyer-alex")).toBe(25000) // no overspend
    expect(balancesReconcile(s)).toBe(true)
    expect(s.listings.filter((l) => l.status === "escrow").length).toBe(1)
    expect(s.listings.filter((l) => l.status === "live").length).toBe(1) // the failed one is released
  })
})
