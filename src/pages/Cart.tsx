import { useMemo, useState } from "react"
import { demoStore, useDemoStore } from "../store/demoStore"
import { productById } from "../data/catalog"
import { DecisionPreview, EmptyState, Modal, Money } from "../components/ui"
import { centsToInput, formatRange, parseCents } from "../domain/money"
import type { Listing } from "../domain/types"

export function CartPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const cart = state.carts[current.id] ?? []
  const [checkout, setCheckout] = useState(false)

  const lines = cart
    .map((c) => ({ cart: c, listing: state.listings.find((l) => l.id === c.listingId) }))
    .filter((x) => x.listing)

  const selected = lines.filter((x) => x.cart.selected)
  const total = selected.reduce((sum, x) => sum + (x.listing!.amountCents), 0)

  return (
    <section className="page">
      <p className="eyebrow">YOUR INTENT</p>
      <h1>Cart</h1>
      <p className="lead">
        Nothing is purchased until you state a maximum price and submit. Each line is
        checked against its MMA; rejected lines stay here for you to correct.
      </p>

      {lines.length === 0 ? (
        <EmptyState>
          Your cart is empty. Browse the marketplace to add items, or use I Need for a
          specific request.
        </EmptyState>
      ) : (
        <>
          <div className="cart-lines">
            {lines.map(({ cart: c, listing }) => (
              <CartLine
                key={c.listingId}
                listing={listing!}
                selected={c.selected}
                onToggle={() =>
                  demoStore.dispatch({
                    type: "setCartSelected",
                    actorId: current.id,
                    listingId: c.listingId,
                    selected: !c.selected,
                  })
                }
                onRemove={() =>
                  demoStore.dispatch({ type: "removeFromCart", actorId: current.id, listingId: c.listingId })
                }
              />
            ))}
          </div>
          <div className="checkout">
            <div>
              <span>
                {selected.length} item{selected.length === 1 ? "" : "s"} selected
              </span>
              <b>
                Listing total <Money cents={total} />
              </b>
            </div>
            <button className="primary" disabled={!selected.length} onClick={() => setCheckout(true)}>
              Review &amp; price offers →
            </button>
          </div>
        </>
      )}

      {checkout && <CheckoutModal onClose={() => setCheckout(false)} />}
    </section>
  )
}

function CartLine({
  listing,
  selected,
  onToggle,
  onRemove,
}: {
  listing: Listing
  selected: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const product = productById(listing.productId)
  return (
    <label className="cart-line">
      <input type="checkbox" checked={selected} onChange={onToggle} />
      <span>{product?.emoji ?? "📦"}</span>
      <div>
        <b>{product?.title ?? listing.productId}</b>
        <small>
          MMA <Money cents={listing.snapshot.adjustedMmaCents} /> · range{" "}
          {formatRange(listing.snapshot.minCents, listing.snapshot.maxCents)}
        </small>
      </div>
      <strong>
        <Money cents={listing.amountCents} />
      </strong>
      <button type="button" onClick={onRemove} aria-label="Remove">
        ×
      </button>
    </label>
  )
}

function CheckoutModal({ onClose }: { onClose: () => void }) {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const cart = state.carts[current.id] ?? []
  const selected = cart
    .filter((c) => c.selected)
    .map((c) => ({ id: c.listingId, listing: state.listings.find((l) => l.id === c.listingId)! }))
    .filter((x) => x.listing)

  const [offers, setOffers] = useState<Record<string, string>>(() =>
    Object.fromEntries(selected.map((x) => [x.id, centsToInput(x.listing.amountCents)])),
  )

  const parsed = useMemo(() => {
    const out: Record<string, number | null> = {}
    for (const x of selected) out[x.id] = parseCents(offers[x.id] ?? "")
    return out
  }, [offers, selected])

  const maxTotal = selected.reduce((sum, x) => sum + (parsed[x.id] ?? 0), 0)
  const allValid = selected.every((x) => parsed[x.id] !== null)

  const submit = () => {
    demoStore.dispatch({
      type: "checkoutCart",
      actorId: current.id,
      lines: selected
        .filter((x) => parsed[x.id] !== null)
        .map((x) => ({ listingId: x.id, ceilingCents: parsed[x.id]! })),
    })
    onClose()
  }

  return (
    <Modal eyebrow="CONFIRM YOUR INTENT" title="Set your maximum prices" onClose={onClose}>
      <p className="muted">
        Your price is a buyout ceiling, not an immediate charge. Guardian will match only
        safe, eligible listings at the seller's asking price.
      </p>
      <div className="offer-lines">
        {selected.map((x) => {
          const product = productById(x.listing.productId)
          return (
            <div className="offer-line" key={x.id}>
              <span>{product?.emoji ?? "📦"}</span>
              <div>
                <b>{product?.title ?? x.listing.productId}</b>
                <small>
                  Asking <Money cents={x.listing.amountCents} /> · MMA{" "}
                  <Money cents={x.listing.snapshot.adjustedMmaCents} />
                </small>
                <small>
                  Range {formatRange(x.listing.snapshot.minCents, x.listing.snapshot.maxCents)}
                </small>
              </div>
              <label>
                Maximum price
                <input
                  type="text"
                  inputMode="decimal"
                  value={offers[x.id] ?? ""}
                  onChange={(e) => setOffers((o) => ({ ...o, [x.id]: e.target.value }))}
                  aria-invalid={parsed[x.id] === null}
                />
                <DecisionPreview cents={parsed[x.id]} snapshot={x.listing.snapshot} />
              </label>
            </div>
          )
        })}
      </div>
      <div className="intent-total">
        <span>
          {selected.length} buyer intent{selected.length === 1 ? "" : "s"} · Need Window: 90 days
        </span>
        <b>
          Maximum total: <Money cents={maxTotal} />
        </b>
      </div>
      <button className="primary full" disabled={!allValid || !selected.length} onClick={submit}>
        Submit intent for Guardian review
      </button>
      <small className="fine">
        By submitting, you allow Yardle to prepare a payment proposal for your explicit
        authorization when an eligible listing is matched. Automatic price acceptance never
        spends money on its own.
      </small>
    </Modal>
  )
}
