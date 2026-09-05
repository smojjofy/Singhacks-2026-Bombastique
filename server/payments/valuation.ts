// Server-side valuation for the Testnet path. Recomputed here, never trusted
// from a client snapshot. Only the main phone fixture is enabled for real
// payments; other products are clearly unsupported.

import { buildBaseState } from "../../src/data/seed"
import { computeSnapshot } from "../../src/domain/valuation"
import { centsToDrops } from "../../src/domain/testPrices"
import type { Condition } from "../../src/domain/types"

export const SUPPORTED_TESTNET_PRODUCT = "phone-iphone-13"
export const SUPPORTED_TESTNET_CONDITION: Condition = "Good"

export interface TestnetValuation {
  supported: boolean
  reason?: string
  mmaDrops: number
  minDrops: number
  maxDrops: number
  askingDrops: number
}

export function testnetValuation(productId: string, condition: Condition): TestnetValuation {
  if (productId !== SUPPORTED_TESTNET_PRODUCT || condition !== SUPPORTED_TESTNET_CONDITION) {
    return {
      supported: false,
      reason: "Only the iPhone 13 (Good) fixture is enabled for real Testnet payments.",
      mmaDrops: 0,
      minDrops: 0,
      maxDrops: 0,
      askingDrops: 0,
    }
  }
  const { sales } = buildBaseState(Date.now())
  const snap = computeSnapshot(productId, condition, sales)
  return {
    supported: true,
    mmaDrops: centsToDrops(snap.adjustedMmaCents),
    minDrops: centsToDrops(snap.minCents),
    maxDrops: centsToDrops(snap.maxCents),
    // Seller asks 3.5 XRP for the demo fixture.
    askingDrops: centsToDrops(35_000),
  }
}
