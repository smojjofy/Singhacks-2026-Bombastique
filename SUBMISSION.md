# SUBMISSION.md — Yardle (Rippe Challenge: XRPL-extended Real-World Use)

## 1. Customer / problem

Second-hand marketplaces (Carousell, Shopee, …) suffer from **price asymmetry and bot
sniping**: sellers underprice against a hidden market, and bots snap up deals faster than
humans. Yardle embeds a **Market Moving Average (MMA)** and an **agentic, human-authorized
payment** layer so fair prices are enforced before any money moves.

## 2. The product and the agent's value

Yardle is a C2C marketplace for unique second-hand goods. Every listing and buyer ceiling is
checked against a condition-adjusted MMA (70–130% inclusive). Matching reserves an item and
creates a **payment proposal**; nothing is charged until the buyer explicitly authorizes it.

The **agent** turns a natural-language request ("Find an iPhone 13 in good condition, up to
3.8 test XRP") into a prepared, validated proposal using constrained tools (catalog lookup,
valuation, prepare). It cannot sign or submit — it hands off to the human for authorization,
which is the trust boundary between "agent suggests" and "human approves spending".

## 3. Journeys

**Customer journey:** browse → I Want/I Need (or natural-language agent) → MMA-checked price
→ reserved match → *Authorize payment* → simulated escrow (or real Testnet payment) → receipt
→ reconciled wallet.

**Agentic transaction journey:** user request → agent tools (`lookup_product`,
`get_valuation`, `prepare_payment`) → `awaiting_authorization` proposal → human
`authorizeProposal` → durable async executor (build `Payment`, sign, persist op record,
broadcast, wait for validated `tesSUCCESS`) → receipt + balance reconciliation.

## 4. Architecture

```
React/Vite (view + command client)
   ├─ Simulation store (Demo SGD, localStorage)     ── pure domain modules
   └─ Local service (loopback, session-gated)
        ├─ agent runtime + constrained tools
        ├─ payment executor (reliable submission)
        └─ JSON store (atomic writes) ──> XRPL Testnet
```

Domain logic is pure TypeScript (`src/domain`): valuation, matching, a command-layer reducer,
and ledger-derived balances. The server recomputes valuation and owns all real orders; it
never trusts a client snapshot.

## 5. Integrations & safeguards

- **XRPL Testnet** direct-XRP `Payment` (not escrow) via `xrpl` 5, with reliable submission
  (`Sequence`/`LastLedgerSequence`, durable op records before broadcast, post-restart
  reconciliation).
- **Agent** via an OpenAI-compatible tool-calling model (DeepSeek; provider-agnostic).
- Safeguards: Testnet-endpoint allowlist (Mainnet refused), loopback + origin checks, demo
  session for mutations, actor/ownership validation on every command, funds recheck at
  authorization (no overspend), idempotent authorize/receipt/refund, and no partial payments.

## 6. Transaction evidence

See [`TRANSACTIONS.md`](./TRANSACTIONS.md) — one validated `Payment` (`tesSUCCESS`),
ledger `20498148`, tx `7554713F…`, with before/after balance reconciliation.

## 7. Reproducibility

```bash
npm ci
npm test                 # 60 tests
npm run build
npx playwright test      # browser smoke tests
npm run setup:testnet && npm run server   # real Testnet path
```

## 8. Remaining production improvements

Escrow (Finish/Condition) instead of a direct Payment, multi-signing/custody, authn/authz,
multi-device sync, dynamic MMA from real trades, x402/MPP paid data lookup, and shipping/
dispute flows. The XRPL AI Starter Kit and x402/MPP remain recommended but were not required
for the minimum real-transaction checklist; they are future work.
