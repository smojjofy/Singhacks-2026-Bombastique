// Shared "prepare a Testnet payment proposal" logic. A proposal may only be
// created with a signed x402 oracle voucher — the paid MMA-pricing check — so
// pricing is provably from the oracle, never from an unverified client.
// Used by the agent's prepare_payment tool and the HTTP /api/prepare endpoint.

import { JsonStore, type TestnetOrder } from "../store"
import { verifyVoucher } from "../m2m/voucher"
import { SUPPORTED_TESTNET_PRODUCT } from "./valuation"

export interface PrepareArgs {
  productId: string
  condition: string
  ceilingDrops: number
  voucher: unknown
  voucherSecret: string
}

export interface PrepareResult {
  ok: boolean
  order?: TestnetOrder
  error?: string
}

export async function prepareOrder(
  store: JsonStore,
  buyerAddress: string,
  sellerAddress: string,
  args: PrepareArgs,
): Promise<PrepareResult> {
  const verdict = verifyVoucher(args.voucherSecret, args.voucher, Date.now())
  if (!verdict.ok) return { ok: false, error: `unverified pricing voucher: ${verdict.reason}` }
  const v = verdict.voucher

  if (v.productId !== args.productId || v.condition !== args.condition) {
    return { ok: false, error: "pricing voucher does not match the requested product/condition" }
  }
  if (args.productId !== SUPPORTED_TESTNET_PRODUCT) {
    return { ok: false, error: "Only the iPhone 13 (Good) fixture is enabled for real Testnet payments." }
  }
  if (!Number.isSafeInteger(args.ceilingDrops) || args.ceilingDrops <= 0) {
    return { ok: false, error: "invalid ceiling" }
  }
  if (args.ceilingDrops < v.minDrops || args.ceilingDrops > v.maxDrops) {
    return {
      ok: false,
      error: `ceiling is outside the accepted range (${v.minDrops}–${v.maxDrops} drops)`,
    }
  }
  if (args.ceilingDrops < v.askingDrops) {
    return { ok: false, error: "ceiling must cover the asking price" }
  }

  const order: TestnetOrder = {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    buyerAddress,
    sellerAddress,
    productId: v.productId,
    productTitle: "Apple iPhone 13 128GB",
    condition: v.condition,
    amountDrops: v.askingDrops,
    ceilingDrops: args.ceilingDrops,
    mmaDrops: v.mmaDrops,
    minDrops: v.minDrops,
    maxDrops: v.maxDrops,
    currency: "XRP",
    paymentStatus: "awaiting_authorization",
    oraclePaidHash: v.paidHash,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60_000,
    timeline: [
      { at: Date.now(), label: `Prepared with verified x402 pricing (oracle tx ${v.paidHash.slice(0, 12)}…)` },
      { at: Date.now(), label: "Awaiting authorization" },
    ],
  }
  await store.update((d) => {
    d.orders.push(order)
  })
  return { ok: true, order }
}
