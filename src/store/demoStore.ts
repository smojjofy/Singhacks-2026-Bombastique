// Shared demo store with versioned localStorage persistence. Single-tab only;
// simultaneous editing in multiple tabs is unsupported for this demo.

import { useSyncExternalStore } from "react"
import { buildSeedState } from "../data/seed"
import { reduce, expireIntents } from "../domain/transitions"
import { isValidState } from "../domain/validation"
import { VELOCITY_FREE_LIMIT, VELOCITY_WINDOW_MS } from "../domain/config"
import { VelocityTracker } from "../domain/velocity"
import { SimulatedPaymentProvider } from "../payments/SimulatedPaymentProvider"
import type { Command, DemoState } from "../domain/types"

const STORAGE_KEY = "yardle.demo.state.v1"

/** Guarded submissions that consume a free-tier velocity slot per persona. */
const GUARDED: ReadonlySet<Command["type"]> = new Set(["createListing", "submitIntent", "checkoutCart"])

type Listener = () => void

export interface DemoStoreSnapshot {
  state: DemoState
  corrupt: boolean
  /** True when a persistence write failed (e.g. storage full / private mode). */
  persistError: boolean
  /** Anti-bot velocity notice when a guarded submission is blocked (sim free tier). */
  meterNotice: { actorId: string; message: string; retryAfterMs: number } | null
}

export interface DemoStoreApi {
  getSnapshot: () => DemoStoreSnapshot
  subscribe: (fn: Listener) => () => void
  dispatch: (cmd: Command) => void
  reset: () => void
  acknowledgeCorrupt: () => void
  clearPersistError: () => void
  dismissMeterNotice: () => void
}

function loadPersisted(): { state: DemoState | null; corrupt: boolean } {
  if (typeof localStorage === "undefined") return { state: null, corrupt: false }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: null, corrupt: false }
    const parsed: unknown = JSON.parse(raw)
    if (!isValidState(parsed)) return { state: null, corrupt: true }
    return { state: parsed, corrupt: false }
  } catch {
    return { state: null, corrupt: true }
  }
}

export function createDemoStore(now = Date.now(), clock: () => number = Date.now): DemoStoreApi {
  const provider = new SimulatedPaymentProvider()
  const velocity = new VelocityTracker(VELOCITY_WINDOW_MS, VELOCITY_FREE_LIMIT)
  const loaded = loadPersisted()
  let snapshot: DemoStoreSnapshot = {
    state: loaded.state ?? buildSeedState(now),
    corrupt: loaded.corrupt,
    persistError: false,
    meterNotice: null,
  }
  // Evaluate expiry of any persisted intents on load.
  if (loaded.state) {
    snapshot = { ...snapshot, state: expireIntents(loaded.state, Date.now()) }
  }

  const listeners = new Set<Listener>()
  let dispatching = false

  const emit = () => listeners.forEach((fn) => fn())
  const persist = (s: DemoState): boolean => {
    if (typeof localStorage === "undefined") return false
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      return true
    } catch {
      return false
    }
  }
  const commit = (next: DemoState) => {
    const ok = persist(next)
    snapshot = { ...snapshot, state: next, persistError: ok ? snapshot.persistError : true }
    emit()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    dispatch: (cmd) => {
      if (dispatching) return // serialize in-flight commands; repeated clicks are dropped
      dispatching = true
      try {
        // Anti-bot free tier (simulation). Mirrors the server MPP meter: over
        // the free allowance a guarded submission is blocked here; on the
        // Testnet flow the overage would instead be metered for real drops.
        const t = clock()
        if (GUARDED.has(cmd.type)) {
          const actor = (cmd as { actorId: string }).actorId
          if (!velocity.isWithinFreeTier(actor, t)) {
            const retryAfterMs = Math.max(1_000, Math.ceil(velocity.msUntilFree(actor, t) / 1_000) * 1_000)
            snapshot = {
              ...snapshot,
              meterNotice: {
                actorId: actor,
                message:
                  "Anti-bot velocity limit: this persona has used its free allowance of submissions this minute. The Testnet flow meters over-limit requests (MPP); the simulation enforces the free tier only.",
                retryAfterMs,
              },
            }
            emit()
            return
          }
          velocity.record(actor, t)
          if (snapshot.meterNotice) snapshot = { ...snapshot, meterNotice: null }
        } else {
          // Any other action clears a stale notice.
          if (snapshot.meterNotice) snapshot = { ...snapshot, meterNotice: null }
        }
        const next = reduce(snapshot.state, cmd, Date.now(), provider)
        if (next !== snapshot.state) commit(next)
      } finally {
        dispatching = false
      }
    },
    reset: () => {
      velocity.reset()
      const fresh = buildSeedState(Date.now())
      const ok = persist(fresh)
      snapshot = { state: fresh, corrupt: false, persistError: !ok, meterNotice: null }
      emit()
    },
    acknowledgeCorrupt: () => {
      snapshot = { ...snapshot, corrupt: false }
      emit()
    },
    clearPersistError: () => {
      snapshot = { ...snapshot, persistError: false }
      emit()
    },
    dismissMeterNotice: () => {
      if (!snapshot.meterNotice) return
      snapshot = { ...snapshot, meterNotice: null }
      emit()
    },
  }
}

export const demoStore = createDemoStore()

export function useDemoStore(): DemoStoreSnapshot {
  return useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, demoStore.getSnapshot)
}
