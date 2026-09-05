import { describe, expect, it } from "vitest"
import { JsonStore, type TestnetOrder } from "./store"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

function tmpDir(): string {
  return path.join(os.tmpdir(), `yardle-store-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function order(id: string): TestnetOrder {
  return {
    id,
    buyerAddress: "rBuyer",
    sellerAddress: "rSeller",
    productId: "phone-iphone-13",
    productTitle: "Apple iPhone 13 128GB",
    condition: "Good",
    amountDrops: 3_500_000,
    ceilingDrops: 3_800_000,
    mmaDrops: 4_000_000,
    minDrops: 2_800_000,
    maxDrops: 5_200_000,
    currency: "XRP",
    paymentStatus: "awaiting_authorization",
    createdAt: 1,
    timeline: [],
  }
}

describe("JsonStore", () => {
  it("round-trips orders", async () => {
    const file = path.join(tmpDir(), "state.json")
    const store = new JsonStore(file)
    await store.write({ version: 1, orders: [] })
    await store.update((d) => {
      d.orders.push(order("o1"))
    })
    const read = await store.read()
    expect(read.orders).toHaveLength(1)
    expect(read.orders[0].id).toBe("o1")
  })

  it("returns an empty store when no file exists yet", async () => {
    const store = new JsonStore(path.join(tmpDir(), "missing.json"))
    const read = await store.read()
    expect(read.version).toBe(1)
    expect(read.orders).toEqual([])
  })

  it("throws on an unparseable or invalid file instead of silently wiping state", async () => {
    const dir = tmpDir()
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, "state.json")
    await fs.writeFile(file, "{ not valid", "utf8")
    const store = new JsonStore(file)
    await expect(store.read()).rejects.toThrow(/Invalid Testnet state/)
  })

  it("serializes concurrent updates without losing writes", async () => {
    const file = path.join(tmpDir(), "state.json")
    const store = new JsonStore(file)
    await store.write({ version: 1, orders: [] })
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.update((d) => d.orders.push(order(`o${i}`)))),
    )
    const read = await store.read()
    expect(read.orders).toHaveLength(20)
  })
})
