// One-time setup: create two fresh Testnet-only accounts, fund them via the
// faucet, and append the secrets to a gitignored `.env.local`. Outputs only
// public addresses + readiness, never the secrets.

import { Client, Wallet } from "xrpl"
import { promises as fs } from "node:fs"
import { loadEnv, resolveEndpoint } from "../server/config"

loadEnv()
const endpoint = resolveEndpoint()
const client = new Client(endpoint)

console.log(`Connecting to ${endpoint} ...`)
await client.connect()
console.log("Connected. Creating + funding test accounts (faucet) ...")

const buyer = Wallet.generate()
const seller = Wallet.generate()
const fee = Wallet.generate() // receives x402/MPP micro-charges
const buyerFunded = await client.fundWallet(buyer)
const sellerFunded = await client.fundWallet(seller)
const feeFunded = await client.fundWallet(fee)

const lines = [
  `XRPL_TESTNET_ENDPOINT=${endpoint}`,
  `XRPL_TESTNET_BUYER_ADDRESS=${buyer.address}`,
  `XRPL_TESTNET_BUYER_SECRET=${buyer.seed}`,
  `XRPL_TESTNET_SELLER_ADDRESS=${seller.address}`,
  `XRPL_TESTNET_FEE_ADDRESS=${fee.address}`,
  "",
]
await fs.appendFile(".env.local", lines.join("\n") + "\n")

console.log("--- readiness (public info only) ---")
console.log(`buyer address:  ${buyer.address}  funded ${buyerFunded.balance} XRP`)
console.log(`seller address: ${seller.address}  funded ${sellerFunded.balance} XRP`)
console.log(`fee vault:      ${fee.address}  funded ${feeFunded.balance} XRP`)
console.log("Wrote credentials to .env.local (gitignored).")
console.log("Do NOT print or commit these secrets.")

await client.disconnect()
