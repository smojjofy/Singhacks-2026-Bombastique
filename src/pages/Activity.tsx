import { useState } from "react"
import { demoStore, useDemoStore } from "../store/demoStore"
import { productById } from "../data/catalog"
import {
  Badge,
  EmptyState,
  INTENT_STATUS_LABEL,
  LISTING_STATUS_LABEL,
  Money,
  formatDate,
  intentTone,
  listingTone,
} from "../components/ui"
import { centsToInput, parseCents } from "../domain/money"
import type { BuyerIntent, DemoState, Listing } from "../domain/types"

export function ActivityPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const [tab, setTab] = useState<"buyer" | "seller">(current.role === "seller" ? "seller" : "buyer")

  const intents = state.intents.filter((i) => i.buyerId === current.id)
  const listings = state.listings.filter((l) => l.sellerId === current.id)

  return (
    <section className="page">
      <p className="eyebrow">MY ACTIVITY</p>
      <h1>Activity</h1>
      <p className="lead">
        Track every 90-day Need Window and listing through Guardian review, matching, and
        simulated XRPL escrow.
      </p>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "buyer"}
          className={tab === "buyer" ? "active" : ""}
          onClick={() => setTab("buyer")}
        >
          Buyer requests {intents.length > 0 && <b>{intents.length}</b>}
        </button>
        <button
          role="tab"
          aria-selected={tab === "seller"}
          className={tab === "seller" ? "active" : ""}
          onClick={() => setTab("seller")}
        >
          Seller listings {listings.length > 0 && <b>{listings.length}</b>}
        </button>
      </div>

      {tab === "buyer" ? (
        intents.length === 0 ? (
          <EmptyState>No buyer requests for this persona yet.</EmptyState>
        ) : (
          <div className="activity-list">
            {intents.map((i) => (
              <BuyerCard key={i.id} intent={i} state={state} />
            ))}
          </div>
        )
      ) : listings.length === 0 ? (
        <EmptyState>No listings for this persona yet. Publish one from Sell.</EmptyState>
      ) : (
        <div className="activity-list">
          {listings.map((l) => (
            <SellerCard key={l.id} listing={l} state={state} />
          ))}
        </div>
      )}
    </section>
  )
}

function Timeline({ entries }: { entries: { at: number; label: string }[] }) {
  if (entries.length === 0) return null
  const sorted = [...entries].sort((a, b) => a.at - b.at)
  return (
    <details className="timeline">
      <summary>Timeline ({sorted.length})</summary>
      <ul>
        {sorted.map((e, idx) => (
          <li key={idx}>
            <span>{formatDate(e.at)}</span> {e.label}
          </li>
        ))}
      </ul>
    </details>
  )
}

function BuyerCard({ intent, state }: { intent: BuyerIntent; state: DemoState }) {
  const product = productById(intent.productId)
  const order = intent.activeOrderId
    ? state.orders.find((o) => o.id === intent.activeOrderId)
    : undefined
  const timeline = [...intent.timeline, ...(order?.timeline ?? [])]

  return (
    <article className="activity-card">
      <span className={`state state-${intent.status}`} />
      <div className="activity-main">
        <p className="activity-kicker">
          {intent.source === "want" ? "I WANT" : "I NEED"} · expires{" "}
          {new Date(intent.expiresAt).toLocaleDateString()}
        </p>
        <h3>
          {product?.emoji ?? "⌕"} {product?.title ?? intent.productId}
        </h3>
        <small>
          Max price <Money cents={intent.ceilingCents} /> · MMA{" "}
          <Money cents={intent.snapshot.adjustedMmaCents} /> · {intent.condition}
        </small>
        {intent.reason && <div className="reason">{intent.reason}</div>}
        <Timeline entries={timeline} />
      </div>
      <div className="activity-state">
        <Badge tone={intentTone(intent.status)}>{INTENT_STATUS_LABEL[intent.status]}</Badge>
        {order && (
          <small>
            Order {order.id.slice(-6)} · <Money cents={order.amountCents} />
          </small>
        )}
        {intent.status === "reserved" && intent.activeProposalId && (
          <>
            <button
              className="primary"
              onClick={() =>
                demoStore.dispatch({
                  type: "authorizeProposal",
                  actorId: intent.buyerId,
                  proposalId: intent.activeProposalId!,
                })
              }
            >
              Authorize payment
            </button>
            <button
              className="secondary"
              onClick={() =>
                demoStore.dispatch({
                  type: "declineProposal",
                  actorId: intent.buyerId,
                  proposalId: intent.activeProposalId!,
                })
              }
            >
              Decline
            </button>
          </>
        )}
        {intent.status === "searching" && (
          <button
            className="secondary"
            onClick={() => demoStore.dispatch({ type: "cancelIntent", actorId: intent.buyerId, intentId: intent.id })}
          >
            Cancel
          </button>
        )}
        {intent.status === "escrow" && (
          <>
            <button
              className="primary"
              onClick={() => demoStore.dispatch({ type: "confirmReceipt", actorId: intent.buyerId, orderId: order!.id })}
            >
              Confirm item received
            </button>
            <button
              className="secondary"
              onClick={() => demoStore.dispatch({ type: "cancelOrder", actorId: intent.buyerId, orderId: order!.id })}
            >
              Cancel order
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function SellerCard({ listing, state }: { listing: Listing; state: DemoState }) {
  const product = productById(listing.productId)
  const [editing, setEditing] = useState(false)
  const [price, setPrice] = useState(centsToInput(listing.amountCents))
  const cents = parseCents(price)
  const editable = listing.status === "rejected" || listing.status === "live"

  const save = () => {
    if (cents === null) return
    demoStore.dispatch({ type: "editListing", actorId: listing.sellerId, listingId: listing.id, amountCents: cents })
    setEditing(false)
  }

  const buyerName = listing.activeOrderId
    ? state.orders.find((o) => o.id === listing.activeOrderId)?.buyerId
    : undefined

  return (
    <article className="activity-card">
      <span className={`state state-${listing.status}`} />
      <div className="activity-main">
        <p className="activity-kicker">{listing.status.toUpperCase()}</p>
        <h3>
          {product?.emoji ?? "📦"} {product?.title ?? listing.productId}
        </h3>
        <small>
          {editing ? (
            <span className="edit-row">
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={price !== "" && cents === null}
              />
              <button className="primary" onClick={save} disabled={cents === null}>
                Save
              </button>
              <button className="secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <>
              <Money cents={listing.amountCents} /> · MMA{" "}
              <Money cents={listing.snapshot.adjustedMmaCents} /> · {listing.condition}
            </>
          )}
        </small>
        {listing.reason && !editing && <div className="reason">{listing.reason}</div>}
        <Timeline entries={listing.timeline} />
      </div>
      <div className="activity-state">
        <Badge tone={listingTone(listing.status)}>{LISTING_STATUS_LABEL[listing.status]}</Badge>
        {buyerName && (
          <small>
            Matched: {state.personas.find((p) => p.id === buyerName)?.name ?? buyerName}
          </small>
        )}
        {editable && !editing && (
          <button className="secondary" onClick={() => setEditing(true)}>
            {listing.status === "rejected" ? "Correct price" : "Edit price"}
          </button>
        )}
      </div>
    </article>
  )
}
