// Server configuration. Credentials come only from local environment files,
// never from VITE_ variables or committed files.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import crypto from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

export function loadEnv(): void {
  // .env is gitignored; .env.example documents the shape. Node's loadEnvFile
  // does not overwrite already-set variables.
  for (const name of [".env", ".env.local"]) {
    try {
      process.loadEnvFile(path.join(repoRoot, name))
    } catch {
      /* missing file is fine */
    }
  }
  // The user's Agnes configuration is a server-only file named `env`.
  // Parse it without exporting its legacy VITE_* names to any client process.
  try {
    const agnes = parseEnv(readFileSync(path.join(repoRoot, "env"), "utf8"))
    for (const [target, legacy] of Object.entries({
      MODEL_BASE_URL: "VITE_AGNES_BASE_URL",
      MODEL_API_KEY: "VITE_AGNES_API_KEY",
      MODEL_NAME: "VITE_AGNES_MODEL",
    })) {
      if (!process.env[target]) process.env[target] = agnes[target] || agnes[legacy] || ""
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

/** Loopback-only, so the local API can never be reached from the network. */
export const SERVER_HOST = process.env.SERVER_HOST ?? "127.0.0.1"
export const SERVER_PORT = Number(process.env.SERVER_PORT ?? 4782)

/** Only these public Testnet endpoints may ever be used. Mainnet is refused. */
export const TESTNET_ENDPOINTS = [
  "wss://s.altnet.rippletest.net:51233",
]

export function resolveEndpoint(): string {
  const endpoint = process.env.XRPL_TESTNET_ENDPOINT ?? TESTNET_ENDPOINTS[0]
  if (!TESTNET_ENDPOINTS.includes(endpoint)) {
    throw new Error(
      `Refusing to connect to non-Testnet endpoint "${endpoint}". ` +
        `Allowed: ${TESTNET_ENDPOINTS.join(", ")}. Accidental Mainnet operation is prevented.`,
    )
  }
  return endpoint
}

export interface ServerConfig {
  host: string
  port: number
  endpoint: string
  buyerAddress: string
  buyerSecret: string
  sellerAddress: string
  /** Receiver of x402/MPP micro-charges (the Yardle fee vault). */
  feeAddress: string
  /** Secret used to sign oracle vouchers (HMAC). Random per boot unless set. */
  voucherSecret: string
  modelApiKey?: string
  modelBaseUrl?: string
  modelName?: string
}

export function readConfig(): ServerConfig {
  const endpoint = resolveEndpoint()
  const buyerSecret = process.env.XRPL_TESTNET_BUYER_SECRET ?? ""
  const sellerAddress = process.env.XRPL_TESTNET_SELLER_ADDRESS ?? ""
  const buyerAddress = process.env.XRPL_TESTNET_BUYER_ADDRESS ?? ""
  const feeAddress = process.env.XRPL_TESTNET_FEE_ADDRESS ?? ""
  const host = process.env.SERVER_HOST || "127.0.0.1"
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("Server must bind to loopback")
  return {
    host,
    port: Number(process.env.SERVER_PORT || 4782),
    endpoint,
    buyerSecret,
    buyerAddress,
    sellerAddress,
    feeAddress,
    voucherSecret: process.env.VOUCHER_SECRET ?? crypto.randomBytes(32).toString("hex"),
    modelApiKey: process.env.MODEL_API_KEY,
    modelBaseUrl: process.env.MODEL_BASE_URL,
    modelName: process.env.MODEL_NAME,
  }
}

/** Readiness without secrets. */
export function readiness(config: ServerConfig): {
  accounts: boolean
  fee: boolean
  model: boolean
  endpoint: string
} {
  return {
    accounts: Boolean(config.buyerSecret && config.buyerAddress && config.sellerAddress),
    fee: Boolean(config.feeAddress),
    model: Boolean(config.modelApiKey),
    endpoint: config.endpoint,
  }
}
