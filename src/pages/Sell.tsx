import { useMemo, useState } from "react"
import { demoStore, useDemoStore } from "../store/demoStore"
import { ConditionSelect, ProductSelect } from "../components/forms"
import { DecisionPreview, Field, ValuationPanel } from "../components/ui"
import { productById } from "../data/catalog"
import { snapshotFromMarket } from "../domain/valuation"
import { parseCents } from "../domain/money"
import type { Condition } from "../domain/types"

export function SellPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const [productId, setProductId] = useState("phone-iphone-13")
  const [condition, setCondition] = useState<Condition>("Good")
  const [price, setPrice] = useState("")
  const [result, setResult] = useState<{ tone: "ok" | "danger"; text: string } | null>(null)

  const snapshot = useMemo(
    () => snapshotFromMarket(productId, condition, state.marketPrices, state.sales),
    [productId, condition, state.sales],
  )
  const product = productById(productId)
  const cents = parseCents(price)
  const valid = cents !== null

  const submit = () => {
    if (!cents) return
    demoStore.dispatch({
      type: "createListing",
      actorId: current.id,
      productId,
      condition,
      amountCents: cents,
    })
    const latest = demoStore
      .getSnapshot()
      .state.listings.find(
        (l) => l.sellerId === current.id && l.productId === productId && l.condition === condition && l.amountCents === cents,
      )
    setPrice("")
    setResult(
      latest?.status === "rejected"
        ? { tone: "danger", text: latest.reason ?? "Listing rejected." }
        : { tone: "ok", text: "Listing published (auto-approved)." },
    )
  }

  return (
    <section className="page">
      <p className="eyebrow">SELLER WORKSPACE</p>
      <h1>Sell an item</h1>
      <p className="lead">
        Create one unique listing. The MMA and accepted range are derived from seeded
        demo sales — you never enter them. Out-of-range prices are rejected automatically.
      </p>

      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) submit()
        }}
      >
        <Field label="Product">
          <ProductSelect value={productId} onChange={setProductId} />
        </Field>
        <Field label="Condition">
          <ConditionSelect value={condition} onChange={setCondition} />
        </Field>
        <div className="form-span">
          <ValuationPanel snapshot={snapshot} />
        </div>
        <Field label="Your asking price" hint="Automatically approved only within the accepted range.">
          <input
            type="text"
            inputMode="decimal"
            value={price}
            placeholder="e.g. 350"
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={price !== "" && cents === null}
          />
        </Field>
        <div className="form-span">
          <DecisionPreview cents={cents} snapshot={snapshot} />
        </div>
        {result && (
          <div className={`form-span decision decision-${result.tone}`}>{result.text}</div>
        )}
        <button className="primary" disabled={!valid}>
          Publish listing
        </button>
        <small className="form-span muted">
          Listing as {product?.emoji} {product?.title}. Images and shipping are out of scope
          for this demo.
        </small>
      </form>
    </section>
  )
}
