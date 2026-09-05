import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, formatDate } from "../components/ui"
import { formatXrpDrops, parseXrp } from "../domain/money"

interface Health { model: boolean; networkReady: boolean; accounts: boolean; endpoint: string; modelName?: string }
interface Accounts { buyer: { address: string; balanceDrops: string }; seller: { address: string; balanceDrops: string }; refreshedAt: number }
interface Order {
  id: string; productTitle: string; condition: string; buyerAddress: string; sellerAddress: string;
  amountDrops: number; ceilingDrops: number; mmaDrops: number; minDrops: number; maxDrops: number;
  paymentStatus: string; reason?: string; txHash?: string; ledgerIndex?: number; explorerUrl?: string;
  expiresAt?: number; maxFeeDrops?: number; feeDrops?: string; fulfilledAt?: number; resultCode?: string;
  agentRequest?: string; agentTrace?: string[]; timeline: { at: number; label: string }[];
}
interface AgentResult { status: string; message: string; orderId?: string; toolTrace: string[] }
const pending = (o: Order) => ["awaiting_authorization", "authorized", "submitting", "uncertain"].includes(o.paymentStatus)
async function api<T>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  const value = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(value.error || `Request failed (${res.status})`)
  return value as T
}

export function TestnetPage() {
  const [token, setToken] = useState("")
  const [connected, setConnected] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [accounts, setAccounts] = useState<Accounts | null>(null)
  const [accountError, setAccountError] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [selected, setSelected] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [ceiling, setCeiling] = useState("3.8")
  const [request, setRequest] = useState("")
  const [agent, setAgent] = useState<AgentResult | null>(null)
  const order = orders.find(o => o.id === selected) ?? orders[0]
  const hasPending = orders.some(pending)

  const refresh = useCallback(async () => {
    const [h, session] = await Promise.all([api<Health>("/api/health"), api<{ authenticated: boolean }>("/api/session")])
    setHealth(h); setConnected(session.authenticated)
    if (!session.authenticated) { setOrders([]); setAccounts(null); return }
    setOrders(await api<Order[]>("/api/orders"))
    try { setAccounts(await api<Accounts>("/api/accounts")); setAccountError("") }
    catch (e) { setAccountError(e instanceof Error ? e.message : "Balance refresh failed") }
  }, [])
  useEffect(() => {
    // Remove the previous insecure token storage. Authentication now uses an
    // HttpOnly session cookie; no token is persisted or rendered by React.
    localStorage.removeItem("yardle.demo.session")
    void refresh().catch(e => setError(e.message))
  }, [refresh])
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => { void refresh().catch(e => setError(e.message)) }, 3000)
    return () => clearInterval(id)
  }, [connected, refresh])
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError("")
    try { await fn(); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); await refresh().catch(() => {}) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const perform = (kind: string) => action(async () => {
    if (!order) return
    await api(`/api/${kind}`, { orderId: order.id })
  })
  const exportReceipt = () => {
    if (!order) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(order, null, 2)], { type: "application/json" }))
    const a = document.createElement("a"); a.href = url; a.download = `yardle-${order.id}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="page">
    <p className="eyebrow">XRPL TESTNET</p><h1>Testnet payment</h1>
    <p className="lead">Real direct test-XRP payment. This page uses the configured payer and seller accounts; the simulation persona selector does not change these wallets.</p>
    {!connected ? <form onSubmit={e => { e.preventDefault(); void action(async () => {
      await api("/api/session", { token }); setToken("")
    }) }}>
      <label className="field">Demo session token
        <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Paste private token" />
      </label>
      <p className="muted">Copy it from the local .yardle-session-token file before recording. It is cleared after connecting.</p>
      <button className="primary" disabled={busy || !token}>Connect session</button>
    </form> : <div className="actions"><Badge tone="ok">Session connected</Badge>
      <button className="secondary" onClick={() => void action(async () => { await api("/api/session", undefined, "DELETE"); setAgent(null); setToken("") })}>Disconnect session</button>
      <button className="secondary" disabled={busy} onClick={() => void action(async () => {})}>Refresh status</button>
    </div>}
    {error && <div className="reason" role="alert">{error}</div>}
    {health && <div className="testnet-status">
      <Badge tone={health.networkReady ? "ok" : "warn"}>{health.networkReady ? "Testnet connected" : "Testnet unavailable"}</Badge>
      <Badge tone={health.model ? "ok" : "warn"}>{health.model ? `Agent ready: ${health.modelName ?? "configured"}` : "Agent not configured"}</Badge>
      <small>{health.endpoint}</small>
    </div>}
    {accountError && <p role="alert">Balance data is unavailable or stale: {accountError}</p>}
    {accounts && <><div className="wallet-grid">{(["buyer", "seller"] as const).map(role => <div className="wallet-card" key={role}>
      <h2>{role === "buyer" ? "Payer" : "Payee"}</h2><small style={{ overflowWrap: "anywhere" }}>{accounts[role].address}</small>
      <div className="wallet-balance"><span>Ledger balance</span><b>{formatXrpDrops(Number(accounts[role].balanceDrops))}</b></div>
    </div>)}</div><small>Balances refreshed {formatDate(accounts.refreshedAt)}</small></>}
    {connected && <>
      <article className="proposal-card" style={{ marginTop: 20 }}><h2>Ask the agent</h2>
        <label className="field">What do you need?
          <input value={request} onChange={e => setRequest(e.target.value)} placeholder="Find an iPhone 13 in good condition, up to 3.8 test XRP" maxLength={4000} />
        </label>
        <button className="primary" disabled={busy || hasPending || !health?.model || !request.trim()} onClick={() => void action(async () => {
          setAgent(null)
          const result = await api<AgentResult>("/api/agent/request", { request })
          setAgent(result); if (result.orderId) setSelected(result.orderId)
        })}>{busy ? "Working…" : "Ask the agent"}</button>
        {agent && <div className="reason"><b>{agent.status}</b> — {agent.message}<p style={{ overflowWrap: "anywhere" }}>{agent.toolTrace.join(" → ")}</p></div>}
        <small className="form-span">Agent pricing lookups use the paid x402 pricing oracle (600-drop fee from the buyer account, on-ledger). Free velocity allowance: 5 guarded requests/minute per account; over-limit requests are metered (MPP, 400 drops each).</small>
        {hasPending && <p>Resolve or decline your current proposal before starting another request.</p>}
      </article>
      {!hasPending && <form className="form-grid" style={{ marginTop: 20 }} onSubmit={e => { e.preventDefault(); void action(async () => {
        const drops = parseXrp(ceiling)
        if (drops === null) throw new Error("Enter a positive test-XRP amount with at most six decimals")
        const o = await api<Order>("/api/prepare", { productId: "phone-iphone-13", condition: "Good", ceilingDrops: drops })
        setSelected(o.id); setAgent(null)
      }) }}>
        <label className="field">Buyer maximum price (test XRP)<input value={ceiling} inputMode="decimal" onChange={e => setCeiling(e.target.value)} /></label>
        <button className="secondary" disabled={busy || parseXrp(ceiling) === null}>Prepare payment</button>
        <small className="form-span">Manual alternative: iPhone 13 (Good), MMA 4 XRP, range 2.8–5.2 XRP, asking 3.5 XRP. This fixed Testnet fixture is separate from simulated inventory. Preparing pays a 600-drop x402 pricing fee and meters over-limit requests at 400 drops (MPP).</small>
      </form>}
      {orders.length > 0 && <label className="field" style={{ marginTop: 24 }}>Order history
        <select value={order?.id ?? ""} onChange={e => setSelected(e.target.value)}>{orders.map(o => <option key={o.id} value={o.id}>{o.id} — {o.paymentStatus}{o.fulfilledAt ? " / received" : ""}</option>)}</select>
      </label>}
      {order && <article className="proposal-card">
        <h2>{order.productTitle}</h2><p style={{ overflowWrap: "anywhere" }}>{order.id} · {order.condition}</p>
        <Badge tone={order.paymentStatus === "validated" ? "ok" : order.paymentStatus === "payment_failed" ? "danger" : "info"}>{order.paymentStatus}{order.fulfilledAt ? " — item received" : ""}</Badge>
        <div className="proposal-grid">{[
          ["Amount", formatXrpDrops(order.amountDrops)], ["Your ceiling", formatXrpDrops(order.ceilingDrops)],
          ["MMA", formatXrpDrops(order.mmaDrops)], ["Accepted range", `${formatXrpDrops(order.minDrops)}–${formatXrpDrops(order.maxDrops)}`],
          ["Payer", order.buyerAddress], ["Payee", order.sellerAddress],
          ["Maximum fee", formatXrpDrops(order.maxFeeDrops ?? 1000)], ["Payment type", "Direct XRP Payment — Testnet"],
        ].map(([label, value]) => <div key={label}><span>{label}</span><b style={{ overflowWrap: "anywhere" }}>{value}</b></div>)}</div>
        {order.reason && <p role="status">{order.reason}</p>}
        {order.paymentStatus === "awaiting_authorization" && <>
          <p>Expires {formatDate(order.expiresAt ?? 0)}. Only this exact payment is authorized; no escrow protection is provided.</p>
          <div className="actions"><button className="primary" disabled={busy || !health?.networkReady} onClick={() => void perform("authorize")}>Authorize {formatXrpDrops(order.amountDrops)}</button>
            <button className="secondary" disabled={busy} onClick={() => void perform("decline")}>Decline</button></div>
        </>}
        {["authorized", "submitting", "uncertain"].includes(order.paymentStatus) && <p>Waiting for ledger confirmation. Do not send another payment or reset the operation.</p>}
        {order.paymentStatus === "validated" && !order.fulfilledAt && <button className="primary" disabled={busy} onClick={() => void perform("received")}>Confirm item received</button>}
        {order.fulfilledAt && <p>Physical handoff simulated. No additional XRP was sent.</p>}
        {order.txHash && <div style={{ overflowWrap: "anywhere", marginTop: 16 }}>
          <p>Transaction: {order.txHash}</p><p>Result: {order.resultCode ?? "Awaiting validation"} · Ledger: {order.ledgerIndex ?? "pending"} · Fee: {order.feeDrops ? formatXrpDrops(Number(order.feeDrops)) : "not yet recorded"}</p>
          {order.explorerUrl && <a href={order.explorerUrl} target="_blank" rel="noreferrer">View on explorer</a>}
        </div>}
        {order.agentRequest && <details><summary>Agent request and actions</summary><p>{order.agentRequest}</p><p style={{ overflowWrap: "anywhere" }}>{order.agentTrace?.join(" → ")}</p></details>}
        <details className="timeline"><summary>Timeline ({order.timeline.length})</summary><ul>{order.timeline.map((event, i) => <li key={i}>{formatDate(event.at)} — {event.label}</li>)}</ul></details>
        <button className="secondary" onClick={exportReceipt}>Download order receipt</button>
      </article>}
    </>}
  </section>
}
