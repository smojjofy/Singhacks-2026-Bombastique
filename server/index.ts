import http from "node:http"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Client, Wallet } from "xrpl"
import { loadEnv, readConfig, readiness } from "./config"
import { JsonStore, type TestnetOrder } from "./store"
import { issueSessionToken, safeEqual } from "./session"
import { preparePayment, submitAndTrack, reconcileByHash, type SubmitOutcome } from "./payments/executor"
import { prepareOrder } from "./payments/prepare"
import { changeOrder, claimAuthorization, listOrders, unresolved } from "./payments/actions"
import { runAgent } from "./agent/runtime"
import { OpenAICompatibleProvider } from "./agent/provider"

loadEnv()
const config = readConfig()
const token = process.env.DEMO_SESSION_TOKEN || issueSessionToken()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const store = new JsonStore(path.join(root, ".yardle-testnet-state.json"))
const client = new Client(config.endpoint, { timeout: 15_000 })
const model = config.modelApiKey && config.modelBaseUrl && config.modelName
  ? new OpenAICompatibleProvider({ apiKey: config.modelApiKey, baseUrl: config.modelBaseUrl, model: config.modelName }) : null
const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"])
const active = new Set<string>()

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}
function authorized(req: http.IncomingMessage) {
  const cookie = /(?:^|;\s*)yardle_session=([^;]*)/.exec(req.headers.cookie ?? "")?.[1] ?? ""
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "")
  return [cookie, bearer, String(req.headers["x-demo-session"] ?? "")].some(v => !!v && safeEqual(v, token))
}
async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  let data = ""
  for await (const chunk of req) {
    data += chunk
    if (Buffer.byteLength(data) > 16_384) throw new Error("Request too large")
  }
  const value: unknown = JSON.parse(data || "{}")
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request")
  return value as Record<string, unknown>
}
function publicOrder(o: TestnetOrder) {
  const { txBlob: _private, ...value } = o
  return value
}
async function patchOrder(id: string, fn: (o: TestnetOrder) => void) {
  return store.update(data => {
    const o = data.orders.find(x => x.id === id)
    if (!o) throw new Error("Order not found")
    fn(o)
    return publicOrder(o)
  })
}
async function recordOutcome(id: string, outcome: SubmitOutcome) {
  return patchOrder(id, o => {
    o.paymentStatus = outcome.status === "validated" ? "validated" : outcome.status === "uncertain" ? "uncertain" : "payment_failed"
    o.resultCode = outcome.resultCode
    o.ledgerIndex = outcome.ledgerIndex
    o.explorerUrl = `https://testnet.xrpl.org/transactions/${outcome.hash}`
    o.reason = outcome.resultMessage
    o.timeline.push({ at: Date.now(), label: outcome.status === "validated" ? "Validated — payment complete" : `Payment ${outcome.status}` })
  })
}
async function execute(id: string) {
  let signed = false
  try {
    const o = (await store.read()).orders.find(x => x.id === id)!
    const wallet = Wallet.fromSeed(config.buyerSecret)
    if (wallet.address !== o.buyerAddress) throw new Error("Signer/account mismatch")
    const prepared = await preparePayment(client, wallet, o.sellerAddress, o.amountDrops, `yardle order ${o.id}`, o.maxFeeDrops)
    await patchOrder(id, current => {
      current.txHash = prepared.hash
      current.txBlob = prepared.tx_blob
      current.lastLedgerSequence = prepared.lastLedgerSequence
      current.feeDrops = prepared.fee
      current.paymentStatus = "submitting"
      current.timeline.push({ at: Date.now(), label: "Signed and persisted — submitting to Testnet" })
    })
    signed = true
    await recordOutcome(id, await submitAndTrack(client, prepared))
  } catch (error) {
    await patchOrder(id, o => {
      o.paymentStatus = signed ? "uncertain" : "payment_failed"
      o.reason = signed ? "Outcome uncertain. Reconciling the existing hash; do not send a replacement." : error instanceof Error ? error.message : "Preparation failed"
      o.timeline.push({ at: Date.now(), label: signed ? "Awaiting reconciliation" : "Payment not submitted" })
    }).catch(() => console.error("Could not persist payment outcome; preserve the Testnet state file."))
  } finally { active.delete(id) }
}
let reconciling = false
async function reconcile() {
  if (reconciling || !client.isConnected()) return
  reconciling = true
  try {
    for (const o of (await store.read()).orders) {
      if (!unresolved(o) || active.has(o.id)) continue
      if (!o.txHash) {
        await patchOrder(o.id, x => { x.paymentStatus = "payment_failed"; x.reason = "Interrupted before signing; no transaction submitted" })
      } else {
        const result = await reconcileByHash(client, o.txHash)
        if (result) await recordOutcome(o.id, result)
        else if (o.paymentStatus !== "uncertain") await patchOrder(o.id, x => { x.paymentStatus = "uncertain" })
      }
    }
  } finally { reconciling = false }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.headers.origin && !origins.has(req.headers.origin)) return json(res, 403, { error: "Unexpected origin" })
  const p = new URL(req.url ?? "/", "http://localhost").pathname
  if (req.method === "GET" && p === "/api/session") return json(res, 200, { authenticated: authorized(req) })
  if (req.method === "POST" && p === "/api/session") {
    const b = await body(req)
    if (!safeEqual(String(b.token ?? ""), token)) return json(res, 401, { error: "Invalid demo session" })
    res.setHeader("Set-Cookie", `yardle_session=${token}; HttpOnly; SameSite=Strict; Path=/api`)
    return json(res, 200, { authenticated: true })
  }
  if (req.method === "DELETE" && p === "/api/session") {
    res.setHeader("Set-Cookie", "yardle_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0")
    return json(res, 200, { authenticated: false })
  }
  if (req.method === "GET" && p === "/api/health") return json(res, 200, {
    ok: true, ...readiness(config), model: !!model, networkReady: client.isConnected(), modelName: config.modelName,
  })
  if (!authorized(req)) return json(res, 401, { error: "Connect your demo session to view Testnet orders" })
  if (req.method === "GET" && p === "/api/accounts") {
    if (!client.isConnected()) return json(res, 503, { error: "Testnet network not ready" })
    const [b, s] = await Promise.all([
      client.request({ command: "account_info", account: config.buyerAddress, ledger_index: "validated" }),
      client.request({ command: "account_info", account: config.sellerAddress, ledger_index: "validated" }),
    ])
    return json(res, 200, {
      buyer: { address: config.buyerAddress, balanceDrops: b.result.account_data.Balance },
      seller: { address: config.sellerAddress, balanceDrops: s.result.account_data.Balance }, refreshedAt: Date.now(),
    })
  }
  if (req.method === "GET" && p === "/api/orders") return json(res, 200, (await listOrders(store)).map(publicOrder).reverse())
  if (req.method === "GET" && p.startsWith("/api/orders/")) {
    const o = (await listOrders(store)).find(x => x.id === p.slice("/api/orders/".length))
    return o ? json(res, 200, publicOrder(o)) : json(res, 404, { error: "Order not found" })
  }
  if (req.method === "POST" && p === "/api/prepare") {
    const b = await body(req)
    const r = await prepareOrder(store, config.buyerAddress, config.sellerAddress, String(b.productId ?? ""), String(b.condition ?? "") as never, Number(b.ceilingDrops))
    return r.ok ? json(res, 201, publicOrder(r.order!)) : json(res, 400, { error: r.error })
  }
  if (req.method === "POST" && p === "/api/agent/request") {
    if (!model) return json(res, 503, { error: "Agnes is not configured. Check the server-side env file." })
    const b = await body(req)
    const request = String(b.request ?? "").trim()
    if (!request || request.length > 4000) return json(res, 400, { error: "Enter a request of 1–4000 characters" })
    if ((await listOrders(store)).some(o => ["awaiting_authorization", "authorized", "submitting", "uncertain"].includes(o.paymentStatus))) {
      return json(res, 409, { error: "Resolve or decline your existing payment proposal first" })
    }
    const r = await runAgent(request, { store, buyerAddress: config.buyerAddress, sellerAddress: config.sellerAddress }, model)
    if (r.orderId) await patchOrder(r.orderId, o => { o.agentRequest = request; o.agentTrace = r.toolTrace })
    return json(res, 200, r)
  }
  if (req.method === "POST" && p === "/api/authorize") {
    if (!client.isConnected()) return json(res, 503, { error: "Testnet network not ready" })
    if (!config.buyerSecret) return json(res, 503, { error: "Testnet payer not configured" })
    const b = await body(req)
    const o = await claimAuthorization(store, String(b.orderId ?? ""), config.buyerAddress, config.sellerAddress)
    active.add(o.id)
    void execute(o.id)
    return json(res, 202, publicOrder(o))
  }
  if (req.method === "POST" && ["/api/decline", "/api/received"].includes(p)) {
    const b = await body(req)
    return json(res, 200, publicOrder(await changeOrder(store, String(b.orderId ?? ""), p === "/api/decline" ? "decline" : "received", config.buyerAddress)))
  }
  return json(res, 404, { error: "Not found" })
}

async function main() {
  await store.read()
  await fs.writeFile(path.join(root, ".yardle-session-token"), token, { mode: 0o600 })
  console.log("Demo session token saved to .yardle-session-token. Connect once before recording; do not share this file.")
  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => json(res, 400, { error: error instanceof Error ? error.message : "Request failed" }))
  })
  server.listen(config.port, config.host, () => console.log(`Yardle local service on http://${config.host}:${config.port}`))
  try { await client.connect(); await reconcile() }
  catch { console.error("Testnet connection unavailable; the service remains available for setup.") }
  let reconnecting = false
  setInterval(() => {
    if (!client.isConnected() && !reconnecting) {
      reconnecting = true
      void client.connect().catch(() => {}).finally(() => { reconnecting = false })
    } else void reconcile().catch(() => console.error("Reconciliation unavailable; pending payments remain reserved."))
  }, 5000).unref()
}
main().catch(() => { console.error("Server startup failed. Check configuration and preserve the Testnet state file."); process.exitCode = 1 })
