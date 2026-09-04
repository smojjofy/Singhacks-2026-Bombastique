import { useMemo, useState } from "react"
import { listings, type Listing } from "./data"

type IntentMode = "want" | "need"

const money = (amount: number) => `$${amount.toLocaleString()}`

export default function App() {
  const [cart, setCart] = useState<Listing[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<IntentMode | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const cartTotal = useMemo(
    () => cart.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.price, 0),
    [cart, selected],
  )

  function addToCart(item: Listing) {
    if (cart.some((cartItem) => cartItem.id === item.id)) return
    setCart([...cart, item])
    setSelected([...selected, item.id])
  }

  function removeFromCart(id: string) {
    setCart(cart.filter((item) => item.id !== id))
    setSelected(selected.filter((selectedId) => selectedId !== id))
  }

  function toggleSelected(id: string) {
    setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  }

  return (
    <main>
      <nav>
        <a className="brand" href="#top"><span>◒</span> yardle</a>
        <div className="nav-links"><a href="#market">Marketplace</a><a href="#how">How it works</a><button className="cart-button" onClick={() => document.getElementById("cart")?.scrollIntoView()}>Cart <b>{cart.length}</b></button></div>
      </nav>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">AI-GUARDED RESALE</p>
          <h1>The fair way to find what you’re after.</h1>
          <p className="lead">Yardle’s Guardian detects underpricing, bot sniping and market manipulation before an item changes hands.</p>
          <div className="actions"><a className="primary" href="#market">Browse listings</a><button className="secondary" onClick={() => setMode("need")}>I need something</button></div>
        </div>
        <aside className="guardian-card">
          <div className="status"><span /> Guardian online</div>
          <h2>Market pulse</h2>
          <p>Every offer is checked against a fresh Market Moving Average before it can settle.</p>
          <div className="pulse"><span>Safe listings</span><b>98.4%</b></div>
          <div className="pulse"><span>Median review time</span><b>&lt; 500ms</b></div>
        </aside>
      </section>

      <section className="market" id="market">
        <div className="section-head"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Available now</h2></div><button className="secondary" onClick={() => setMode("need")}>+ Create an I Need</button></div>
        <div className="listing-grid">
          {listings.map((item) => {
            const safe = item.price >= item.mma * 0.7
            return <article className="listing" key={item.id}>
              <div className="image" aria-hidden="true">{item.emoji}<span className="risk">{safe ? "● Guardian cleared" : "● Needs review"}</span></div>
              <div className="listing-body"><p>{item.category} · {item.condition}</p><h3>{item.title}</h3><div className="price-row"><strong>{money(item.price)}</strong><span>MMA {money(item.mma)}</span></div><small>Sold by {item.seller}</small><button onClick={() => addToCart(item)} disabled={cart.some((cartItem) => cartItem.id === item.id)}>{cart.some((cartItem) => cartItem.id === item.id) ? "In your cart" : "I want this"}</button></div>
            </article>
          })}
        </div>
      </section>

      <section className="cart-panel" id="cart">
        <div><p className="eyebrow">YOUR INTENT</p><h2>Cart</h2><p className="muted">Choose listings to price and submit. A cart is not a purchase.</p></div>
        {cart.length === 0 ? <div className="empty">Your cart is clear. Add an item above, or create an <button onClick={() => setMode("need")}>I Need</button>.</div> : <div className="cart-lines">{cart.map((item) => <label className="cart-line" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} /><span>{item.emoji}</span><div><b>{item.title}</b><small>MMA snapshot: {money(item.mma)}</small></div><strong>{money(item.price)}</strong><button onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.title}`}>×</button></label>)}<div className="checkout"><div><span>{selected.length} item{selected.length === 1 ? "" : "s"} selected</span><b>Listing total {money(cartTotal)}</b></div><button className="primary" disabled={!selected.length} onClick={() => setMode("want")}>Review & price offers →</button></div></div>}
      </section>

      <section className="how" id="how"><p className="eyebrow">HOW YARDLE ALLOCATES FAIRLY</p><div className="steps"><div><b>01</b><h3>You state your ceiling</h3><p>Use I Want or I Need. You always see the MMA snapshot first.</p></div><div><b>02</b><h3>Guardian evaluates</h3><p>Price, velocity and transaction history are screened in real time.</p></div><div><b>03</b><h3>XRPL escrow settles</h3><p>The eligible buyer nearest to Need Window expiry wins, then escrow protects both parties.</p></div></div></section>

      {mode && <IntentModal mode={mode} items={mode === "want" ? cart.filter((item) => selected.includes(item.id)) : []} onClose={() => setMode(null)} onSubmit={() => { setSubmitted(true); setMode(null); setCart([]); setSelected([]) }} />}
      {submitted && <div className="toast">Intent submitted. Guardian is watching for an eligible match. <button onClick={() => setSubmitted(false)}>×</button></div>}
    </main>
  )
}

function IntentModal({ mode, items, onClose, onSubmit }: { mode: IntentMode; items: Listing[]; onClose: () => void; onSubmit: () => void }) {
  const [needName, setNeedName] = useState("")
  const [needPrice, setNeedPrice] = useState(0)
  const [offers, setOffers] = useState<Record<string, number>>(() => Object.fromEntries(items.map((item) => [item.id, item.price])))
  const total = mode === "want" ? Object.values(offers).reduce((sum, price) => sum + price, 0) : needPrice
  const rows = mode === "want" ? items : [{ id: "need", title: needName || "Your requested item", mma: 0, emoji: "⌕" }]
  return <div className="backdrop" role="dialog" aria-modal="true"><section className="modal"><button className="close" onClick={onClose}>×</button><p className="eyebrow">{mode === "want" ? "CONFIRM YOUR INTENT" : "CREATE AN I NEED"}</p><h2>{mode === "want" ? "Set your maximum prices" : "Tell Yardle what you need"}</h2><p className="muted">Your price is a buyout ceiling, not an immediate charge. Guardian will match only safe, eligible listings.</p>{mode === "need" && <label className="field">What are you looking for?<input autoFocus value={needName} onChange={(event) => setNeedName(event.target.value)} placeholder="e.g. iPad Pro 11-inch" /></label>}<div className="offer-lines">{rows.map((item) => <div className="offer-line" key={item.id}><span>{item.emoji}</span><div><b>{item.title}</b><small>{mode === "want" ? `MMA snapshot: ${money(item.mma)}` : "MMA snapshot will be calculated on submission"}</small></div><label>Maximum price<input type="number" min="0" value={mode === "want" ? offers[item.id] : needPrice || ""} onChange={(event) => mode === "want" ? setOffers({ ...offers, [item.id]: Number(event.target.value) }) : setNeedPrice(Number(event.target.value))} /></label></div>)}</div><div className="intent-total"><span>{rows.length} buyer intent{rows.length === 1 ? "" : "s"} · Need Window: 90 days</span><b>Maximum total: {money(total)}</b></div><button className="primary full" disabled={mode === "need" && (!needName || !needPrice)} onClick={onSubmit}>Submit intent for Guardian review</button><small className="fine">By submitting, you allow Yardle to automatically begin XRPL escrow when an eligible listing is matched.</small></section></div>
}
