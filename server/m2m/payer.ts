// Micro-payment execution for x402 fees and MPP metered overage. Each call is a
// real, validated XRPL Testnet Payment from the payer to the fee vault.

import { Client, Wallet } from "xrpl"
import { preparePayment, submitAndTrack } from "../payments/executor"

export interface MicroPayment {
  hash: string
  amountDrops: number
  receiver: string
}

export async function payMicroFee(
  client: Client,
  payerWallet: Wallet,
  receiver: string,
  amountDrops: number,
  memo: string,
): Promise<MicroPayment> {
  const prepared = await preparePayment(client, payerWallet, receiver, amountDrops, memo)
  const outcome = await submitAndTrack(client, prepared)
  if (outcome.status !== "validated") {
    throw new Error(`micro-payment failed: ${outcome.resultCode ?? "unknown"} (${outcome.resultMessage ?? ""})`)
  }
  return { hash: outcome.hash, amountDrops, receiver }
}
