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
