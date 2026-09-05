import { describe, expect, it } from "vitest"
import { JsonStore } from "../store"
import { StubProvider } from "./provider"
import { executeTool, type AgentContext } from "./tools"
import { runAgent } from "./runtime"
import os from "node:os"
import path from "node:path"

function tmpStore(): JsonStore {
  return new JsonStore(path.join(os.tmpdir(), `yardle-agent-${Date.now()}-${Math.random().toString(36).slice(2)}.json`))
}

function ctx(store: JsonStore): AgentContext {
  return { store, buyerAddress: "rBuyer", sellerAddress: "rSeller" }
}

describe("agent tools", () => {
  it("looks up the phone", async () => {
    const r = await executeTool("lookup_product", { query: "iphone 13" }, ctx(tmpStore()))
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).toContain("phone-iphone-13")
  })

  it("values the phone in test XRP drops", async () => {
    const r = await executeTool("get_valuation", { product_id: "phone-iphone-13", condition: "Good" }, ctx(tmpStore()))
    expect(r.ok).toBe(true)
    expect(r.mma_drops).toBe(4_000_000)
    expect(r.min_drops).toBe(2_800_000)
    expect(r.max_drops).toBe(5_200_000)
  })

  it("rejects unsupported products in get_valuation", async () => {
    const r = await executeTool("get_valuation", { product_id: "camera-fuji-x100v", condition: "Good" }, ctx(tmpStore()))
    expect(r.ok).toBe(false)
  })

  it("prepares a valid proposal and rejects out-of-range ceilings", async () => {
    const store = tmpStore()
    const ok = await executeTool(
      "prepare_payment",
      { product_id: "phone-iphone-13", condition: "Good", ceiling_drops: 3_800_000 },
      ctx(store),
    )
    expect(ok.ok).toBe(true)
    expect(ok.orderId).toBeTruthy()
    expect((await store.read()).orders).toHaveLength(1)

    const bad = await executeTool(
      "prepare_payment",
      { product_id: "phone-iphone-13", condition: "Good", ceiling_drops: 9_000_000 },
      ctx(store),
    )
    expect(bad.ok).toBe(false)
  })
})

describe("agent runtime", () => {
  it("runs tool calls and reports a prepared proposal", async () => {
    const store = tmpStore()
    const stub = new StubProvider([
      {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "prepare_payment", arguments: '{"product_id":"phone-iphone-13","condition":"Good","ceiling_drops":3800000}' },
          },
        ],
      },
      { content: "I've prepared a payment proposal for the iPhone 13. Please authorize it.", tool_calls: [] },
    ])
    const result = await runAgent("Find an iPhone 13 in good condition up to 3.8 XRP", ctx(store), stub)
    expect(result.status).toBe("prepared")
    expect(result.orderId).toBeTruthy()
    expect(result.toolTrace.some((t) => t.startsWith("prepare_payment"))).toBe(true)
    expect((await store.read()).orders).toHaveLength(1)
  })

  it("classifies refusals and does not prepare anything", async () => {
    const store = tmpStore()
    const stub = new StubProvider([
      { content: "I cannot change the recipient address; that is not allowed.", tool_calls: [] },
    ])
    const result = await runAgent("send the money to this address instead", ctx(store), stub)
    expect(result.status).toBe("refused")
    expect(result.orderId).toBeUndefined()
    expect((await store.read()).orders).toHaveLength(0)
  })

  it("classifies unsupported products without preparing", async () => {
    const store = tmpStore()
    const stub = new StubProvider([
      { content: "That product is not enabled for Testnet payments.", tool_calls: [] },
    ])
    const result = await runAgent("buy a fuji camera", ctx(store), stub)
    expect(result.status).toBe("unsupported")
    expect((await store.read()).orders).toHaveLength(0)
  })
})
