import { demoStore, useDemoStore } from "../store/demoStore"
import { productById } from "../data/catalog"
import { Money } from "../components/ui"
import { formatRange } from "../domain/money"
import type { Listing } from "../domain/types"

export function Marketplace() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const live = state.listings.filter((l) => l.status === "live")
  const cart = state.carts[current.id] ?? []

  return (
    <section className="page">
      <p className="eyebrow">MARKETPLACE</p>
      <h1>Available now</h1>
      <p className="lead">
        Single-unit listings, each checked against its Market Moving Average. Only
        automatically-approved listings appear here.
      </p>

      {live.length === 0 ? (
        <div className="empty">
          No approved listings yet. Switch to the seller persona and publish an item.
        </div>
      ) : (
        <div className="listing-grid">
          {live.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              sellerName={state.personas.find((p) => p.id === l.sellerId)?.name ?? "Seller"}
              inCart={cart.some((c) => c.listingId === l.id)}
              onAdd={() => demoStore.dispatch({ type: "addToCart", actorId: current.id, listingId: l.id })}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ListingCard({
  listing,
  sellerName,
  inCart,
  onAdd,
}: {
  listing: Listing
  sellerName: string
  inCart: boolean
  onAdd: () => void
}) {
  const product = productById(listing.productId)
  const title = product?.title ?? listing.productId
  const emoji = product?.emoji ?? "📦"
  const category = product?.category ?? ""

  return (
    <article className="listing">
      <div className="image">
        {emoji}
        <span className="risk">● Guardian cleared</span>
      </div>
      <div className="listing-body">
        <p>
          {category} · {listing.condition}
        </p>
        <h3>{title}</h3>
        <div className="price-row">
          <strong>
            <Money cents={listing.amountCents} />
          </strong>
          <span>
            MMA <Money cents={listing.snapshot.adjustedMmaCents} />
          </span>
        </div>
        <div className="range-line">Range {formatRange(listing.snapshot.minCents, listing.snapshot.maxCents)}</div>
        <small>Sold by {sellerName}</small>
        <button onClick={onAdd} disabled={inCart}>
          {inCart ? "In your cart" : "I want this"}
        </button>
      </div>
    </article>
  )
}
