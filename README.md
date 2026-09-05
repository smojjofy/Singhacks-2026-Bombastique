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

- Seeded catalog (15 products), latest-10-sales MMA, condition adjustment, and an inclusive
  70–130% price policy for both seller asking prices and buyer ceilings.
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

> The seller never provides an MMA — it is always derived from seeded sales. The Testnet
> fixture denomination is `drops = sample cents × 100` (4 XRP MMA for the phone), which is a
> deterministic fixture, **not** an exchange rate or a real-world valuation.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # tsc + vite build (client)
npm test               # Vitest (domain + server)
npm run typecheck:server
npm run server         # local service
npm run setup:testnet  # create/fund test accounts
npx playwright test    # browser smoke tests (starts the dev server)
```

## Verification

- `npm ci`, `npm run build`, `npm test` (60 tests), and `npx playwright test` all pass.
- A live rehearsal executed one real validated XRPL Testnet `Payment` (see
  [`TRANSACTIONS.md`](./TRANSACTIONS.md)).

## Security

- Secrets live only in gitignored `.env`/`.env.local`; never in `VITE_*`, never committed.
- The server binds loopback, rejects unexpected origins, requires a demo session for
  mutations, and refuses any non-Testnet endpoint (no accidental Mainnet).
- The agent has no signing tools and cannot change recipient, amount, or policy.
