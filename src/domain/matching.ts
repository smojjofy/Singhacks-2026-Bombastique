// Deterministic matching: which live listing pairs with which searching intent.

import { isWithinInterval } from "./valuation"
import type { BuyerIntent, Listing } from "./types"

export function isExpired(intent: BuyerIntent, now: number): boolean {
  return intent.expiresAt <= now
}

/** Priority: soonest expiry, then earliest creation, then stable id. */
export function byIntentPriority(a: BuyerIntent, b: BuyerIntent): number {
  return (
    a.expiresAt - b.expiresAt ||
    a.createdAt - b.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/** Priority: earliest creation, then stable id. */
export function byListingPriority(a: Listing, b: Listing): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Eligible searching intents for a live listing, in priority order. Requires
 * exact product + condition, no self-purchase, both price bounds satisfied,
 * and the ceiling covering the asking price. I Want must target this listing.
 */
export function eligibleIntentsForListing(
  listings: BuyerIntent[],
  listing: Listing,
  now: number,
): BuyerIntent[] {
  return listings
    .filter(
      (i) =>
        i.status === "searching" &&
        !isExpired(i, now) &&
        i.buyerId !== listing.sellerId &&
        i.productId === listing.productId &&
        i.condition === listing.condition &&
        isWithinInterval(i.ceilingCents, i.snapshot) &&
        isWithinInterval(listing.amountCents, listing.snapshot) &&
        i.ceilingCents >= listing.amountCents &&
        (i.source === "need" || i.targetListingId === listing.id),
    )
    .sort(byIntentPriority)
}

/** Live, in-range, non-self listings an intent may match, in priority order. */
export function eligibleListingsForIntent(
  allListings: Listing[],
  intent: BuyerIntent,
): Listing[] {
  return allListings
    .filter(
      (l) =>
        l.status === "live" &&
        l.sellerId !== intent.buyerId &&
        l.productId === intent.productId &&
        l.condition === intent.condition &&
        isWithinInterval(l.amountCents, l.snapshot) &&
        isWithinInterval(intent.ceilingCents, intent.snapshot) &&
        intent.ceilingCents >= l.amountCents &&
        (intent.source === "need" || intent.targetListingId === l.id),
    )
    .sort(byListingPriority)
}
