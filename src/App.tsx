import { useState } from "react"
import { demoStore, useDemoStore } from "./store/demoStore"
import { Modal } from "./components/ui"
import { AuthorizationPage } from "./pages/Authorization"
import { Marketplace } from "./pages/Marketplace"
import { CartPage } from "./pages/Cart"
import { NeedPage } from "./pages/Need"
import { SellPage } from "./pages/Sell"
import { ActivityPage } from "./pages/Activity"
import { WalletPage } from "./pages/Wallet"
import { NotificationsPage } from "./pages/Notifications"
import { TestnetPage } from "./pages/Testnet"

type Page = "market" | "cart" | "need" | "sell" | "activity" | "authorize" | "wallet" | "notifications" | "testnet"

export default function App() {
  const { state, corrupt, persistError } = useDemoStore()
  const [page, setPage] = useState<Page>("market")
  const [confirmReset, setConfirmReset] = useState(false)

  const current = state.personas.find((p) => p.id === state.currentPersonaId)!
  const cartCount = (state.carts[current.id] ?? []).length
  const unread = state.notifications.filter((n) => n.recipientId === current.id && !n.read).length
  const pendingAuth = state.proposals.filter(
    (p) => p.buyerId === current.id && p.status === "awaiting_authorization",
  ).length

  const mainNav: Array<{ id: Page; label: string; badge?: number }> = [
    { id: "market", label: "Marketplace" },
    { id: "need", label: "I Need" },
    { id: "sell", label: "Sell" },
    { id: "activity", label: "Activity" },
    { id: "notifications", label: "Notifications", badge: unread },
  ]
  const toolBtn = (id: Page) => (page === id ? "tool-btn active" : "tool-btn")

  return (
    <main>
      <div className="demo-strip">
        <span className="demo-dot" aria-hidden />
        {page === "testnet" ? "XRPL Testnet: real test-XRP payments, explicit payer authorization" : "Demo: automated rules, simulated payments"}
      </div>

      {corrupt && (
        <div className="corrupt-banner" role="alert">
          <span>Stored demo data is incompatible or corrupted.</span>
          <button
            onClick={() => {
              demoStore.reset()
            }}
          >
            Reset demo data
          </button>
        </div>
      )}

      {persistError && (
        <div className="corrupt-banner" role="alert">
          <span>Could not save demo state to this browser (storage may be full or blocked).</span>
          <button onClick={() => demoStore.clearPersistError()}>Dismiss</button>
        </div>
      )}

      <header className="topbar">
        <button className="brand" onClick={() => setPage("market")}>
          <span>●</span> yardle
        </button>

        {/* Product features */}
        <nav className="nav" aria-label="Primary">
          {mainNav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => setPage(n.id)}
            >
              {n.label}
              {n.badge !== undefined && n.badge > 0 && <b>{n.badge}</b>}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <label className="persona">
            <span>Persona</span>
            <select
              value={current.id}
              onChange={(e) => demoStore.dispatch({ type: "selectPersona", personaId: e.target.value })}
            >
              {state.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* User-related, persona-scoped */}
          <div className="tool-group persona-nav" aria-label="Your account">
            <button className={toolBtn("cart")} onClick={() => setPage("cart")}>
              Cart
              {cartCount > 0 && <b>{cartCount}</b>}
            </button>
            <button className={toolBtn("wallet")} onClick={() => setPage("wallet")}>
              Wallet
            </button>
          </div>

          {/* Demo/debug controls, separate from the product UI */}
          <div className="tool-group demo-nav" aria-label="Demo and debug controls">
            <button className={toolBtn("authorize")} onClick={() => setPage("authorize")}>
              Authorize
              {pendingAuth > 0 && <b>{pendingAuth}</b>}
            </button>
            <button className={toolBtn("testnet")} onClick={() => setPage("testnet")}>
              Testnet
            </button>
            <button className="reset" onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          </div>
        </div>
      </header>

      {page === "market" && <Marketplace />}
      {page === "cart" && <CartPage />}
      {page === "need" && <NeedPage />}
      {page === "sell" && <SellPage />}
      {page === "activity" && <ActivityPage />}
      {page === "authorize" && <AuthorizationPage />}
      {page === "wallet" && <WalletPage />}
      {page === "notifications" && <NotificationsPage />}
      {page === "testnet" && <TestnetPage />}

      <footer className="footer">
        Yardle — AI-guarded C2C marketplace prototype. The simulation uses Demo SGD and
        simulated escrow; the Testnet page performs real direct-XRP payments (test-only funds)
        through human-authorized agent execution.
      </footer>

      {confirmReset && (
        <Modal eyebrow="DEMO CONTROLS" title="Reset demo data?" onClose={() => setConfirmReset(false)}>
          <p className="muted">
            This restores the seeded catalog, balances, listings, requests, notifications, and
            cart to their original state. Your current progress will be discarded.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                demoStore.reset()
                setConfirmReset(false)
                setPage("market")
              }}
            >
              Yes, reset
            </button>
            <button className="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}
