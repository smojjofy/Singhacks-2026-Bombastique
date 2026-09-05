// Payment-provider boundary. The command layer owns commits; the provider only
// reports a deterministic outcome (fund/release/refund). Swapping this for a real
// XRPL Testnet provider later must not require product-flow changes.

export interface PaymentOutcome {
  ok: boolean
  reason?: string
}

export interface PaymentProvider {
  /**
   * Decide whether a simulated escrow can be funded. `amountCents` is the
   * seller's asking price; `availableCents` is the buyer's derived balance.
   */
  fund(amountCents: number, availableCents: number): PaymentOutcome
  /** Release escrow to the seller. The provider always succeeds once funded. */
  release(amountCents: number): PaymentOutcome
  /** Refund escrow to the buyer. The provider always succeeds once funded. */
  refund(amountCents: number): PaymentOutcome
}
