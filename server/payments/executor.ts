// Durable async XRP Payment executor. Builds a direct native-XRP Payment, signs
// with a test-only signer, persists the operation record before broadcasting,
// then waits for a validated outcome (reliable submission). No partial payments,
// no fabricated success.

import { Client, Wallet, convertStringToHex } from "xrpl"
import type { Payment, SubmitResponse } from "xrpl"

export interface PreparedPayment {
  tx_blob: string
  hash: string
  sequence: number
  lastLedgerSequence: number
  fee: string
  amountDrops: number
  destination: string
}

export type SubmitStatus = "validated" | "failed" | "expired" | "uncertain"

export interface SubmitOutcome {
  status: SubmitStatus
  hash: string
  ledgerIndex?: number
  resultCode?: string
  resultMessage?: string
}

const POLL_MS = 1_000

export async function preparePayment(
  client: Client,
  buyer: Wallet,
  sellerAddress: string,
  amountDrops: number,
  memo: string,
  maxFeeDrops = 1000,
): Promise<PreparedPayment> {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: buyer.address,
    Destination: sellerAddress,
    Amount: String(amountDrops), // drops, exact
    Memos: [
      {
        Memo: {
          MemoType: convertStringToHex("yardle/order"),
          MemoFormat: convertStringToHex("text/plain"),
          MemoData: convertStringToHex(memo),
        },
      },
    ],
  }
  const filled = await client.autofill(tx)
  if (filled.LastLedgerSequence == null || filled.Sequence == null) {
    throw new Error("autofill failed to set Sequence/LastLedgerSequence")
  }
  if (!filled.Fee || Number(filled.Fee) > maxFeeDrops) throw new Error("Network fee exceeds the authorized cap")
  const [account, server] = await Promise.all([
    client.request({ command: "account_info", account: buyer.address, ledger_index: "validated" }),
    client.request({ command: "server_info" }),
  ])
  const ledger = server.result.info.validated_ledger
  if (!ledger) throw new Error("Reserve information unavailable; payment was not submitted")
  const reserve = Math.ceil((ledger.reserve_base_xrp + account.result.account_data.OwnerCount * ledger.reserve_inc_xrp) * 1_000_000)
  if (BigInt(account.result.account_data.Balance) < BigInt(amountDrops) + BigInt(filled.Fee) + BigInt(reserve)) {
    throw new Error("Insufficient spendable Testnet XRP including reserve and fee")
  }
  const { tx_blob, hash } = buyer.sign(filled)
  return {
    tx_blob,
    hash,
    sequence: filled.Sequence,
    lastLedgerSequence: filled.LastLedgerSequence,
    fee: filled.Fee ?? "0",
    amountDrops,
    destination: sellerAddress,
  }
}

export async function submitAndTrack(
  client: Client,
  prepared: PreparedPayment,
  onAccepted?: (submit: SubmitResponse) => void,
): Promise<SubmitOutcome> {
  const submit = await client.submit(prepared.tx_blob)
  onAccepted?.(submit)
  const code = submit.result.engine_result
  if (code === "tesSUCCESS") {
    return waitForOutcome(client, prepared.hash, prepared.lastLedgerSequence)
  }
  // tem*/tef*/tej* are not ledger-included failures.
  if (/^te[fmj]/.test(code)) {
    return { status: "failed", hash: prepared.hash, resultCode: code, resultMessage: submit.result.engine_result_message }
  }
  // tec* is a fee-consuming failure that still lands in a ledger; wait for it.
  return waitForOutcome(client, prepared.hash, prepared.lastLedgerSequence)
}

export async function waitForOutcome(
  client: Client,
  hash: string,
  lastLedgerSequence: number,
): Promise<SubmitOutcome> {
  const until = Date.now() + 20_000
  while (Date.now() < until) {
    const txResponse = await client.request({ command: "tx", transaction: hash }).catch(() => null)
    if (!txResponse) {
      // Not found and lost responses are not proof of failure. Keep the same
      // operation reserved for subsequent hash reconciliation.
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (txResponse.result.validated) {
      const meta = txResponse.result.meta
      const resultCode =
        typeof meta === "object" && meta && "TransactionResult" in meta
          ? String((meta as { TransactionResult?: string }).TransactionResult)
          : undefined
      const ledgerIndex = txResponse.result.ledger_index
      if (resultCode === "tesSUCCESS") {
        return { status: "validated", hash, ledgerIndex, resultCode, resultMessage: undefined }
      }
      return {
        status: "failed",
        hash,
        ledgerIndex,
        resultCode,
        resultMessage: `Transaction settled with ${resultCode}`,
      }
    }
    // Check whether the last ledger window has passed.
    // LastLedgerSequence alone does not prove absence without ledger history.
    // Preserve an uncertain operation rather than authorizing a replacement.
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return { status: "uncertain", hash, resultMessage: `Awaiting validation/reconciliation (last ledger ${lastLedgerSequence}). Do not send a replacement.` }
}

/** Determine a persisted hash's final outcome (used on restart/recovery). */
export async function reconcileByHash(client: Client, hash: string): Promise<SubmitOutcome | null> {
  try {
    const txResponse = await client.request({ command: "tx", transaction: hash })
    if (!txResponse.result.validated) return null // still pending / unknown
    const meta = txResponse.result.meta
    const resultCode =
      typeof meta === "object" && meta && "TransactionResult" in meta
        ? String((meta as { TransactionResult?: string }).TransactionResult)
        : undefined
    return {
      status: resultCode === "tesSUCCESS" ? "validated" : "failed",
      hash,
      ledgerIndex: txResponse.result.ledger_index,
      resultCode,
      resultMessage: resultCode === "tesSUCCESS" ? undefined : `Transaction settled with ${resultCode}`,
    }
  } catch {
    return null
  }
}
