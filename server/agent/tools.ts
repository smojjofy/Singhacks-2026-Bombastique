// Constrained agent tools. The agent can only look up, value (via the paid x402
// oracle), and prepare a proposal with a verified voucher. It can never sign,
// submit, or change recipient/amount/policy.

import { PRODUCTS } from "../../src/data/catalog"
import { prepareOrder } from "../payments/prepare"
import type { OracleVoucher } from "../m2m/voucher"
import type { ToolDef } from "./provider"
import type { Condition } from "../../src/domain/types"

export interface PricingLookup {
  mmaDrops: number
  minDrops: number
  maxDrops: number
  askingDrops: number
  paidHash: string
  voucher: OracleVoucher
}

export interface AgentContext {
  store: import("../store").JsonStore
  buyerAddress: string
  sellerAddress: string
  voucherSecret: string
  /** Paid pricing oracle (x402). Real in production; stubbed in tests. */
  obtainPricing: (productId: string, condition: string) => Promise<PricingLookup>
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
        "Get the test-XRP valuation (MMA and accepted range) for a product and condition through the PAID pricing oracle. Returns a signed voucher.",
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
        "Prepare a Testnet payment proposal for explicit human authorization. Pass the voucher returned by get_valuation when you have one (pricing must come from the paid oracle). Only the iPhone 13 (Good) fixture is enabled. Returns an order id the human must then authorize.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          condition: { type: "string" },
          ceiling_drops: { type: "integer" },
          voucher: {
            type: "object",
            description: "Optional voucher object from get_valuation; obtained and paid automatically if omitted.",
          },
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

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  switch (name) {
    case "lookup_product":
      return { ok: true, ...lookupProduct(String(args.query ?? "")) }

    case "get_valuation": {
      const productId = String(args.product_id ?? "")
      const condition = String(args.condition ?? "Good") as Condition
      try {
        const p = await ctx.obtainPricing(productId, condition)
        return {
          ok: true,
          supported: true,
          mma_drops: p.mmaDrops,
          min_drops: p.minDrops,
          max_drops: p.maxDrops,
          asking_drops: p.askingDrops,
          oracle_paid: true,
          paid_hash: p.paidHash,
          voucher: p.voucher,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "pricing oracle failed" }
      }
    }

    case "prepare_payment": {
      const productId = String(args.product_id ?? "")
      const condition = String(args.condition ?? "Good") as Condition
      const ceilingDrops = Number(args.ceiling_drops)
      try {
        let voucher = (args.voucher ?? undefined) as unknown
        if (!voucher || typeof voucher !== "object") {
          // No voucher presented: buy pricing from the oracle (pays the fee).
          const p = await ctx.obtainPricing(productId, condition)
          voucher = p.voucher
        }
        const result = await prepareOrder(ctx.store, ctx.buyerAddress, ctx.sellerAddress, {
          productId,
          condition,
          ceilingDrops,
          voucher,
          voucherSecret: ctx.voucherSecret,
        })
        if (!result.ok) return { ok: false, error: result.error ?? "prepare failed" }
        return {
          ok: true,
          orderId: result.order!.id,
          amount_drops: result.order!.amountDrops,
          currency: "XRP",
          needs_authorization: true,
          oracle_verified: true,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "prepare failed" }
      }
    }

    default:
      return { ok: false, error: `unknown tool ${name}` }
  }
}
