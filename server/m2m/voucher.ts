// Signed oracle voucher. Proves the MMA pricing came from the paid pricing
// oracle (x402), not from an unverified client. HMAC-SHA256 over canonical JSON.

import crypto from "node:crypto"

export interface OracleVoucher {
  productId: string
  condition: string
  mmaDrops: number
  minDrops: number
  maxDrops: number
  askingDrops: number
  issuedAt: number
  exp: number
  paidHash: string
  sig: string
}

export function canonicalVoucher(v: Omit<OracleVoucher, "sig">): string {
  return JSON.stringify({
    productId: v.productId,
    condition: v.condition,
    mmaDrops: v.mmaDrops,
    minDrops: v.minDrops,
    maxDrops: v.maxDrops,
    askingDrops: v.askingDrops,
    issuedAt: v.issuedAt,
    exp: v.exp,
    paidHash: v.paidHash,
  })
}

export function signVoucher(secret: string, v: Omit<OracleVoucher, "sig">): OracleVoucher {
  const sig = crypto.createHmac("sha256", secret).update(canonicalVoucher(v)).digest("hex")
  return { ...v, sig }
}

export type VoucherVerifyResult = { ok: true; voucher: OracleVoucher } | { ok: false; reason: string }

export function verifyVoucher(secret: string, voucher: unknown, now: number): VoucherVerifyResult {
  if (!voucher || typeof voucher !== "object") return { ok: false, reason: "missing voucher" }
  const v = voucher as Partial<OracleVoucher>
  if (typeof v.sig !== "string" || typeof v.productId !== "string") return { ok: false, reason: "malformed voucher" }
  const { sig, ...rest } = v as OracleVoucher
  const expected = crypto.createHmac("sha256", secret).update(canonicalVoucher(rest)).digest("hex")
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { ok: false, reason: "bad voucher signature" }
  if (typeof v.exp !== "number" || now >= v.exp) return { ok: false, reason: "voucher expired" }
  if (typeof v.issuedAt !== "number" || v.issuedAt > now + 60_000) return { ok: false, reason: "voucher issued in the future" }
  return { ok: true, voucher: v as OracleVoucher }
}
