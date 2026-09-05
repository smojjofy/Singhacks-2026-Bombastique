# Yardle

Yardle is an AI-guarded C2C marketplace for unique second-hand goods. A deterministic
"Guardian" checks every price against a **Market Moving Average (MMA)**, and an agentic
purchase flow prepares payments that a **human explicitly authorizes** before any money
moves.

There are two clearly separated modes:

1. **Simulation** — the marketplace runs entirely in the browser (Demo SGD, integer cents,
   simulated escrow). This is the labeled rehearsal experience.
2. **XRPL Testnet** — a local service executes a real, direct-XRP `Payment` on the XRPL
   Testnet (test-only funds), with human-authorized agent execution and validated receipts.

## What it demonstrates

- Seeded catalog (15 products), latest-10-sales MMA baseline, condition adjustment, and an
  inclusive 70–130% price policy for both seller asking prices and buyer ceilings.
- A **stock-like moving MMA**: each accepted listing pushes the market price up and each
  completed sale pushes it down, scaled by where the price sits in the accepted interval
  (barely at the low end, a bounded margin at the high end).
- Automatic approval/rejection of listings and buyer requests, with visible reasons.
- Matching that **reserves** a listing/intent and creates an **awaiting-authorization
  proposal** (no money moves), funded only after the payer authorizes.
- Marketplace, Cart, I Need (manual + natural-language agent), Sell, Activity (buyer/seller),
  Authorize, Wallet, Notifications, persona switching, and reset.
- Ledger-derived balances that reconcile exactly through fund/release/refund.
- A provider-agnostic tool-calling agent (DeepSeek now; any OpenAI-compatible provider later)
  that can only look up, value, and prepare — never sign or submit.

## Technology

| Area | Tech |
| --- | --- |
| Client | React 19, TypeScript, Vite, hand-written CSS |
| Domain | Pure TS modules (`src/domain`) — valuation, matching, command layer, balances |
| Persistence | Versioned `localStorage` (simulation) + JSON store with atomic writes (server) |
| Server | Node + `http`, loopback-only, session-gated, Testnet-only |
| XRPL | `xrpl` 5 (`Client`, `Wallet`, reliable submission) against `wss://s.altnet.rippletest.net:51233` |
| Agent | OpenAI-compatible chat completions (tools) — `MODEL_BASE_URL`/`MODEL_NAME`/`MODEL_API_KEY` |
| Tests | Vitest (domain + server), Playwright (browser) |

`rippled` is not a dependency; we connect to the public Testnet through `xrpl`.

## Setup

```bash
npm ci
npm run dev            # client on http://localhost:5173
```

### Testnet mode (real XRP payments)

```bash
npm run setup:testnet  # create + fund two test-only accounts (writes .env.local)
npm run server         # local service on 127.0.0.1:4782 (prints a session token)
```

Copy the session token into the "Testnet" page, then use "Ask the agent" or "Prepare payment"
and authorize. Set `MODEL_API_KEY` (plus `MODEL_BASE_URL`/`MODEL_NAME`) in `.env`/`.env.local`
to enable the live agent; see `.env.example`.

> The seller never provides an MMA — it always comes from the seeded-sales baseline and then
> moves with listings (up) and completed sales (down). The Testnet
> fixture denomination is `drops = sample cents × 100` (4 XRP MMA for the phone), which is a
> deterministic fixture, **not** an exchange rate or a real-world valuation.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # tsc + vite build (client)
npm test               # Vitest (domain + server)
npm run typecheck:server
npm run server         # local service
npm run setup:testnet  # create/fund test accounts (+ fee vault)
npx playwright test    # browser smoke tests (starts the dev server)
```

## Machine-to-machine micro-payments (x402 & MPP)

A secondary M2M flow on the Testnet path (documented local implementation; the repo has no
official `resources.md` spec to follow):

- **x402 — paid MMA-pricing oracle.** A pricing lookup (`/api/v1/pricing-check`, and the
  agent's `get_valuation`) first answers HTTP `402` with a payment instruction. The paying
  machine — the agent, using the configured Testnet buyer account — sends a real 600-drop
  Testnet `Payment` (memo = challenge) to the fee vault, which is verified on-ledger before
  pricing plus a signed, 10-minute voucher is returned. Order prepares refuse vouchers that
  fail signature, expiry, or product binding (`server/m2m/oracle.ts`, `voucher.ts`).
- **MPP — metered velocity/anti-bot.** Guarded requests (order prepare, agent request) have
  a free allowance of 5/minute per account; over-limit requests are auto-metered with a real
  400-drop Testnet `Payment` to the fee vault before they proceed (`server/m2m/meter.ts`,
  shared policy in `src/domain/config.ts`). The simulation mirrors the free-tier rule and
  blocks over-limit guarded submissions with an anti-bot notice (no fake charges).

## Verification

- `npm ci`, `npm run build`, `npm test` (75 tests), and `npx playwright test` all pass.
- Live rehearsals executed real validated XRPL Testnet `Payment`s (see
  [`TRANSACTIONS.md`](./TRANSACTIONS.md)).

## Security

- Secrets live only in gitignored `.env`/`.env.local` (and the server-side model `env`);
  never in `VITE_*`, never committed.
- The server binds loopback, rejects unexpected origins, requires a demo session for
  mutations, and refuses any non-Testnet endpoint (no accidental Mainnet).
- The agent has no signing tools and cannot change recipient, amount, or policy.
- Oracle vouchers are HMAC-signed; fee payments are verified on-ledger before data is served.
