// Shared "prepare a Testnet payment proposal" logic. Used by both the HTTP
// /api/prepare endpoint and the agent's prepare_payment tool, so validation is
// never duplicated or bypassed.

import { JsonStore, type TestnetOrder } from "../store"
import { SUPPORTED_TESTNET_PRODUCT, testnetValuation } from "./valuation"
import type { Condition } from "../../src/domain/types"

export interface PrepareResult {
  ok: boolean
  order?: TestnetOrder
  error?: string
}

export async function prepareOrder(
  store: JsonStore,
  buyerAddress: string,
  sellerAddress: string,
  productId: string,
  condition: Condition,
  ceilingDrops: number,
): Promise<PrepareResult> {
  const valuation = testnetValuation(productId, condition)
  if (!valuation.supported) {
    return { ok: false, error: valuation.reason ?? "unsupported product" }
  }
  if (!Number.isSafeInteger(ceilingDrops) || ceilingDrops <= 0) {
    return { ok: false, error: "invalid ceiling" }
  }
  if (ceilingDrops < valuation.minDrops || ceilingDrops > valuation.maxDrops) {
    return {
      ok: false,
      error: `ceiling is outside the accepted range (${valuation.minDrops}–${valuation.maxDrops} drops)`,
    }
  }
  if (ceilingDrops < valuation.askingDrops) {
    return { ok: false, error: "ceiling must cover the asking price" }
  }
  const order: TestnetOrder = {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    buyerAddress,
    sellerAddress,
    productId: SUPPORTED_TESTNET_PRODUCT,
    productTitle: "Apple iPhone 13 128GB",
    condition,
    amountDrops: valuation.askingDrops,
    ceilingDrops,
    mmaDrops: valuation.mmaDrops,
    minDrops: valuation.minDrops,
    maxDrops: valuation.maxDrops,
    currency: "XRP",
    paymentStatus: "awaiting_authorization",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60_000,
    maxFeeDrops: 1000,
    timeline: [{ at: Date.now(), label: "Prepared — awaiting authorization" }],
  }
  const pending = await store.update((d) => {
    for (const existing of d.orders) {
      if (existing.paymentStatus === "awaiting_authorization" && (existing.expiresAt ?? existing.createdAt + 300_000) <= Date.now()) {
        existing.paymentStatus = "expired"
      }
    }
    const existing = d.orders.find(o => o.buyerAddress === buyerAddress &&
      ["awaiting_authorization", "authorized", "submitting", "uncertain"].includes(o.paymentStatus))
    if (existing) return existing.id
    d.orders.push(order)
    return null
  })
  if (pending) return { ok: false, error: `An existing proposal or payment (${pending}) must be resolved first.` }
  return { ok: true, order }
}
