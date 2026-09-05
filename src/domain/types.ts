// Typed domain models for the Yardle demo. Money is always integer cents.

export type Condition = "Like new" | "Good" | "Fair"

export type Role = "seller" | "buyer"

export interface Persona {
  id: string
  name: string
  role: Role
  /** Seeded available funds in integer cents. */
  initialFundsCents: number
}

export interface Product {
  id: string
  title: string
  category: string
  emoji: string
}

export interface SaleSample {
  id: string
  productId: string
  amountCents: number
  soldAt: number // epoch ms
}

export interface ValuationSnapshot {
  productId: string
  condition: Condition
  baseMmaCents: number
  adjustedMmaCents: number
  minCents: number // inclusive lower bound (ceiling)
  maxCents: number // inclusive upper bound (floor)
  conditionFactor: number
  source: string
  referenceDate: string // ISO timestamp of the newest sample used
}

export type ListingStatus = "rejected" | "live" | "reserved" | "escrow" | "sold"

export interface TimelineEntry {
  at: number
  label: string
}

export interface Listing {
  id: string
  sellerId: string
  productId: string
  condition: Condition
  amountCents: number
  snapshot: ValuationSnapshot
  status: ListingStatus
  reason?: string
  activeOrderId?: string
  activeProposalId?: string
  timeline: TimelineEntry[]
  createdAt: number
  updatedAt: number
}

export type IntentSource = "want" | "need"

export type IntentStatus =
  | "rejected"
  | "searching"
  | "reserved"
  | "escrow"
  | "complete"
  | "cancelled"
  | "expired"
  | "funding_failed"

export interface BuyerIntent {
  id: string
  buyerId: string
  source: IntentSource
  productId: string
  condition: Condition
  /** Only set for I Want intents; an I Need may match any matching listing. */
  targetListingId?: string
  ceilingCents: number
  snapshot: ValuationSnapshot
  status: IntentStatus
  reason?: string
  activeOrderId?: string
  activeProposalId?: string
  timeline: TimelineEntry[]
  createdAt: number
  expiresAt: number
}

export type OrderStatus = "escrow" | "complete" | "cancelled"
export interface Order {
  id: string
  listingId: string
  intentId: string
  buyerId: string
  sellerId: string
  productId: string
  condition: Condition
  amountCents: number
  currency: string
  snapshot: ValuationSnapshot
  status: OrderStatus
  timeline: TimelineEntry[]
  createdAt: number
}

export type ProposalStatus = "awaiting_authorization" | "authorized" | "declined" | "expired" | "cancelled"

/**
 * A prepared payment awaiting explicit payer authorization. No money moves while
 * it is `awaiting_authorization`; the listing/intent are reserved meanwhile.
 */
export interface Proposal {
  id: string
  listingId: string
  intentId: string
  buyerId: string
  sellerId: string
  productId: string
  condition: Condition
  amountCents: number
  currency: string
  snapshot: ValuationSnapshot
  status: ProposalStatus
  reason?: string
  timeline: TimelineEntry[]
  createdAt: number
  expiresAt: number
  authorizedAt?: number
}

export type LedgerKind = "fund" | "release" | "refund"

/**
 * A single money movement. `fund` debits the buyer into escrow; `release`
 * credits the seller from escrow; `refund` credits the buyer from escrow.
 * Balances are always derived from these entries, so conservation holds.
 */
export interface LedgerEntry {
  id: string
  orderId: string
  personaId: string
  kind: LedgerKind
  amountCents: number
  counterpartyId: string
  at: number
}

export interface Notification {
  id: string
  recipientId: string
  eventRef: string // listing / intent / order id
  message: string
  at: number
  read: boolean
}

export interface CartLine {
  listingId: string
  addedAt: number
  selected: boolean
}

export interface DemoState {
  version: number
  seedVersion: number
  personas: Persona[]
  catalog: Product[]
  sales: SaleSample[]
  /**
   * Current market price (base "Good" MMA in cents) per product. Moves with
   * accepted listings (up) and completed sales (down); seeded sales set the
   * initial baseline. See valuation.ts tick helpers.
   */
  marketPrices: Record<string, number>
  listings: Listing[]
  intents: BuyerIntent[]
  orders: Order[]
  proposals: Proposal[]
  ledger: LedgerEntry[]
  notifications: Notification[]
  currentPersonaId: string
  carts: Record<string, CartLine[]>
  resetAt: number
  /** The "now" the seed timestamps are relative to. */
  seedNow: number
}

/** Every mutation to the demo state is expressed as a command. `actorId` is the
 * persona performing the action; the reducer validates it and its ownership. */
export type Command =
  | { type: "selectPersona"; personaId: string }
  | { type: "addToCart"; actorId: string; listingId: string }
  | { type: "removeFromCart"; actorId: string; listingId: string }
  | { type: "setCartSelected"; actorId: string; listingId: string; selected: boolean }
  | {
      type: "submitIntent"
      actorId: string
      source: IntentSource
      productId: string
      condition: Condition
      targetListingId?: string
      ceilingCents: number
    }
  | {
      type: "checkoutCart"
      actorId: string
      lines: Array<{ listingId: string; ceilingCents: number }>
    }
  | { type: "createListing"; actorId: string; productId: string; condition: Condition; amountCents: number }
  | { type: "editListing"; actorId: string; listingId: string; amountCents: number }
  | { type: "cancelIntent"; actorId: string; intentId: string }
  | { type: "confirmReceipt"; actorId: string; orderId: string }
  | { type: "cancelOrder"; actorId: string; orderId: string }
  | { type: "authorizeProposal"; actorId: string; proposalId: string }
  | { type: "declineProposal"; actorId: string; proposalId: string }
  | { type: "markRead"; actorId: string; notificationId: string }
  | { type: "markAllRead"; actorId: string }
