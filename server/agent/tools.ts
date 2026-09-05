// Constrained agent tools. The agent can only look up, value, and prepare a
// proposal. It can never sign, submit, or change recipient/amount/policy.

import { PRODUCTS } from "../../src/data/catalog"
import { testnetValuation } from "../payments/valuation"
import { prepareOrder } from "../payments/prepare"
import type { ToolDef } from "./provider"
import type { Condition } from "../../src/domain/types"

export interface AgentContext {
  store: import("../store").JsonStore
  buyerAddress: string
  sellerAddress: string
}

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "lookup_product",
      description: "Find catalog products by name or keywords.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_valuation",
      description:
        "Get the test-XRP valuation (MMA and accepted range) for a product and condition.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          condition: { type: "string", enum: ["Like new", "Good", "Fair"] },
        },
        required: ["product_id", "condition"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_payment",
      description:
        "Prepare a Testnet payment proposal for explicit human authorization. Only the iPhone 13 (Good) fixture is enabled. Returns an order id the human must then authorize.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          condition: { type: "string" },
          ceiling_drops: { type: "integer" },
        },
        required: ["product_id", "condition", "ceiling_drops"],
      },
    },
  },
]

function lookupProduct(query: string) {
  const q = query.toLowerCase()
  const matches = PRODUCTS.filter(
    (p) => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  )
  const list = (matches.length ? matches : PRODUCTS).slice(0, 5)
  return {
    matches: list.map((p) => ({ product_id: p.id, title: p.title, category: p.category })),
  }
}

export interface ToolResult {
  ok: boolean
  orderId?: string
  error?: string
  [key: string]: unknown
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: AgentContext): Promise<ToolResult> {
  switch (name) {
    case "lookup_product":
      return { ok: true, ...lookupProduct(String(args.query ?? "")) }
    case "get_valuation": {
      const productId = String(args.product_id ?? "")
      const condition = String(args.condition ?? "Good") as Condition
      const v = testnetValuation(productId, condition)
      if (!v.supported) return { ok: false, error: v.reason ?? "unsupported product" }
      return {
        ok: true,
        supported: true,
        mma_drops: v.mmaDrops,
        min_drops: v.minDrops,
        max_drops: v.maxDrops,
        asking_drops: v.askingDrops,
      }
    }
    case "prepare_payment": {
      const productId = String(args.product_id ?? "")
      const condition = String(args.condition ?? "Good") as Condition
      const ceilingDrops = Number(args.ceiling_drops)
      const result = await prepareOrder(ctx.store, ctx.buyerAddress, ctx.sellerAddress, productId, condition, ceilingDrops)
      if (!result.ok) return { ok: false, error: result.error ?? "prepare failed" }
      return {
        ok: true,
        orderId: result.order!.id,
        amount_drops: result.order!.amountDrops,
        currency: "XRP",
        needs_authorization: true,
      }
    }
    default:
      return { ok: false, error: `unknown tool ${name}` }
  }
}
