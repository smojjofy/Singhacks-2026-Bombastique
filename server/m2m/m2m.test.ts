import { describe, expect, it } from "vitest"
import { VelocityTracker } from "../../src/domain/velocity"
import { signVoucher, verifyVoucher } from "./voucher"
import { MppMeter } from "./meter"
import { obtainPricing } from "./oracle"
import { METER_FEE_DROPS, ORACLE_FEE_DROPS } from "./fees"

const SECRET = "unit-test-secret"
const W = 60_000

describe("VelocityTracker", () => {
  it("counts only hits inside the sliding window", () => {
    const t = new VelocityTracker(W, 5)
    t.record("a", 1000)
    t.record("a", 2000)
    t.record("a", 10_000)
    expect(t.count("a", 61_000)).toBe(2) // only 2000 and 10000 are inside (now - 60s, now]
    expect(t.count("a", 69_000)).toBe(1) // only the 10_000 hit remains
  })

  it("exposes the free allowance and resets", () => {
    const t = new VelocityTracker(W, 2)
    expect(t.isWithinFreeTier("a", 0)).toBe(true)
    t.record("a", 0)
    t.record("a", 1)
    expect(t.isWithinFreeTier("a", 2)).toBe(false)
    expect(t.remaining("a", 2)).toBe(0)
    t.reset("a")
    expect(t.isWithinFreeTier("a", 3)).toBe(true)
  })
})

describe("oracle voucher", () => {
  const payload = {
    productId: "phone-iphone-13",
    condition: "Good",
    mmaDrops: 4_000_000,
    minDrops: 2_800_000,
    maxDrops: 5_200_000,
    askingDrops: 3_500_000,
    issuedAt: 1_000,
    exp: 1_000 + 600_000,
    paidHash: "ab".repeat(32),
  }

  it("signs and verifies", () => {
    const v = signVoucher(SECRET, payload)
    expect(verifyVoucher(SECRET, v, 10_000).ok).toBe(true)
  })

  it("rejects tampering", () => {
    const v = signVoucher(SECRET, payload)
    const bad = verifyVoucher(SECRET, { ...v, mmaDrops: 9_999 }, 10_000)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain("signature")
  })

  it("rejects expired vouchers", () => {
    const v = signVoucher(SECRET, payload)
    const bad = verifyVoucher(SECRET, v, payload.exp + 1)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain("expired")
  })
})

describe("MppMeter", () => {
  function makeMeter() {
    const charges: Array<{ amount: number; memo: string }> = []
    const meter = new MppMeter(
      { client: {} as never, wallet: { address: "rBuyer" } as never, feeAddress: "rFee" },
      async (_c, _w, _f, amountDrops, memo) => {
        charges.push({ amount: amountDrops, memo })
        return { hash: `hash-${charges.length}`, amountDrops, receiver: "rFee" }
      },
    )
    return { meter, charges }
  }

  it("allows the free allowance without charging", async () => {
    const { meter, charges } = makeMeter()
    const now = 1_000_000
    for (let i = 0; i < 5; i++) {
      const out = await meter.guard("rBuyer", "prepare", now + i)
      expect(out.free).toBe(true)
    }
    expect(charges).toHaveLength(0)
    expect(meter.snapshot("rBuyer", now + 4).freeRemaining).toBe(0)
  })

  it("charges a real overage micro-payment once the free tier is exhausted", async () => {
    const { meter, charges } = makeMeter()
    const now = 2_000_000
    for (let i = 0; i < 5; i++) await meter.guard("rBuyer", "prepare", now + i)
    const over = await meter.guard("rBuyer", "prepare", now + 5)
    expect(over.free).toBe(false)
    expect(over.overage?.feeDrops).toBe(METER_FEE_DROPS)
    expect(charges).toHaveLength(1)
    expect(charges[0].amount).toBe(METER_FEE_DROPS)
    expect(charges[0].memo).toContain("meter:prepare:rBuyer")
  })
})

describe("x402 pricing oracle", () => {
  const deps = {
    client: {} as never,
    payerWallet: { address: "rBuyer" } as never,
    feeAddress: "rFee",
    voucherSecret: SECRET,
    payMicro: async (memo: string) => ({ hash: `paid-${memo}`, amountDrops: ORACLE_FEE_DROPS, receiver: "rFee" }),
    verifyMicro: async () => true,
  }

  it("pays the fee, verifies, and returns a signed voucher", async () => {
    const p = await obtainPricing(deps, "phone-iphone-13", "Good", 5_000)
    expect(p.mmaDrops).toBe(4_000_000)
    expect(p.minDrops).toBe(2_800_000)
    expect(p.maxDrops).toBe(5_200_000)
    expect(p.askingDrops).toBe(3_500_000)
    expect(p.paidHash.startsWith("paid-")).toBe(true) // challengeId is appended after "paid-"
    expect(verifyVoucher(SECRET, p.voucher, 5_000).ok).toBe(true)
    expect(p.voucher.paidHash).toBe(p.paidHash)
  })

  it("throws for unsupported products", async () => {
    await expect(obtainPricing(deps, "camera-fuji-x100v", "Good", 5_000)).rejects.toThrow(/enabled/i)
  })

  it("supports an externally paid, pre-verified proof (skipPayment)", async () => {
    let paid = false
    const deps2 = { ...deps, payMicro: async () => { paid = true; return { hash: "x", amountDrops: 0, receiver: "" } } }
    const p = await obtainPricing(deps2, "phone-iphone-13", "Good", 5_000, { skipPayment: true, paidHash: "ext-hash" })
    expect(paid).toBe(false)
    expect(p.voucher.paidHash).toBe("ext-hash")
  })
})
