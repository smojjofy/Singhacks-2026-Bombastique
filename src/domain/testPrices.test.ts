import { describe, expect, it } from "vitest"
import {
  DROPS_PER_XRP,
  TESTNET_MAIN_PHONE_ASKING_DROPS,
  TESTNET_MAIN_PHONE_CEILING_DROPS,
  TESTNET_MAIN_PHONE_MMA_DROPS,
  centsToDrops,
} from "./testPrices"

describe("test-price denomination", () => {
  it("maps cents to drops by ×100 (a fixture, not an exchange rate)", () => {
    expect(centsToDrops(40000)).toBe(4_000_000)
    expect(centsToDrops(35000)).toBe(3_500_000)
    expect(centsToDrops(28000)).toBe(2_800_000)
  })

  it("exposes the main phone fixture (MMA 4 XRP, ask 3.5, ceiling 3.8)", () => {
    expect(TESTNET_MAIN_PHONE_MMA_DROPS).toBe(4_000_000)
    expect(TESTNET_MAIN_PHONE_ASKING_DROPS).toBe(3_500_000)
    expect(TESTNET_MAIN_PHONE_CEILING_DROPS).toBe(3_800_000)
    expect(TESTNET_MAIN_PHONE_MMA_DROPS / DROPS_PER_XRP).toBe(4)
  })
})
