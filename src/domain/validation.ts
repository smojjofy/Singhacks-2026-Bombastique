// Deep persisted-state validation. Used on load so corrupt/incompatible data is
// recovered from (with an explicit reset prompt) instead of crashing the UI.

import { CONDITIONS, SEED_VERSION, STORE_VERSION } from "./config"
import type { DemoState } from "./types"

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function isStr(v: unknown): v is string {
  return typeof v === "string"
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}
function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER
}
function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER
}

const isCondition = (v: unknown): boolean => typeof v === "string" && (CONDITIONS as string[]).includes(v)
const isRole = (v: unknown): boolean => v === "seller" || v === "buyer"

function isValidPersona(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isRole(v.role) &&
    isNonNegInt(v.initialFundsCents)
  )
}

function isValidProduct(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.title) && isStr(v.category) && isStr(v.emoji)
}

function isValidSale(v: unknown): boolean {
  return isObj(v) && isStr(v.id) && isStr(v.productId) && isPosInt(v.amountCents) && isFiniteNum(v.soldAt)
}

function isValidTimeline(v: unknown): boolean {
  return Array.isArray(v) && v.every((e) => isObj(e) && isFiniteNum(e.at) && isStr(e.label))
}

function isValidSnapshot(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.productId) &&
    isCondition(v.condition) &&
    isNonNegInt(v.baseMmaCents) &&
    isNonNegInt(v.adjustedMmaCents) &&
    isNonNegInt(v.minCents) &&
    isNonNegInt(v.maxCents) &&
    isFiniteNum(v.conditionFactor) &&
    isStr(v.source) &&
    isStr(v.referenceDate)
  )
}

function isValidListing(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.sellerId) &&
    isStr(v.productId) &&
    isCondition(v.condition) &&
    isPosInt(v.amountCents) &&
    isValidSnapshot(v.snapshot) &&
    ["rejected", "live", "reserved", "escrow", "sold"].includes(v.status as string) &&
    (v.reason === undefined || isStr(v.reason)) &&
    (v.activeOrderId === undefined || isStr(v.activeOrderId)) &&
    (v.activeProposalId === undefined || isStr(v.activeProposalId)) &&
    isValidTimeline(v.timeline) &&
    isFiniteNum(v.createdAt) &&
    isFiniteNum(v.updatedAt)
  )
}

function isValidIntent(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.buyerId) &&
    (v.source === "want" || v.source === "need") &&
    isStr(v.productId) &&
    isCondition(v.condition) &&
    (v.targetListingId === undefined || isStr(v.targetListingId)) &&
    isPosInt(v.ceilingCents) &&
    isValidSnapshot(v.snapshot) &&
    ["rejected", "searching", "reserved", "escrow", "complete", "cancelled", "expired", "funding_failed"].includes(
      v.status as string,
    ) &&
    (v.reason === undefined || isStr(v.reason)) &&
    (v.activeOrderId === undefined || isStr(v.activeOrderId)) &&
    (v.activeProposalId === undefined || isStr(v.activeProposalId)) &&
    isValidTimeline(v.timeline) &&
    isFiniteNum(v.createdAt) &&
    isFiniteNum(v.expiresAt)
  )
}

function isValidOrder(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.listingId) &&
    isStr(v.intentId) &&
    isStr(v.buyerId) &&
    isStr(v.sellerId) &&
    isStr(v.productId) &&
    isCondition(v.condition) &&
    isPosInt(v.amountCents) &&
    isStr(v.currency) &&
    isValidSnapshot(v.snapshot) &&
    ["escrow", "complete", "cancelled"].includes(v.status as string) &&
    isValidTimeline(v.timeline) &&
    isFiniteNum(v.createdAt)
  )
}

function isValidProposal(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.listingId) &&
    isStr(v.intentId) &&
    isStr(v.buyerId) &&
    isStr(v.sellerId) &&
    isStr(v.productId) &&
    isCondition(v.condition) &&
    isPosInt(v.amountCents) &&
    isStr(v.currency) &&
    isValidSnapshot(v.snapshot) &&
    ["awaiting_authorization", "authorized", "declined", "expired", "cancelled"].includes(
      v.status as string,
    ) &&
    (v.reason === undefined || isStr(v.reason)) &&
    isValidTimeline(v.timeline) &&
    isFiniteNum(v.createdAt) &&
    isFiniteNum(v.expiresAt) &&
    (v.authorizedAt === undefined || isFiniteNum(v.authorizedAt))
  )
}

function isValidLedger(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.orderId) &&
    isStr(v.personaId) &&
    ["fund", "release", "refund"].includes(v.kind as string) &&
    isPosInt(v.amountCents) &&
    isStr(v.counterpartyId) &&
    isFiniteNum(v.at)
  )
}

function isValidNotification(v: unknown): boolean {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.recipientId) &&
    isStr(v.eventRef) &&
    isStr(v.message) &&
    isFiniteNum(v.at) &&
    typeof v.read === "boolean"
  )
}

function isValidCartLine(v: unknown): boolean {
  return isObj(v) && isStr(v.listingId) && isFiniteNum(v.addedAt) && typeof v.selected === "boolean"
}

export function isValidState(value: unknown): value is DemoState {
  if (!isObj(value)) return false
  const s = value as unknown as DemoState
  if (s.version !== STORE_VERSION || s.seedVersion !== SEED_VERSION) return false
  if (!Array.isArray(s.personas) || s.personas.length === 0 || !s.personas.every(isValidPersona)) return false
  if (!Array.isArray(s.catalog) || !s.catalog.every(isValidProduct)) return false
  if (!Array.isArray(s.sales) || !s.sales.every(isValidSale)) return false
  if (!Array.isArray(s.listings) || !s.listings.every(isValidListing)) return false
  if (!Array.isArray(s.intents) || !s.intents.every(isValidIntent)) return false
  if (!Array.isArray(s.orders) || !s.orders.every(isValidOrder)) return false
  if (!Array.isArray(s.proposals) || !s.proposals.every(isValidProposal)) return false
  if (!Array.isArray(s.ledger) || !s.ledger.every(isValidLedger)) return false
  if (!Array.isArray(s.notifications) || !s.notifications.every(isValidNotification)) return false
  if (!isStr(s.currentPersonaId) || !s.personas.some((p) => p.id === s.currentPersonaId)) return false
  if (
    !isObj(s.carts) ||
    !Object.entries(s.carts).every(([k, v]) => isStr(k) && Array.isArray(v) && v.every(isValidCartLine))
  ) {
    return false
  }
  if (!isFiniteNum(s.resetAt) || !isFiniteNum(s.seedNow)) return false

  // Relationship integrity (prevents null-entity lookups downstream).
  const personaIds = new Set(s.personas.map((p) => p.id))
  const listingIds = new Set(s.listings.map((l) => l.id))
  const intentIds = new Set(s.intents.map((i) => i.id))
  const orderIds = new Set(s.orders.map((o) => o.id))
  const proposalIds = new Set(s.proposals.map((p) => p.id))

  for (const l of s.listings) {
    if (!personaIds.has(l.sellerId)) return false
    if (l.activeOrderId !== undefined && !orderIds.has(l.activeOrderId)) return false
    if (l.activeProposalId !== undefined && !proposalIds.has(l.activeProposalId)) return false
  }
  for (const i of s.intents) {
    if (!personaIds.has(i.buyerId)) return false
    if (i.targetListingId !== undefined && !listingIds.has(i.targetListingId)) return false
    if (i.activeOrderId !== undefined && !orderIds.has(i.activeOrderId)) return false
    if (i.activeProposalId !== undefined && !proposalIds.has(i.activeProposalId)) return false
  }
  for (const o of s.orders) {
    if (!listingIds.has(o.listingId) || !intentIds.has(o.intentId)) return false
    if (!personaIds.has(o.buyerId) || !personaIds.has(o.sellerId)) return false
  }
  for (const p of s.proposals) {
    if (!listingIds.has(p.listingId) || !intentIds.has(p.intentId)) return false
    if (!personaIds.has(p.buyerId) || !personaIds.has(p.sellerId)) return false
  }
  for (const e of s.ledger) {
    if (!personaIds.has(e.personaId) || !personaIds.has(e.counterpartyId)) return false
    if (!orderIds.has(e.orderId)) return false
  }
  for (const n of s.notifications) {
    if (!personaIds.has(n.recipientId)) return false
  }
  return true
}
