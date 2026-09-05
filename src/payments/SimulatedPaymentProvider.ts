import type { PaymentOutcome, PaymentProvider } from "./PaymentProvider"

/**
 * Deterministic in-memory payment provider. No network calls, no fabricated
 * chain hashes, no real funds. The only failure mode is insufficient balance.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  fund(amountCents: number, availableCents: number): PaymentOutcome {
    if (amountCents > availableCents) {
      return {
        ok: false,
        reason: `Insufficient funds — the escrow requires ${amountCents} but the buyer has ${availableCents}.`,
      }
    }
    return { ok: true }
  }

  release(): PaymentOutcome {
    return { ok: true }
  }

  refund(): PaymentOutcome {
    return { ok: true }
  }
}
