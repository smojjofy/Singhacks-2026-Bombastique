import type { ReactNode } from "react"
import { formatMoney, formatRange } from "../domain/money"
import type {
  IntentStatus,
  ListingStatus,
  OrderStatus,
  ValuationSnapshot,
} from "../domain/types"

export function Money({ cents }: { cents: number }) {
  return <>{formatMoney(cents)}</>
}

export const INTENT_STATUS_LABEL: Record<IntentStatus, string> = {
  rejected: "Rejected",
  searching: "Approved - searching",
  reserved: "Awaiting authorization",
  escrow: "Escrow funded (simulated)",
  complete: "Complete",
  cancelled: "Cancelled",
  expired: "Expired",
  funding_failed: "Funding failed",
}

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  rejected: "Rejected",
  live: "Live",
  reserved: "Reserved",
  escrow: "Escrow funded (simulated)",
  sold: "Sold",
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  escrow: "Escrow",
  complete: "Complete",
  cancelled: "Cancelled",
}

export const intentTone = (s: IntentStatus): string =>
  s === "rejected" || s === "funding_failed"
    ? "danger"
    : s === "searching"
      ? "warn"
      : s === "reserved" || s === "escrow"
        ? "info"
        : s === "complete"
          ? "ok"
          : "muted"

export const listingTone = (s: ListingStatus): string =>
  s === "rejected" ? "danger" : s === "live" ? "ok" : s === "reserved" || s === "escrow" ? "info" : "ok"

export const orderTone = (s: OrderStatus): string =>
  s === "escrow" ? "info" : s === "complete" ? "ok" : "muted"

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal">
        <button className="close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  )
}

/** Read-only valuation display shared across Sell, I Need, and Cart. */
export function ValuationPanel({ snapshot }: { snapshot: ValuationSnapshot }) {
  const factorLabel =
    snapshot.conditionFactor === 1 ? "" : ` (×${snapshot.conditionFactor.toFixed(2)})`
  return (
    <div className="valuation">
      <div className="valuation-row">
        <span>MMA</span>
        <b>
          <Money cents={snapshot.adjustedMmaCents} />
        </b>
      </div>
      <div className="valuation-row">
        <span>Accepted range</span>
        <b>{formatRange(snapshot.minCents, snapshot.maxCents)}</b>
      </div>
      <div className="valuation-row">
        <span>Condition</span>
        <b>
          {snapshot.condition}
          {factorLabel}
        </b>
      </div>
      <small className="valuation-source">
        {snapshot.source} · as of {new Date(snapshot.referenceDate).toLocaleDateString()}
      </small>
    </div>
  )
}

export function DecisionPreview({
  cents,
  snapshot,
}: {
  cents: number | null
  snapshot: ValuationSnapshot
}) {
  if (cents === null || cents <= 0) {
    return <div className="decision">Enter an amount to see the Guardian decision.</div>
  }
  if (cents < snapshot.minCents) {
    return <div className="decision decision-danger">Rejected — below the accepted range.</div>
  }
  if (cents > snapshot.maxCents) {
    return <div className="decision decision-danger">Rejected — above the accepted range.</div>
  }
  return <div className="decision decision-ok">Approved — within the accepted range.</div>
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
