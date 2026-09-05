// Sanitized evidence summary for the submission package. Never prints secrets.

import { promises as fs } from "node:fs"

async function main(): Promise<void> {
  const out: Record<string, unknown> = {}

  try {
    const tx = await fs.readFile("TRANSACTIONS.md", "utf8")
    const hash = tx.match(/`([0-9A-F]{64})`/)
    out.transaction_hash = hash ? hash[1] : null
  } catch {
    out.transaction_hash = null
  }

  const envConfigured = await fs
    .access(".env.local")
    .then(() => true)
    .catch(() => false)
  out.testnet_accounts_configured = envConfigured
  out.artifacts = ["SUBMISSION.md", "TRANSACTIONS.md", "BUILDER_FEEDBACK.md", "DEBUG.md"]
  out.verification_commands = ["npm test", "npm run build", "npm run typecheck:server", "npx playwright test"]

  console.log(JSON.stringify(out, null, 2))
}

main()
