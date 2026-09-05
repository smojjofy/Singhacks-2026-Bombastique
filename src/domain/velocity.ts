// Velocity tracker: per-actor counts of guarded actions within a sliding window.
// Shared by the simulation (free-tier enforcement) and the server (MPP meter).

export class VelocityTracker {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly windowMs: number,
    private readonly freeLimit: number,
  ) {}

  private prune(actor: string, now: number): void {
    const list = this.hits.get(actor)
    if (!list) return
    const cutoff = now - this.windowMs
    const kept = list.filter((t) => t > cutoff)
    if (kept.length === 0) this.hits.delete(actor)
    else this.hits.set(actor, kept)
  }

  /** Number of guarded actions by this actor inside the current window. */
  count(actor: string, now: number): number {
    this.prune(actor, now)
    return this.hits.get(actor)?.length ?? 0
  }

  /** How many free actions remain for this actor right now. */
  remaining(actor: string, now: number): number {
    return Math.max(0, this.freeLimit - this.count(actor, now))
  }

  isWithinFreeTier(actor: string, now: number): boolean {
    return this.count(actor, now) < this.freeLimit
  }

  /** Milliseconds until a free slot opens (0 if the actor is within the tier). */
  msUntilFree(actor: string, now: number): number {
    const list = this.hits.get(actor)
    if (!list) return 0
    this.prune(actor, now)
    const kept = this.hits.get(actor) ?? []
    if (kept.length < this.freeLimit) return 0
    const oldest = Math.min(...kept)
    return Math.max(0, oldest + this.windowMs - now)
  }

  /** Record one guarded action. */
  record(actor: string, now: number): void {
    this.prune(actor, now)
    const list = this.hits.get(actor) ?? []
    list.push(now)
    this.hits.set(actor, list)
  }

  reset(actor?: string): void {
    if (actor === undefined) this.hits.clear()
    else this.hits.delete(actor)
  }
}
