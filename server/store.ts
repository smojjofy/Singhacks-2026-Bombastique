// Durable server-owned store: validated JSON persisted with serialized writes and
// atomic file replacement. This is the authoritative Testnet state for the demo.

import { promises as fs } from "node:fs"
import path from "node:path"

export interface TestnetOrderTimeline {
  at: number
  label: string
}

export type PaymentStatus =
  | "awaiting_authorization"
  | "authorized"
  | "submitting"
  | "uncertain"
  | "expired"
  | "validated"
  | "payment_failed"
  | "cancelled"

export interface TestnetOrder {
  id: string
  buyerAddress: string
  sellerAddress: string
  productId: string
  productTitle: string
  condition: string
  amountDrops: number
  ceilingDrops: number
  mmaDrops: number
  minDrops: number
  maxDrops: number
  currency: "XRP"
  paymentStatus: PaymentStatus
  reason?: string
  txHash?: string
  txBlob?: string
  lastLedgerSequence?: number
  ledgerIndex?: number
  resultCode?: string
  explorerUrl?: string
  createdAt: number
  authorizedAt?: number
  expiresAt?: number
  maxFeeDrops?: number
  feeDrops?: string
  fulfilledAt?: number
  agentRequest?: string
  agentTrace?: string[]
  timeline: TestnetOrderTimeline[]
}

export interface StoreData {
  version: number
  orders: TestnetOrder[]
}

const STORE_VERSION = 1

function isOrder(v: unknown): v is TestnetOrder {
  if (!v || typeof v !== "object") return false
  const o = v as TestnetOrder
  return (
    typeof o.id === "string" &&
    typeof o.buyerAddress === "string" &&
    typeof o.sellerAddress === "string" &&
    typeof o.productId === "string" &&
    typeof o.currency === "string" &&
    typeof o.paymentStatus === "string" &&
    Array.isArray(o.timeline)
  )
}

export function isValidStoreData(v: unknown): v is StoreData {
  if (!v || typeof v !== "object") return false
  const d = v as StoreData
  return d.version === STORE_VERSION && Array.isArray(d.orders) && d.orders.every(isOrder)
}

export class JsonStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn)
    this.queue = run.catch(() => {})
    return run
  }

  async read(): Promise<StoreData> {
    return this.enqueue(() => this.readUnsafe())
  }

  async write(data: StoreData): Promise<void> {
    return this.enqueue(async () => {
      const dir = path.dirname(this.filePath)
      await fs.mkdir(dir, { recursive: true })
      const tmp = this.filePath + ".tmp"
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8")
      await fs.rename(tmp, this.filePath)
    })
  }

  /** Read-modify-write as one serialized transaction. */
  async update<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const result = await fn(data)
      await this.writeUnsafe(data)
      return result
    })
  }

  private async readUnsafe(): Promise<StoreData> {
    const invalid = () => new Error("Invalid Testnet state. Preserve the file and restore it before sending payments.")
    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw invalid()
      }
      if (isValidStoreData(parsed)) return parsed
      throw invalid()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    return { version: STORE_VERSION, orders: [] }
  }

  private async writeUnsafe(data: StoreData): Promise<void> {
    const dir = path.dirname(this.filePath)
    await fs.mkdir(dir, { recursive: true })
    const tmp = this.filePath + ".tmp"
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8")
    await fs.rename(tmp, this.filePath)
  }
}
