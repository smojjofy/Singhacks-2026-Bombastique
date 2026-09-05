// Balance derivation. Balances are always derived from the ledger + seeded
// initial funds, so conservation holds across fund/release/refund.

import type { DemoState } from "./types"

export function availableCents(state: DemoState, personaId: string): number {
  const persona = state.personas.find((p) => p.id === personaId)
  let balance = persona?.initialFundsCents ?? 0
  for (const entry of state.ledger) {
    if (entry.personaId !== personaId) continue
    if (entry.kind === "fund") balance -= entry.amountCents
    else balance += entry.amountCents // release or refund
  }
  return balance
}

/** Total funds currently held in escrow (not credited to any persona). */
export function escrowCents(state: DemoState): number {
  let escrow = 0
  for (const entry of state.ledger) {
    if (entry.kind === "fund") escrow += entry.amountCents
    else escrow -= entry.amountCents
  }
  return escrow
}

/** Buyer's funds currently locked in escrow for their own funded orders. */
export function outgoingEscrowCents(state: DemoState, personaId: string): number {
  return state.orders
    .filter((o) => o.buyerId === personaId && o.status === "escrow")
    .reduce((sum, o) => sum + o.amountCents, 0)
}

/** Seller's pending incoming (informational, not spendable). */
export function incomingPendingCents(state: DemoState, personaId: string): number {
  return state.orders
    .filter((o) => o.sellerId === personaId && o.status === "escrow")
    .reduce((sum, o) => sum + o.amountCents, 0)
}

export function totalSeededFunds(state: DemoState): number {
  return state.personas.reduce((sum, p) => sum + p.initialFundsCents, 0)
}

/** Conservation invariant: available + escrow === seeded total. */
export function balancesReconcile(state: DemoState): boolean {
  const availableSum = state.personas.reduce((sum, p) => sum + availableCents(state, p.id), 0)
  return availableSum + escrowCents(state) === totalSeededFunds(state)
}
