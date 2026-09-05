import { useMemo, useState } from "react"
import { demoStore, useDemoStore } from "../store/demoStore"
import { ConditionSelect, ProductSelect } from "../components/forms"
import { DecisionPreview, Field, ValuationPanel } from "../components/ui"
import { computeSnapshot } from "../domain/valuation"
import { parseCents } from "../domain/money"
import type { Condition } from "../domain/types"

export function NeedPage() {
  const { state } = useDemoStore()
  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const [productId, setProductId] = useState("phone-iphone-13")
  const [condition, setCondition] = useState<Condition>("Good")
  const [price, setPrice] = useState("")
  const [result, setResult] = useState<{ tone: "ok" | "danger"; text: string } | null>(null)

  const snapshot = useMemo(
    () => computeSnapshot(productId, condition, state.sales),
    [productId, condition, state.sales],
  )
  const cents = parseCents(price)
  const valid = cents !== null

  const submit = () => {
    if (!cents) return
    demoStore.dispatch({
      type: "submitIntent",
      actorId: current.id,
      source: "need",
      productId,
      condition,
      ceilingCents: cents,
    })
    const latest = demoStore
      .getSnapshot()
      .state.intents.find(
        (i) => i.buyerId === current.id && i.productId === productId && i.condition === condition && i.ceilingCents === cents,
      )
    setPrice("")
    if (latest?.status === "rejected") setResult({ tone: "danger", text: latest.reason ?? "Request rejected." })
    else if (latest?.status === "reserved") setResult({ tone: "ok", text: "Approved — eligible match found. Authorize it to proceed." })
    else setResult({ tone: "ok", text: "Approved - searching for a match." })
  }

  return (
    <section className="page">
      <p className="eyebrow">IMMEDIATE DEMAND</p>
      <h1>I need something</h1>
      <p className="lead">
        Create an immediate priced demand listing. Guardian derives the MMA and accepted
        range before you confirm. This does not affect your cart.
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
        <Field label="Your maximum price" hint="A buyout ceiling, not an immediate charge.">
          <input
            type="text"
            inputMode="decimal"
            value={price}
            placeholder="e.g. 380"
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
          Submit I Need for Guardian review
        </button>
      </form>
    </section>
  )
}
