import { describe, expect, it } from "vitest"
import { buildSeedState } from "../data/seed"
import { reduce } from "./transitions"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import { availableCents, balancesReconcile, escrowCents, incomingPendingCents } from "./balances"
import { computeSnapshot } from "./valuation"
import type { DemoState } from "./types"

const NOW = new Date("2026-09-05T12:00:00Z").getTime()
const provider = new SimulatedPaymentProvider()
const run = (s: DemoState, cmd: Parameters<typeof reduce>[1], at = NOW) => reduce(s, cmd, at, provider)

describe("presentation walkthrough (PLANNING.md §7)", () => {
  it("runs the main scenario end to end with reconciled balances", () => {
    let s = buildSeedState(NOW)

    // Step 2: seller selects the Good-condition phone; MMA 400, interval 280-520.
    const snap = computeSnapshot("phone-iphone-13", "Good", s.sales)
    expect(snap.adjustedMmaCents).toBe(40000)
    expect(snap.minCents).toBe(28000)
    expect(snap.maxCents).toBe(52000)

    // Step 3: submit 200 -> rejected below; submit 550 -> rejected above.
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 20000 })
    let phone = s.listings.find((l) => l.productId === "phone-iphone-13")!
    expect(phone.status).toBe("rejected")
    expect(phone.reason).toContain("below")
    expect(s.listings.some((l) => l.productId === "phone-iphone-13" && l.status === "live")).toBe(false)

    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 55000 })
    expect(s.listings.find((l) => l.productId === "phone-iphone-13")!.reason).toContain("above")

    // Step 4: correct to 350 -> auto-published.
    s = run(s, { type: "createListing", actorId: "seller-maya", productId: "phone-iphone-13", condition: "Good", amountCents: 35000 })
    phone = s.listings.find((l) => l.productId === "phone-iphone-13" && l.status === "live")!
    expect(phone.amountCents).toBe(35000)

    // Step 5: Buyer A out-of-range offer -> rejected, wallet unchanged.
    const alexBefore = availableCents(s, "buyer-alex")
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: phone.id, ceilingCents: 20000 })
    const rejected = s.intents.find((i) => i.buyerId === "buyer-alex" && i.targetListingId === phone.id)!
    expect(rejected.status).toBe("rejected")
    expect(availableCents(s, "buyer-alex")).toBe(alexBefore)

    // Step 6: correct to 380 via I Want -> prepared proposal; buyer authorizes -> funded.
    s = run(s, { type: "submitIntent", actorId: "buyer-alex", source: "want", productId: "phone-iphone-13", condition: "Good", targetListingId: phone.id, ceilingCents: 38000 })
    const proposal = s.proposals.find((p) => p.listingId === phone.id)!
    expect(proposal.amountCents).toBe(35000)
    expect(availableCents(s, "buyer-alex")).toBe(alexBefore) // no money moved before authorization
    s = run(s, { type: "authorizeProposal", actorId: "buyer-alex", proposalId: proposal.id })
    const order = s.orders.find((o) => o.listingId === phone.id)!
    expect(order.amountCents).toBe(35000)
    expect(availableCents(s, "buyer-alex")).toBe(alexBefore - 35000)
    expect(escrowCents(s)).toBe(35000)
    expect(incomingPendingCents(s, "seller-maya")).toBe(35000)
    expect(s.listings.find((l) => l.id === phone.id)!.status).toBe("escrow")

    // Step 7: confirm receipt -> escrow released, listing sold, shared timeline.
    s = run(s, { type: "confirmReceipt", actorId: "buyer-alex", orderId: order.id })
    expect(escrowCents(s)).toBe(0)
    expect(availableCents(s, "seller-maya")).toBe(35000)
    expect(s.listings.find((l) => l.id === phone.id)!.status).toBe("sold")
    expect(s.orders.find((o) => o.id === order.id)!.status).toBe("complete")
    expect(balancesReconcile(s)).toBe(true)
  })
})
