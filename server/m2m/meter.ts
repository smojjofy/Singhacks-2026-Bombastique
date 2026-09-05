// MPP-style metered velocity guard. Each actor (payer account) gets a free
// allowance of guarded requests per window; beyond it, every further request is
// charged a small real micro-payment to the fee vault before it proceeds.

import type { Client, Wallet } from "xrpl"
import { VelocityTracker } from "../../src/domain/velocity"
import { METER_FEE_DROPS, VELOCITY_FREE_LIMIT, VELOCITY_WINDOW_MS } from "./fees"
import { payMicroFee } from "./payer"

export interface MeterOutcome {
  free: boolean
  freeRemaining: number
  overage?: { feeDrops: number; txHash: string }
}

export class MppMeter {
  readonly tracker = new VelocityTracker(VELOCITY_WINDOW_MS, VELOCITY_FREE_LIMIT)

  constructor(
    private readonly payer: { client: Client; wallet: Wallet; feeAddress: string },
    private readonly payFn = payMicroFee,
  ) {}

  /** Charge nothing if within the free tier; otherwise auto-settle the meter fee. */
  async guard(account: string, action: string, now = Date.now()): Promise<MeterOutcome> {
    if (this.tracker.isWithinFreeTier(account, now)) {
      this.tracker.record(account, now)
      return { free: true, freeRemaining: this.tracker.remaining(account, now) }
    }
    const paid = await this.payFn(
      this.payer.client,
      this.payer.wallet,
      this.payer.feeAddress,
      METER_FEE_DROPS,
      `meter:${action}:${account}:${now.toString(36)}`,
    )
    this.tracker.record(account, now)
    return { free: false, freeRemaining: 0, overage: { feeDrops: METER_FEE_DROPS, txHash: paid.hash } }
  }

  snapshot(account: string, now = Date.now()): { count: number; freeRemaining: number } {
    return { count: this.tracker.count(account, now), freeRemaining: this.tracker.remaining(account, now) }
  }
}
