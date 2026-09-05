import { demoStore, useDemoStore } from "../store/demoStore"
import { productById } from "../data/catalog"
import { Badge, EmptyState, Money, formatDate } from "../components/ui"
import { formatRange } from "../domain/money"
import type { Proposal } from "../domain/types"

export function AuthorizationPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const proposals = state.proposals.filter(
    (p) => p.buyerId === current.id && p.status === "awaiting_authorization",
  )

  return (
    <section className="page">
      <p className="eyebrow">TRANSACTION AUTHORIZATION</p>
      <h1>Authorize payment</h1>
      <p className="lead">
        Review and explicitly authorize each prepared payment. Nothing is charged until you
        authorize — this is human-authorized agent execution.
      </p>

      {proposals.length === 0 ? (
        <EmptyState>No payments are awaiting your authorization.</EmptyState>
      ) : (
        <div className="proposal-list">
          {proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
      )}
    </section>
  )
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { state } = useDemoStore()
  const product = productById(proposal.productId)
  const buyer = state.personas.find((p) => p.id === proposal.buyerId)
  const seller = state.personas.find((p) => p.id === proposal.sellerId)
  const intent = state.intents.find((i) => i.id === proposal.intentId)

  return (
    <article className="proposal-card">
      <div className="proposal-head">
        <span>{product?.emoji ?? "📦"}</span>
        <div>
          <h2>{product?.title ?? proposal.productId}</h2>
          <small>
            {proposal.condition} · request {proposal.intentId.slice(-6)} · proposal{" "}
            {proposal.id.slice(-6)}
          </small>
        </div>
        <Badge tone="info">Awaiting authorization</Badge>
      </div>

      <div className="proposal-grid">
        <div>
          <span>Asking price</span>
          <b>
            <Money cents={proposal.amountCents} />
          </b>
        </div>
        <div>
          <span>Your ceiling</span>
          <b>
            <Money cents={intent?.ceilingCents ?? proposal.amountCents} />
          </b>
        </div>
        <div>
          <span>MMA</span>
          <b>
            <Money cents={proposal.snapshot.adjustedMmaCents} />
          </b>
        </div>
        <div>
          <span>Accepted range</span>
          <b>{formatRange(proposal.snapshot.minCents, proposal.snapshot.maxCents)}</b>
        </div>
        <div>
          <span>Payer</span>
          <b>{buyer?.name ?? proposal.buyerId}</b>
        </div>
        <div>
          <span>Payee</span>
          <b>{seller?.name ?? proposal.sellerId}</b>
        </div>
        <div>
          <span>Network / type</span>
          <b>Simulation · simulated escrow</b>
        </div>
        <div>
          <span>Max fee</span>
          <b>None (simulated)</b>
        </div>
      </div>

      <p className="proposal-note">
        Authorizing moves the asking price into simulated escrow. It is illustrative and does
        not spend real funds.
      </p>
      <small className="proposal-expiry">Expires {formatDate(proposal.expiresAt)}</small>

      <div className="actions">
        <button
          className="primary"
          onClick={() =>
            demoStore.dispatch({ type: "authorizeProposal", actorId: proposal.buyerId, proposalId: proposal.id })
          }
        >
          Authorize <Money cents={proposal.amountCents} />
        </button>
        <button
          className="secondary"
          onClick={() =>
            demoStore.dispatch({ type: "declineProposal", actorId: proposal.buyerId, proposalId: proposal.id })
          }
        >
          Decline
        </button>
      </div>
    </article>
  )
}
