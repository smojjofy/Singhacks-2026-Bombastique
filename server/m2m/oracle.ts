// Paid MMA-pricing oracle (x402-shaped). A caller asks for pricing, receives a
// 402 payment instruction, pays a small fee to the fee vault, and only then
// receives the pricing plus a signed voucher. The demo payer is the configured
// buyer account (server-held test signer); the agent is the paying machine.

import crypto from "node:crypto"
import { Client, Wallet } from "xrpl"
import { testnetValuation } from "../payments/valuation"
import { ORACLE_FEE_DROPS, VOUCHER_TTL_MS } from "./fees"
import { payMicroFee, type MicroPayment } from "./payer"
import { signVoucher, type OracleVoucher } from "./voucher"

export interface OracleDeps {
  client: Client
  payerWallet: Wallet
  feeAddress: string
  voucherSecret: string
  /** Injectable payer (tests use a fake; default = real Testnet micro-payment). */
  payMicro?: (memo: string) => Promise<MicroPayment>
  /** Injectable verifier (tests use a fake; default = on-ledger tx check). */
  verifyMicro?: (proof: MicroPaymentProof) => Promise<boolean>
}

export interface MicroPaymentProof {
  hash: string
  payer: string
  receiver: string
  amountDrops: number
  challengeId: string
}

/** On-ledger verification that the payer really paid feeDrops with the memo. */
export async function verifyMicroPaymentByHash(
  client: Client,
  proof: MicroPaymentProof,
): Promise<boolean> {
  try {
    const res = await client.request({ command: "tx", transaction: proof.hash })
    const tx = res.result
    interface LedgerTxView {
      TransactionType?: unknown
      Account?: unknown
      Destination?: unknown
      Amount?: unknown
      Memos?: Array<{ Memo?: { MemoData?: string } }>
      DeliverMax?: unknown
    }
    // xrpl v5 exposes the transaction under tx_json on tx responses, and
    // rippled 3.x records XRP Payment amounts as DeliverMax (not Amount).
    const raw = (tx as unknown as { tx_json?: LedgerTxView }).tx_json ?? (tx as unknown as LedgerTxView)
    if (!tx.validated || raw.TransactionType !== "Payment") return false
    if (raw.Account !== proof.payer || raw.Destination !== proof.receiver) return false
    if (String(raw.Amount ?? raw.DeliverMax) !== String(proof.amountDrops)) return false
    const memos = raw.Memos
    if (!Array.isArray(memos)) return false
    const data = memos
      .map((m) => m?.Memo?.MemoData)
      .filter((x): x is string => typeof x === "string")
      .map((hex) => Buffer.from(hex, "hex").toString("utf8"))
    return data.includes(proof.challengeId)
  } catch {
    return false
  }
}

export interface PricingResult {
  productId: string
  condition: string
  source: string
  mmaDrops: number
  minDrops: number
  maxDrops: number
  askingDrops: number
  paidHash: string
  voucher: OracleVoucher
}

export async function obtainPricing(
  deps: OracleDeps,
  productId: string,
  condition: string,
  now = Date.now(),
  opts: { skipPayment?: boolean; paidHash?: string } = {},
): Promise<PricingResult> {
  const valuation = testnetValuation(productId, condition as never)
  if (!valuation.supported) {
    throw new Error(valuation.reason ?? "unsupported product for paid pricing")
  }
  const challengeId = crypto.randomBytes(12).toString("hex")

  let paidHash: string
  if (opts.skipPayment && opts.paidHash) {
    // Caller already paid and the payment was verified externally.
    paidHash = opts.paidHash
  } else {
    const payMicro = deps.payMicro ?? ((memo: string) => payMicroFee(deps.client, deps.payerWallet, deps.feeAddress, ORACLE_FEE_DROPS, memo))
    const paid = await payMicro(challengeId)
    paidHash = paid.hash
    const verifyMicro = deps.verifyMicro ?? ((proof: MicroPaymentProof) => verifyMicroPaymentByHash(deps.client, proof))
    const verified = await verifyMicro({
      hash: paid.hash,
      payer: deps.payerWallet.address,
      receiver: deps.feeAddress,
      amountDrops: ORACLE_FEE_DROPS,
      challengeId,
    })
    if (!verified) {
      throw new Error("paid pricing fee could not be verified on-ledger")
    }
  }

  const exp = now + VOUCHER_TTL_MS
  const voucher = signVoucher(deps.voucherSecret, {
    productId,
    condition,
    mmaDrops: valuation.mmaDrops,
    minDrops: valuation.minDrops,
    maxDrops: valuation.maxDrops,
    askingDrops: valuation.askingDrops,
    issuedAt: now,
    exp,
    paidHash,
  })
  return {
    productId,
    condition,
    source: "Paid x402 pricing oracle (fee verified on-ledger)",
    mmaDrops: valuation.mmaDrops,
    minDrops: valuation.minDrops,
    maxDrops: valuation.maxDrops,
    askingDrops: valuation.askingDrops,
    paidHash,
    voucher,
  }
}
