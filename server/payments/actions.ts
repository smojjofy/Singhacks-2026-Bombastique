import type { JsonStore, TestnetOrder } from "../store"
import { testnetValuation } from "./valuation"

export const unresolved = (o: TestnetOrder) => ["authorized", "submitting", "uncertain"].includes(o.paymentStatus)

export async function listOrders(store: JsonStore) {
  return store.update(data => {
    for (const o of data.orders) {
      if (o.paymentStatus === "awaiting_authorization" && (o.expiresAt ?? o.createdAt + 300_000) <= Date.now()) {
        o.paymentStatus = "expired"
        o.timeline.push({ at: Date.now(), label: "Authorization expired — no payment sent" })
      }
    }
    return data.orders
  })
}

export async function claimAuthorization(store: JsonStore, id: string, buyer: string, seller: string) {
  return store.update(data => {
    const o = data.orders.find(x => x.id === id)
    if (!o) throw new Error("Order not found")
    if (o.paymentStatus !== "awaiting_authorization") throw new Error(`Order is ${o.paymentStatus}`)
    if ((o.expiresAt ?? o.createdAt + 300_000) <= Date.now()) throw new Error("Authorization expired")
    if (o.buyerAddress !== buyer || o.sellerAddress !== seller || buyer === seller) throw new Error("Account mismatch")
    const v = testnetValuation(o.productId, o.condition as never)
    if (!v.supported || o.amountDrops !== v.askingDrops || !Number.isSafeInteger(o.ceilingDrops) ||
      o.ceilingDrops < Math.max(v.minDrops, v.askingDrops) || o.ceilingDrops > v.maxDrops || o.currency !== "XRP") {
      throw new Error("Proposal no longer satisfies payment policy")
    }
    if (data.orders.some(x => x.id !== id && x.buyerAddress === buyer && unresolved(x))) {
      throw new Error("Resolve the payer's pending transaction first")
    }
    o.paymentStatus = "authorized"
    o.maxFeeDrops = 1000
    o.authorizedAt = Date.now()
    o.timeline.push({ at: Date.now(), label: "Payer authorized direct Testnet payment" })
    return { ...o }
  })
}

export async function changeOrder(store: JsonStore, id: string, action: "decline" | "received", buyer: string) {
  return store.update(data => {
    const o = data.orders.find(x => x.id === id)
    if (!o || o.buyerAddress !== buyer) throw new Error("Order not found for this payer")
    if (action === "decline") {
      if (o.paymentStatus === "cancelled" || o.paymentStatus === "expired") return o
      if (o.paymentStatus !== "awaiting_authorization") throw new Error("Submitted payments cannot be cancelled")
      o.paymentStatus = "cancelled"
      o.timeline.push({ at: Date.now(), label: "Payer declined — no money moved" })
    } else {
      if (o.paymentStatus !== "validated") throw new Error("Payment must be validated before confirming receipt")
      if (!o.fulfilledAt) {
        o.fulfilledAt = Date.now()
        o.timeline.push({ at: Date.now(), label: "Item received (simulated handoff); no additional payment" })
      }
    }
    return o
  })
}
