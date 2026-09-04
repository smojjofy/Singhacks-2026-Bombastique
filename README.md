# Yardle

Yardle is an AI-guarded C2C marketplace for unique second-hand goods. Buyers either save available listings through **I Want** or create immediate priced demand through **I Need**. The Guardian compares offers to a Market Moving Average (MMA), detects unsafe behaviour, allocates eligible buyer intent fairly, and ultimately settles a transaction through XRPL escrow.

> Status: hackathon MVP in active development. The current build provides the complete client-side intent and cart experience with simulated settlement. XRPL Testnet settlement is the next integration stage.

## What the prototype demonstrates

- A marketplace of single-unit listings with asking price, MMA, and Guardian status.
- An **I Want** cart: add, remove, select listings, then confirm only selected lines.
- A secondary confirmation modal that shows MMA snapshots, captures a buyer maximum price per listing, and displays maximum total spend.
- An **I Need** path that immediately creates a priced demand intent without a cart.
- The 90-day Need Window rule: eligible buyers are allocated by shortest remaining window, then earliest intent timestamp.
- A user-facing explanation of the Guardian and the intended XRPL escrow flow.

## Technology stack

| Area | Technology | Purpose |
|---|---|---|
| Client | React 19, TypeScript, Vite | Fast, type-safe single-page hackathon prototype. |
| Styling | Hand-written CSS | Responsive visual system without a UI-framework dependency. |
| XRPL client | `xrpl` (`xrpl.js`) | Testnet wallet, transaction, subscription, and escrow integration. |
| Ledger | XRPL Testnet | Real `EscrowCreate`, `EscrowFinish`, and `EscrowCancel` demo transactions. |
| Guardian (next stage) | TypeScript service + deterministic rules | MMA, risk screening, Need Window allocation, and decision explanations. |
| Agentic payment (next stage) | XRPL AI Starter Kit + x402/MPP | Required challenge integrations; used for paid external market-data lookup when internal MMA history is inadequate. |

`rippled` is not a dependency for this MVP. It is node/validator server software. We connect to the public XRPL Testnet through `xrpl.js` instead.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (Node 22+ recommended by `xrpl.js`).
- npm. On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd` in the commands below.
- An internet connection to install packages and, later, reach XRPL Testnet.

## Setup

From the repository root:

```bash
npm install
npm run dev
```

Open the local URL Vite prints (normally `http://localhost:5173`).

On this Windows machine, use:

```powershell
npm.cmd install
npm.cmd run dev
```

Create a production build with:

```bash
npm run build
```

## How to use the current MVP

1. Browse the three available listings.
2. Select **I want this** to place a unique listing into the cart.
3. In **Cart**, select the lines to act on, remove any unwanted listing, and choose **Review & price offers**.
4. Review each MMA snapshot, enter a maximum price, and submit the buyer intent.
5. Alternatively select **I need something** and provide an item description plus maximum price directly.
6. The confirmation message represents a submitted 90-day Need Window awaiting Guardian matching.

The current UI intentionally does not support a quantity picker: Yardle’s MVP is pure C2C and each listing is one unique item.

## XRPL Testnet integration plan

The interface is designed so that business logic can be built before wallet setup. A `PaymentProvider` boundary will first use simulated escrow results, then be replaced with an `XrplPaymentProvider`.

For Testnet integration we will install the already-declared `xrpl` package, connect to:

```text
wss://s.altnet.rippletest.net:51233
```

and use Testnet-only wallets. Never commit seeds, private keys, or production credentials. The target settlement lifecycle is:

```text
Guardian allocates an eligible intent
  → reserve the listing
  → EscrowCreate (buyer funds locked)
  → seller confirms shipping
  → EscrowFinish (seller paid)

Cancellation/timeout → EscrowCancel (buyer refunded)
```

Useful official references: [xrpl.js](https://github.com/XRPLF/xrpl.js), [XRPL Developer Portal](https://xrpl.org/), and [XRPL Escrow documentation](https://xrpl.org/docs/concepts/payment-types/escrow).

## Current limitations / next work

- State is in the browser only; listings, carts, Buyer Intents, MMA history, and matching need a backend database.
- Guardian checks and matching logic are explained in the UI but not yet executed as a service.
- No wallet connection or real Testnet transaction is active yet.
- Ephemeral chat, authentication, listing images, paid market-data lookup, and x402/MPP are not built yet.

See [`CONTEXT.md`](./CONTEXT.md) for the product requirements and [`analysis.md`](../analysis.md) for the running project discussion log.
