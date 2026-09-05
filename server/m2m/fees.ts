// Metered-payment policy for the machine-to-machine service.
// x402 = paid HTTP API access (the MMA pricing oracle). MPP = metered,
// per-request charges with a free allowance; overage is paid per request.

// The velocity window/limit are shared with the simulation (single source):
export { VELOCITY_WINDOW_MS, VELOCITY_FREE_LIMIT } from "../../src/domain/config"

/** Fee to obtain an oracle MMA-pricing response (drops). 600 = 0.0006 XRP. */
export const ORACLE_FEE_DROPS = 600

/** Metered charge per over-limit guarded request (drops). 400 = 0.0004 XRP. */
export const METER_FEE_DROPS = 400

/** Oracle voucher lifetime. */
export const VOUCHER_TTL_MS = 10 * 60_000
