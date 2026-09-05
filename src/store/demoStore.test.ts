import { beforeEach, describe, expect, it } from "vitest"
import { createDemoStore } from "./demoStore"
import { buildSeedState } from "../data/seed"

const KEY = "yardle.demo.state.v1"
const NOW = new Date("2026-09-05T12:00:00Z").getTime()

class MemoryStorage {
  store = new Map<string, string>()
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v)
  }
  removeItem(k: string): void {
    this.store.delete(k)
  }
  clear(): void {
    this.store.clear()
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage
})

describe("demoStore persistence", () => {
  it("builds a fresh seed when storage is empty", () => {
    const store = createDemoStore(NOW)
    const snap = store.getSnapshot()
    expect(snap.corrupt).toBe(false)
    expect(snap.state.currentPersonaId).toBe("seller-maya")
  })

  it("persists commands and reloads them", () => {
    const a = createDemoStore(NOW)
    a.dispatch({ type: "selectPersona", personaId: "buyer-alex" })
    const b = createDemoStore(NOW)
    expect(b.getSnapshot().state.currentPersonaId).toBe("buyer-alex")
  })

  it("recovers from unparseable storage with a corrupt flag", () => {
    storage.setItem(KEY, "{ not valid json")
    const store = createDemoStore(NOW)
    expect(store.getSnapshot().corrupt).toBe(true)
  })

  it("recovers from an incompatible version", () => {
    storage.setItem(KEY, JSON.stringify({ ...buildSeedState(NOW), version: 999 }))
    expect(createDemoStore(NOW).getSnapshot().corrupt).toBe(true)
  })

  it("recovers from empty personas", () => {
    storage.setItem(KEY, JSON.stringify({ ...buildSeedState(NOW), personas: [] }))
    expect(createDemoStore(NOW).getSnapshot().corrupt).toBe(true)
  })

  it("recovers from a null entity without crashing", () => {
    const s = buildSeedState(NOW)
    const bad = { ...s, intents: [null] }
    storage.setItem(KEY, JSON.stringify(bad))
    expect(createDemoStore(NOW).getSnapshot().corrupt).toBe(true)
  })

  it("recovers from a broken order relationship", () => {
    const s = buildSeedState(NOW)
    const bad = {
      ...s,
      orders: [
        {
          ...s.orders[0],
          listingId: "does-not-exist",
        },
      ],
    }
    storage.setItem(KEY, JSON.stringify(bad))
    expect(createDemoStore(NOW).getSnapshot().corrupt).toBe(true)
  })

  it("surfaces persistence failures without claiming success", () => {
    const store = createDemoStore(NOW)
    storage.setItem = () => {
      throw new Error("QuotaExceededError")
    }
    store.dispatch({ type: "selectPersona", personaId: "buyer-alex" })
    const snap = store.getSnapshot()
    expect(snap.persistError).toBe(true)
    expect(snap.state.currentPersonaId).toBe("buyer-alex") // in-memory still applied
  })

  it("reset restores the seed and clears corruption", () => {
    storage.setItem(KEY, "garbage")
    const store = createDemoStore(NOW)
    expect(store.getSnapshot().corrupt).toBe(true)
    store.reset()
    const snap = store.getSnapshot()
    expect(snap.corrupt).toBe(false)
    expect(snap.state.currentPersonaId).toBe("seller-maya")
  })

  it("seeded state round-trips through validation (no false corruption)", () => {
    const a = createDemoStore(NOW)
    a.reset()
    const b = createDemoStore(NOW)
    expect(b.getSnapshot().corrupt).toBe(false)
    expect(b.getSnapshot().state.listings.length).toBeGreaterThan(0)
  })
})

describe("demoStore anti-bot velocity meter (simulation free tier)", () => {
  const ids = ["phone-pixel-9", "vacuum-dyson", "phone-galaxy-s23", "scooter-xiaomi", "headphones-sony-xm5", "console-switch"]

  it("blocks guarded submissions after the free allowance and clears on dismiss", () => {
    let fakeNow = NOW
    const store = createDemoStore(NOW, () => fakeNow)
    // Guarded submissions are validated later by the reducer; velocity counts first.
    for (let i = 0; i < 5; i++) {
      store.dispatch({ type: "createListing", actorId: "seller-maya", productId: ids[i % ids.length], condition: "Good", amountCents: 40_000 })
    }
    expect(store.getSnapshot().meterNotice).toBeNull()

    // 6th guarded submission within the window is blocked.
    const before = store.getSnapshot().state.listings.length
    store.dispatch({ type: "createListing", actorId: "seller-maya", productId: "vacuum-dyson", condition: "Fair", amountCents: 30_000 })
    const snap = store.getSnapshot()
    expect(snap.meterNotice).not.toBeNull()
    expect(snap.meterNotice?.actorId).toBe("seller-maya")
    expect(snap.state.listings.length).toBe(before) // no state change

    // Non-guarded dispatch clears the stale notice.
    store.dispatch({ type: "selectPersona", personaId: "buyer-alex" })
    expect(store.getSnapshot().meterNotice).toBeNull()
  })

  it("lets a persona through again once the window has elapsed", () => {
    let fakeNow = NOW
    const store = createDemoStore(NOW, () => fakeNow)
    for (let i = 0; i < 5; i++) {
      store.dispatch({ type: "createListing", actorId: "seller-maya", productId: ids[i], condition: "Good", amountCents: 40_000 })
    }
    store.dispatch({ type: "createListing", actorId: "seller-maya", productId: "vacuum-dyson", condition: "Fair", amountCents: 30_000 })
    expect(store.getSnapshot().meterNotice).not.toBeNull()

    fakeNow += 61_000
    store.dispatch({ type: "createListing", actorId: "seller-maya", productId: "vacuum-dyson", condition: "Fair", amountCents: 30_000 })
    expect(store.getSnapshot().meterNotice).toBeNull()
  })

  it("meters each persona independently", () => {
    let fakeNow = NOW
    const store = createDemoStore(NOW, () => fakeNow)
    for (let i = 0; i < 5; i++) {
      store.dispatch({ type: "createListing", actorId: "seller-maya", productId: ids[i], condition: "Good", amountCents: 40_000 })
    }
    // buyer-lee is a different actor and still has a free allowance.
    store.dispatch({ type: "submitIntent", actorId: "buyer-lee", source: "need", productId: "vacuum-dyson", condition: "Good", ceilingCents: 40_000 })
    expect(store.getSnapshot().meterNotice).toBeNull()
  })
})
