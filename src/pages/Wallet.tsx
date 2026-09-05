import { useDemoStore } from "../store/demoStore"
import { Money, formatDate } from "../components/ui"
import {
  availableCents,
  escrowCents,
  incomingPendingCents,
  outgoingEscrowCents,
  totalSeededFunds,
} from "../domain/balances"
import type { LedgerEntry } from "../domain/types"

export function WalletPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!

  const available = availableCents(state, current.id)
  const outgoing = outgoingEscrowCents(state, current.id)
  const incoming = incomingPendingCents(state, current.id)
  const history = state.ledger
    .filter((e) => e.personaId === current.id)
    .slice()
    .sort((a, b) => b.at - a.at)

  return (
    <section className="page">
      <p className="eyebrow">WALLET</p>
      <h1>Wallet</h1>
      <p className="lead">
        Simulated demo funds in {current.name}. Balances are derived from a ledger and
        always reconcile with escrow.
      </p>

      <div className="wallet-grid">
        <div className="wallet-card wallet-card-main">
          <h2>{current.name}</h2>
          <small>{current.role === "seller" ? "Seller" : "Buyer"} persona</small>
          <div className="wallet-balance">
            <span>Available</span>
            <b>
              <Money cents={available} />
            </b>
          </div>
        </div>
        <div className="wallet-card">
          <div className="wallet-row">
            <span>Outgoing escrow</span>
            <b>
              <Money cents={outgoing} />
            </b>
          </div>
          <div className="wallet-row">
            <span>Incoming pending</span>
            <b>
              <Money cents={incoming} />
            </b>
          </div>
          <div className="wallet-row">
            <span>Total in escrow</span>
            <b>
              <Money cents={escrowCents(state)} />
            </b>
          </div>
        </div>
      </div>

      <h2 className="subhead">All balances</h2>
      <div className="balances-table">
        {state.personas.map((p) => (
          <div className="balance-row" key={p.id}>
            <span>{p.name}</span>
            <b>
              <Money cents={availableCents(state, p.id)} />
            </b>
          </div>
        ))}
        <div className="balance-row balance-total">
          <span>Seeded total (available + escrow)</span>
          <b>
            <Money cents={totalSeededFunds(state)} />
          </b>
        </div>
      </div>

      <h2 className="subhead">Transaction history</h2>
      {history.length === 0 ? (
        <div className="empty">No transactions for this persona yet.</div>
      ) : (
        <div className="ledger-list">
          {history.map((e) => (
            <LedgerRow key={e.id} entry={e} state={state} />
          ))}
        </div>
      )}
    </section>
  )
}

function LedgerRow({
  entry,
  state,
}: {
  entry: LedgerEntry
  state: import("../domain/types").DemoState
}) {
  const counterparty = state.personas.find((p) => p.id === entry.counterpartyId)
  const isDebit = entry.kind === "fund"
  const label =
    entry.kind === "fund"
      ? "Escrow funded"
      : entry.kind === "release"
        ? "Escrow released"
        : "Refund"
  return (
    <div className="ledger-row">
      <span className={`ledger-amount ${isDebit ? "debit" : "credit"}`}>
        {isDebit ? "−" : "+"}
        <Money cents={entry.amountCents} />
      </span>
      <div className="ledger-info">
        <b>{label}</b>
        <small>
          {counterparty?.name ?? entry.counterpartyId} · order {entry.orderId.slice(-6)} ·{" "}
          {formatDate(entry.at)}
        </small>
      </div>
    </div>
  )
}
