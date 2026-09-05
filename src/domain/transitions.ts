// Command layer: every mutation becomes one validated, complete next state.
// All money movement and status changes happen here; components never mutate
// balances directly. See PLANNING.md sections 5 and 6.

import { AUTHORIZATION_WINDOW_MS, CURRENCY, NEED_WINDOW_DAYS, CONDITIONS } from "./config"
import { availableCents } from "./balances"
import { byListingPriority, eligibleIntentsForListing, isExpired } from "./matching"
import { moveMarketPrice, snapshotFromMarket, isWithinInterval, rejectionReason } from "./valuation"
import { isValidCents } from "./money"
import type { PaymentProvider } from "../payments/PaymentProvider"
import type {
  BuyerIntent,
  CartLine,
  Command,
  Condition,
  DemoState,
  IntentSource,
  IntentStatus,
  LedgerEntry,
  Listing,
  Notification,
  Order,
  Proposal,
  ProposalStatus,
} from "./types"

let idCounter = 0
export function newId(prefix: string): string {
  idCounter += 1
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`
}

function isActor(state: DemoState, actorId: string): boolean {
  return state.personas.some((p) => p.id === actorId)
}

function notify(
  state: DemoState,
  recipientId: string,
  eventRef: string,
  message: string,
  at: number,
): DemoState {
  const n: Notification = { id: newId("notif"), recipientId, eventRef, message, at, read: false }
  return { ...state, notifications: [n, ...state.notifications] }
}

function updateListingById(state: DemoState, id: string, patch: Partial<Listing>): DemoState {
  return { ...state, listings: state.listings.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}
function updateIntentById(state: DemoState, id: string, patch: Partial<BuyerIntent>): DemoState {
  return { ...state, intents: state.intents.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
}
function updateOrderById(state: DemoState, id: string, patch: Partial<Order>): DemoState {
  return { ...state, orders: state.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) }
}
function updateProposalById(state: DemoState, id: string, patch: Partial<Proposal>): DemoState {
  return { ...state, proposals: state.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
}

// ---------------------------------------------------------------------------
// Core intent/listing creation (shared by single submit and cart checkout)
// ---------------------------------------------------------------------------

function doSubmitIntent(
  state: DemoState,
  buyerId: string,
  source: IntentSource,
  productId: string,
  condition: Condition,
  ceilingCents: number,
  now: number,
  targetListingId?: string,
): { state: DemoState; intent: BuyerIntent } {
  if (!isValidCents(ceilingCents) || !CONDITIONS.includes(condition)) return { state, intent: null as never }
  const product = state.catalog.find((p) => p.id === productId)
  if (!product) return { state, intent: null as never }

  const snapshot = snapshotFromMarket(productId, condition, state.marketPrices, state.sales)
  const expiresAt = now + NEED_WINDOW_DAYS * 86_400_000
  const base: BuyerIntent = {
    id: newId("intent"),
    buyerId,
    source,
    productId,
    condition,
    targetListingId,
    ceilingCents,
    snapshot,
    status: "searching",
    timeline: [{ at: now, label: "Intent submitted" }],
    createdAt: now,
    expiresAt,
  }

  if (!isWithinInterval(ceilingCents, snapshot)) {
    const reason = rejectionReason(ceilingCents, snapshot)!
    const intent: BuyerIntent = { ...base, status: "rejected", reason }
    let next = { ...state, intents: [intent, ...state.intents] }
    next = notify(next, buyerId, intent.id, `Buyer request rejected: ${reason}`, now)
    return { state: next, intent }
  }

  const intent: BuyerIntent = base
  let next = { ...state, intents: [intent, ...state.intents] }
  next = notify(next, buyerId, intent.id, "Approved - searching for a match", now)
  return { state: next, intent }
}

function doCreateListing(
  state: DemoState,
  sellerId: string,
  productId: string,
  condition: Condition,
  amountCents: number,
  now: number,
): { state: DemoState; listing: Listing } {
  if (!isValidCents(amountCents) || !CONDITIONS.includes(condition)) return { state, listing: null as never }
  const product = state.catalog.find((p) => p.id === productId)
  if (!product) return { state, listing: null as never }

  const snapshot = snapshotFromMarket(productId, condition, state.marketPrices, state.sales)
  const base: Listing = {
    id: newId("listing"),
    sellerId,
    productId,
    condition,
    amountCents,
    snapshot,
    status: "live",
    timeline: [{ at: now, label: "Listing submitted" }],
    createdAt: now,
    updatedAt: now,
  }

  if (!isWithinInterval(amountCents, snapshot)) {
    const reason = rejectionReason(amountCents, snapshot)!
    const listing: Listing = { ...base, status: "rejected", reason }
    let next = { ...state, listings: [listing, ...state.listings] }
    next = notify(next, sellerId, listing.id, `Listing rejected: ${reason}`, now)
    return { state: next, listing }
  }

  const listing: Listing = base
  let next = { ...state, listings: [listing, ...state.listings] }
  next = notify(next, sellerId, listing.id, "Listing published (auto-approved)", now)
  // Stock-like MMA: an accepted listing pushes the market price up, scaled by
  // where the ask sits in the accepted interval.
  next = {
    ...next,
    marketPrices: moveMarketPrice(next.marketPrices, productId, amountCents, condition, 1, next.sales),
  }
  return { state: next, listing }
}

// ---------------------------------------------------------------------------
// Matching / funding
// ---------------------------------------------------------------------------

export function expireIntents(state: DemoState, now: number): DemoState {
  const expired = state.intents.filter((i) => i.status === "searching" && i.expiresAt <= now)
  if (expired.length === 0) return state
  let s = state
  for (const intent of expired) {
    s = updateIntentById(s, intent.id, {
      status: "expired",
      timeline: [...intent.timeline, { at: now, label: "Need Window expired" }],
    })
    s = notify(s, intent.buyerId, intent.id, "Need Window expired", now)
  }
  return s
}

function createProposal(state: DemoState, listing: Listing, intent: BuyerIntent, now: number): DemoState {
  const proposalId = newId("proposal")
  const proposal: Proposal = {
    id: proposalId,
    listingId: listing.id,
    intentId: intent.id,
    buyerId: intent.buyerId,
    sellerId: listing.sellerId,
    productId: listing.productId,
    condition: listing.condition,
    amountCents: listing.amountCents,
    currency: CURRENCY,
    snapshot: listing.snapshot,
    status: "awaiting_authorization",
    timeline: [{ at: now, label: "Payment proposal prepared — awaiting authorization" }],
    createdAt: now,
    expiresAt: Math.min(now + AUTHORIZATION_WINDOW_MS, intent.expiresAt),
  }

  let s: DemoState = { ...state, proposals: [proposal, ...state.proposals] }
  s = updateListingById(s, listing.id, {
    status: "reserved",
    activeProposalId: proposalId,
    timeline: [...listing.timeline, { at: now, label: "Reserved — awaiting buyer authorization" }],
  })
  s = updateIntentById(s, intent.id, {
    status: "reserved",
    activeProposalId: proposalId,
    timeline: [...intent.timeline, { at: now, label: "Eligible match found — awaiting authorization" }],
  })
  s = notify(s, intent.buyerId, proposalId, "Payment proposal ready — authorize to proceed", now)
  s = notify(s, listing.sellerId, proposalId, "Eligible buyer matched — awaiting authorization", now)
  return s
}

function closeProposal(
  state: DemoState,
  proposal: Proposal,
  listing: Listing | undefined,
  intent: BuyerIntent | undefined,
  proposalStatus: ProposalStatus,
  intentStatus: IntentStatus,
  reason: string,
  now: number,
): DemoState {
  let s = updateProposalById(state, proposal.id, {
    status: proposalStatus,
    reason,
    timeline: [...proposal.timeline, { at: now, label: `Proposal ${proposalStatus}` }],
  })
  if (listing) {
    s = updateListingById(s, listing.id, {
      status: "live",
      activeProposalId: undefined,
      timeline: [...listing.timeline, { at: now, label: "Reservation released" }],
    })
  }
  if (intent) {
    s = updateIntentById(s, intent.id, {
      status: intentStatus,
      reason,
      activeProposalId: undefined,
      timeline: [...intent.timeline, { at: now, label: `Proposal ${proposalStatus}` }],
    })
  }
  return s
}

export function expireProposals(state: DemoState, now: number): DemoState {
  const due = state.proposals.filter((p) => p.status === "awaiting_authorization" && p.expiresAt <= now)
  if (due.length === 0) return state
  let s = state
  for (const p of due) {
    const listing = s.listings.find((l) => l.id === p.listingId)
    const intent = s.intents.find((i) => i.id === p.intentId)
    s = closeProposal(s, p, listing, intent, "expired", "cancelled", "Authorization window expired", now)
    s = notify(s, p.buyerId, p.id, "Authorization window expired", now)
    s = notify(s, p.sellerId, p.id, "Authorization window expired — listing released", now)
  }
  return s
}

function authorizeProposal(
  state: DemoState,
  actorId: string,
  proposalId: string,
  now: number,
  provider: PaymentProvider,
): DemoState {
  const proposal = state.proposals.find((p) => p.id === proposalId)
  if (!proposal || proposal.status !== "awaiting_authorization") return state
  if (proposal.buyerId !== actorId) return state
  const listing = state.listings.find((l) => l.id === proposal.listingId)
  const intent = state.intents.find((i) => i.id === proposal.intentId)
  // Revalidate ownership, policy, availability, and the unchanged proposal.
  if (!listing || listing.status !== "reserved" || listing.activeProposalId !== proposalId) return state
  if (!intent || intent.status !== "reserved" || intent.activeProposalId !== proposalId) return state
  if (listing.sellerId === intent.buyerId) return state
  if (now >= proposal.expiresAt) return state
  if (!isWithinInterval(listing.amountCents, listing.snapshot)) return state
  if (!isWithinInterval(intent.ceilingCents, intent.snapshot)) return state
  if (intent.ceilingCents < listing.amountCents) return state

  const available = availableCents(state, intent.buyerId)
  const outcome = provider.fund(listing.amountCents, available)
  if (!outcome.ok) {
    const reason = outcome.reason ?? "Insufficient funds"
    let s = updateProposalById(state, proposal.id, {
      status: "declined",
      reason,
      timeline: [...proposal.timeline, { at: now, label: "Authorization failed — insufficient funds" }],
    })
    s = updateListingById(s, listing.id, {
      status: "live",
      activeProposalId: undefined,
      timeline: [...listing.timeline, { at: now, label: "Reservation released — funding failed" }],
    })
    s = updateIntentById(s, intent.id, {
      status: "funding_failed",
      reason,
      activeProposalId: undefined,
      timeline: [...intent.timeline, { at: now, label: "Funding failed" }],
    })
    s = notify(s, intent.buyerId, proposal.id, `Funding failed: ${reason}`, now)
    s = notify(s, listing.sellerId, proposal.id, "Buyer funding failed — listing released", now)
    return s
  }
  return fundOrder(state, listing, intent, proposal.id, now)
}

function declineProposal(state: DemoState, actorId: string, proposalId: string, now: number): DemoState {
  const proposal = state.proposals.find((p) => p.id === proposalId)
  if (!proposal || proposal.status !== "awaiting_authorization") return state
  if (proposal.buyerId !== actorId) return state
  const listing = state.listings.find((l) => l.id === proposal.listingId)
  const intent = state.intents.find((i) => i.id === proposal.intentId)
  let s = closeProposal(
    state,
    proposal,
    listing,
    intent,
    "declined",
    "cancelled",
    "Buyer declined payment authorization",
    now,
  )
  s = notify(s, proposal.buyerId, proposal.id, "Payment declined", now)
  s = notify(s, proposal.sellerId, proposal.id, "Buyer declined — listing released", now)
  return s
}

function fundOrder(
  state: DemoState,
  listing: Listing,
  intent: BuyerIntent,
  proposalId: string,
  now: number,
): DemoState {
  const orderId = newId("order")
  const order: Order = {
    id: orderId,
    listingId: listing.id,
    intentId: intent.id,
    buyerId: intent.buyerId,
    sellerId: listing.sellerId,
    productId: listing.productId,
    condition: listing.condition,
    amountCents: listing.amountCents,
    currency: CURRENCY,
    snapshot: listing.snapshot,
    status: "escrow",
    timeline: [{ at: now, label: "Escrow funded (simulated)" }],
    createdAt: now,
  }
  const fundEntry: LedgerEntry = {
    id: newId("ledger"),
    orderId,
    personaId: intent.buyerId,
    kind: "fund",
    amountCents: listing.amountCents,
    counterpartyId: listing.sellerId,
    at: now,
  }

  let s: DemoState = {
    ...state,
    orders: [order, ...state.orders],
    ledger: [...state.ledger, fundEntry],
  }
  s = updateListingById(s, listing.id, {
    status: "escrow",
    activeOrderId: orderId,
    activeProposalId: undefined,
    timeline: [...listing.timeline, { at: now, label: "Escrow funded (simulated)" }],
  })
  s = updateIntentById(s, intent.id, {
    status: "escrow",
    activeOrderId: orderId,
    activeProposalId: undefined,
    timeline: [...intent.timeline, { at: now, label: "Authorized — escrow funded" }],
  })
  s = updateProposalById(s, proposalId, {
    status: "authorized",
    authorizedAt: now,
    timeline: [...(state.proposals.find((p) => p.id === proposalId)?.timeline ?? []), { at: now, label: "Authorized — escrow funded" }],
  })
  s = notify(s, intent.buyerId, orderId, "Escrow funded (simulated)", now)
  s = notify(s, listing.sellerId, orderId, "Authorization approved — escrow funded (simulated)", now)
  return s
}

export function runMatching(state: DemoState, now: number, provider: PaymentProvider): DemoState {
  let s = expireIntents(state, now)
  s = expireProposals(s, now)
  const liveListings = s.listings.filter((l) => l.status === "live").sort(byListingPriority)
  for (const listing of liveListings) {
    const eligible = eligibleIntentsForListing(s.intents, listing, now)
    if (eligible.length === 0) continue
    // Reserve the best eligible intent; funding happens on explicit authorization.
    s = createProposal(s, listing, eligible[0], now)
  }
  return s
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function addToCart(state: DemoState, actorId: string, listingId: string, now: number): DemoState {
  const listing = state.listings.find((l) => l.id === listingId)
  if (!listing || listing.status !== "live") return state
  const cart = state.carts[actorId] ?? []
  if (cart.some((c) => c.listingId === listingId)) return state
  const line: CartLine = { listingId, addedAt: now, selected: true }
  return { ...state, carts: { ...state.carts, [actorId]: [...cart, line] } }
}

function checkoutCart(
  state: DemoState,
  buyerId: string,
  lines: Array<{ listingId: string; ceilingCents: number }>,
  now: number,
): DemoState {
  let next = state
  const cart = next.carts[buyerId] ?? []
  const approvedListingIds = new Set<string>()
  for (const line of lines) {
    const listing = next.listings.find((l) => l.id === line.listingId)
    if (!listing || listing.status !== "live" || !isWithinInterval(listing.amountCents, listing.snapshot)) {
      // Stale cart line: record a rejected intent with a clear reason, keep the line.
      const productId = listing?.productId ?? ""
      const condition = listing?.condition ?? ("Good" as Condition)
      const snapshot =
        listing?.snapshot ?? snapshotFromMarket(productId, condition, next.marketPrices, next.sales)
      const intent: BuyerIntent = {
        id: newId("intent"),
        buyerId,
        source: "want",
        productId,
        condition,
        targetListingId: line.listingId,
        ceilingCents: line.ceilingCents,
        snapshot,
        status: "rejected",
        reason: "This listing is no longer available for purchase.",
        timeline: [{ at: now, label: "Intent submitted — listing unavailable" }],
        createdAt: now,
        expiresAt: now + NEED_WINDOW_DAYS * 86_400_000,
      }
      next = { ...next, intents: [intent, ...next.intents] }
      next = notify(next, buyerId, intent.id, "Buyer request rejected: listing no longer available", now)
      continue
    }
    const { state: after, intent } = doSubmitIntent(
      next,
      buyerId,
      "want",
      listing.productId,
      listing.condition,
      line.ceilingCents,
      now,
      line.listingId,
    )
    next = after
    if (intent && intent.status === "searching") approvedListingIds.add(line.listingId)
  }
  const remaining = cart
    .filter((c) => !approvedListingIds.has(c.listingId))
    .map((c) => ({ ...c, selected: false }))
  next = { ...next, carts: { ...next.carts, [buyerId]: remaining } }
  return next
}

function editListing(state: DemoState, actorId: string, listingId: string, amountCents: number, now: number): DemoState {
  const listing = state.listings.find((l) => l.id === listingId)
  if (!listing || listing.sellerId !== actorId) return state
  if (listing.status === "escrow" || listing.status === "sold") return state
  if (!isValidCents(amountCents)) return state

  if (!isWithinInterval(amountCents, listing.snapshot)) {
    const reason = rejectionReason(amountCents, listing.snapshot)!
    let next = updateListingById(state, listingId, {
      amountCents,
      status: "rejected",
      reason,
      updatedAt: now,
      timeline: [...listing.timeline, { at: now, label: "Price edited — rejected" }],
    })
    next = notify(next, listing.sellerId, listingId, `Listing delisted: ${reason}`, now)
    return next
  }

  let next = updateListingById(state, listingId, {
    amountCents,
    status: "live",
    reason: undefined,
    updatedAt: now,
    timeline: [...listing.timeline, { at: now, label: "Price edited — re-published" }],
  })
  next = notify(next, listing.sellerId, listingId, "Listing price updated (auto-approved)", now)
  // A re-published ask is a listing event: move the market price up with it.
  next = {
    ...next,
    marketPrices: moveMarketPrice(next.marketPrices, listing.productId, amountCents, listing.condition, 1, next.sales),
  }
  return next
}

function confirmReceipt(state: DemoState, actorId: string, orderId: string, now: number): DemoState {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order || order.status !== "escrow") return state
  if (order.buyerId !== actorId) return state
  const releaseEntry: LedgerEntry = {
    id: newId("ledger"),
    orderId: order.id,
    personaId: order.sellerId,
    kind: "release",
    amountCents: order.amountCents,
    counterpartyId: order.buyerId,
    at: now,
  }
  const listing = state.listings.find((l) => l.id === order.listingId)
  const intent = state.intents.find((i) => i.id === order.intentId)
  let next: DemoState = { ...state, ledger: [...state.ledger, releaseEntry] }
  next = updateOrderById(next, order.id, {
    status: "complete",
    timeline: [...order.timeline, { at: now, label: "Receipt confirmed — escrow released" }],
  })
  if (listing) {
    next = updateListingById(next, listing.id, {
      status: "sold",
      timeline: [...listing.timeline, { at: now, label: "Sold — escrow released to seller" }],
    })
  }
  if (intent) {
    next = updateIntentById(next, intent.id, {
      status: "complete",
      timeline: [...intent.timeline, { at: now, label: "Receipt confirmed — transaction complete" }],
    })
  }
  next = notify(next, order.buyerId, order.id, "Sale complete — escrow released to seller", now)
  next = notify(next, order.sellerId, order.id, "Sale complete — funds received", now)
  // Stock-like MMA: a completed sale pushes the market price down, scaled by
  // where the sale price sits in today's accepted interval.
  next = {
    ...next,
    marketPrices: moveMarketPrice(next.marketPrices, order.productId, order.amountCents, order.condition, -1, next.sales),
  }
  return next
}

function cancelOrder(state: DemoState, actorId: string, orderId: string, now: number): DemoState {
  const order = state.orders.find((o) => o.id === orderId)
  if (!order || order.status !== "escrow") return state
  if (order.buyerId !== actorId) return state
  const refundEntry: LedgerEntry = {
    id: newId("ledger"),
    orderId: order.id,
    personaId: order.buyerId,
    kind: "refund",
    amountCents: order.amountCents,
    counterpartyId: order.sellerId,
    at: now,
  }
  const listing = state.listings.find((l) => l.id === order.listingId)
  const intent = state.intents.find((i) => i.id === order.intentId)
  let next: DemoState = { ...state, ledger: [...state.ledger, refundEntry] }
  next = updateOrderById(next, order.id, {
    status: "cancelled",
    timeline: [...order.timeline, { at: now, label: "Cancelled — refunded to buyer" }],
  })
  if (listing) {
    const relisted = isWithinInterval(listing.amountCents, listing.snapshot) ? "live" : "rejected"
    next = updateListingById(next, listing.id, {
      status: relisted,
      activeOrderId: undefined,
      timeline: [...listing.timeline, { at: now, label: "Relisted after refund" }],
    })
  }
  if (intent) {
    next = updateIntentById(next, intent.id, {
      status: "cancelled",
      activeOrderId: undefined,
      timeline: [...intent.timeline, { at: now, label: "Order cancelled — refunded" }],
    })
  }
  next = notify(next, order.buyerId, order.id, "Order cancelled — refunded", now)
  next = notify(next, order.sellerId, order.id, "Order cancelled — listing relisted", now)
  return next
}

function cancelIntent(state: DemoState, actorId: string, intentId: string, now: number): DemoState {
  const intent = state.intents.find((i) => i.id === intentId)
  if (!intent || intent.status !== "searching") return state
  if (intent.buyerId !== actorId) return state
  let next = updateIntentById(state, intentId, {
    status: "cancelled",
    timeline: [...intent.timeline, { at: now, label: "Cancelled by buyer" }],
  })
  next = notify(next, intent.buyerId, intentId, "Intent cancelled", now)
  return next
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(state: DemoState, cmd: Command, now: number, provider: PaymentProvider): DemoState {
  // selectPersona is the only command without an explicit actor.
  if (cmd.type !== "selectPersona" && !isActor(state, cmd.actorId)) return state

  let next = state
  let shouldMatch = false

  switch (cmd.type) {
    case "selectPersona":
      if (state.personas.some((p) => p.id === cmd.personaId)) next = { ...state, currentPersonaId: cmd.personaId }
      break
    case "addToCart":
      next = addToCart(state, cmd.actorId, cmd.listingId, now)
      break
    case "removeFromCart": {
      const cart = (state.carts[cmd.actorId] ?? []).filter((c) => c.listingId !== cmd.listingId)
      next = { ...state, carts: { ...state.carts, [cmd.actorId]: cart } }
      break
    }
    case "setCartSelected": {
      const cart = (state.carts[cmd.actorId] ?? []).map((c) =>
        c.listingId === cmd.listingId ? { ...c, selected: cmd.selected } : c,
      )
      next = { ...state, carts: { ...state.carts, [cmd.actorId]: cart } }
      break
    }
    case "submitIntent": {
      const res = doSubmitIntent(
        state,
        cmd.actorId,
        cmd.source,
        cmd.productId,
        cmd.condition,
        cmd.ceilingCents,
        now,
        cmd.targetListingId,
      )
      next = res.state
      shouldMatch = true
      break
    }
    case "checkoutCart":
      next = checkoutCart(state, cmd.actorId, cmd.lines, now)
      shouldMatch = true
      break
    case "createListing": {
      const res = doCreateListing(state, cmd.actorId, cmd.productId, cmd.condition, cmd.amountCents, now)
      next = res.state
      shouldMatch = true
      break
    }
    case "editListing":
      next = editListing(state, cmd.actorId, cmd.listingId, cmd.amountCents, now)
      shouldMatch = true
      break
    case "cancelIntent":
      next = cancelIntent(state, cmd.actorId, cmd.intentId, now)
      break
    case "confirmReceipt":
      next = confirmReceipt(state, cmd.actorId, cmd.orderId, now)
      break
    case "cancelOrder":
      next = cancelOrder(state, cmd.actorId, cmd.orderId, now)
      shouldMatch = true
      break
    case "authorizeProposal":
      next = authorizeProposal(state, cmd.actorId, cmd.proposalId, now, provider)
      shouldMatch = true
      break
    case "declineProposal":
      next = declineProposal(state, cmd.actorId, cmd.proposalId, now)
      shouldMatch = true
      break
    case "markRead": {
      const notif = state.notifications.find((n) => n.id === cmd.notificationId)
      if (!notif || notif.recipientId !== cmd.actorId) break
      next = { ...state, notifications: state.notifications.map((n) => (n.id === cmd.notificationId ? { ...n, read: true } : n)) }
      break
    }
    case "markAllRead":
      next = { ...state, notifications: state.notifications.map((n) => (n.recipientId === cmd.actorId && !n.read ? { ...n, read: true } : n)) }
      break
    default:
      return state
  }

  if (shouldMatch) next = runMatching(next, now, provider)
  else next = expireProposals(expireIntents(next, now), now)
  return next
}
