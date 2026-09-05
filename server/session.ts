// Minimal local-demo session. This is a test-harness convenience, not production
// authentication: mutating endpoints require the token printed to the server log.

import crypto from "node:crypto"

export function issueSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}
