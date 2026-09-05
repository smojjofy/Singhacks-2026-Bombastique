// Test-only fixture denomination for the XRPL Testnet path. There is NO exchange
// rate here: sample cents are multiplied by 100 to obtain drops, purely so the
// demo uses recognizable numbers (40000 cents -> 4,000,000 drops = 4 XRP).

export const DROPS_PER_XRP = 1_000_000

/** 40000 cents -> 4,000,000 drops (4 XRP). Deterministic fixture, not a rate. */
export function centsToDrops(cents: number): number {
  return cents * 100
}

export const TESTNET_MAIN_PHONE_MMA_DROPS = centsToDrops(40_000) // 4 XRP
export const TESTNET_MAIN_PHONE_ASKING_DROPS = centsToDrops(35_000) // 3.5 XRP
export const TESTNET_MAIN_PHONE_CEILING_DROPS = centsToDrops(38_000) // 3.8 XRP
