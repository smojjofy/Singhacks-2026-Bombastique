# Yardle — Working Analysis

## Current understanding

Yardle is an AI-native C2C marketplace for unique second-hand goods. It uses XRPL settlement and escrow to make transactions inexpensive, observable, and automatable. Its central agent, **the Guardian**, protects sellers from accidental underpricing, bot sniping, manipulation, spam, and wash-trade distortion.

The Guardian calculates a per-item/category **Market Moving Average (MMA)** from credible completed sales. It evaluates a listing and a purchase/match in real time. Normal activity can enter an XRPL escrow workflow; anomalous prices or velocity trigger an explainable review and seller confirmation path before funds move.

Yardle now supports both supply and buyer demand:

- Sellers create unique-item listings with an asking price.
- **I Want** lets a buyer add existing listings to a cart with no immediate commitment. The buyer can remove lines and choose which listings to action. Checkout opens a confirmation modal that displays an MMA snapshot for every selected item and requires a stated maximum price per item; it also displays total selected items and total potential spend.
- **I Need** skips the cart and immediately creates a priced demand listing for an item. It uses the same MMA snapshot and buyer maximum-price confirmation.
- Each submitted buyer intent has a 90-day **Need Window**. A buyer's stated price is their buyout ceiling.
- When a safe, eligible seller listing is at or below one or more buyers' maximum prices, matching is automated. The buyer whose Need Window has the least remaining time wins; if tied, the earliest created intent wins.
- After allocation, the Guardian reserves the listing and initiates the XRPL escrow/payment lifecycle. Human actions are limited to listing, cart selection, and price input.

Because the product is pure C2C and listings are unique single units, the MVP cart should support selecting and removing listings, not increasing quantity. Quantity support can be a future extension for multi-unit inventory.

## Product and implementation direction

The MVP should demonstrate a complete commercial loop: buyer need or intent → Guardian's transparent MMA/risk and matching decision → XRPL escrow → shipping confirmation → release or refund → completed sale updates MMA.

Core records: `Listing`, `Cart`, `BuyerIntent`, `MmaSnapshot`, `Match`, and `EscrowOrder`. `BuyerIntent` stores intent type (`I_WANT` / `I_NEED`), maximum price, MMA snapshot, creation timestamp, expiry timestamp, and lifecycle status.

Core matching rule:

```text
eligible = buyer.maxPrice >= seller.askPrice
           AND listing passes Guardian MMA/risk checks

winner = lowest remaining Need Window duration
         then earliest BuyerIntent creation timestamp
```

The strongest hackathon demo is a transparent competing-demand flow: two buyers create Needs for the same item, a seller creates an eligible listing, the Guardian exposes its MMA and allocation reasoning, selects the correct winner, and creates a real XRPL Testnet escrow transaction. A normal sale and an underpriced bot-sniping attempt should be shown as complementary demos.

The technology focus remains: a polished TypeScript/Next.js interface; a small backend/state machine; an agent service combining deterministic rules with AI explanations; XRPL Testnet escrow transactions; temporary chat storage; and a meaningful x402/MPP payment for an external market-data lookup when local MMA data is insufficient.

## Iterations

### 1. Initial marketplace concept

Defined Yardle as a seller-led, AI-protected C2C marketplace. The Guardian uses MMA, price-floor controls, velocity detection, stake-to-list, and wash-trade exclusion, then manages XRPL escrow.

### 2. Demand-side intent and automated allocation

Added the I Want cart path and I Need immediate demand path. Added buyer-entered maximum prices, MMA snapshots at confirmation, 90-day Need Windows, priority based on closest expiry then earliest timestamp, and fully automated matching/payment initiation.

### 3. XRPL infrastructure clarification

Confirmed that `XRPLF/rippled` is the C++ server/node implementation of the XRP Ledger. Yardle will use the network, but the hackathon MVP does not need to clone, build, modify, or operate `rippled`. The application should connect to an existing XRPL Testnet endpoint through an application SDK such as `xrpl.js`, using real XRPL escrow transactions. Running a dedicated node or validator is out of MVP scope.

### 4. Conversation-log requirement

The team requested that this file become a log of every substantive conversation, rather than only a record of summaries. From this point, entries must be appended after each discussion, correction, decision, question with an answer, or implementation activity. Entries should remain concise while preserving the agreed direction and rationale.

### 5. Finding the XRPL application resources

The team asked where to obtain the first required XRPL building blocks. The official `XRPLF/xrpl.js` repository is the recommended JavaScript/TypeScript SDK; its quickstart specifies `npm install --save xrpl` and shows connecting a `Client` to the XRPL Testnet WebSocket endpoint `wss://s.altnet.rippletest.net:51233`. The same SDK provides test-wallet funding, transaction submission, ledger queries, subscriptions, and Escrow transaction support. The XRPL Developer Portal is the canonical reference for ledger concepts and transaction types. We will use these sources when implementation begins, while locating the mandated AI Starter Kit and x402/MPP materials in the challenge's resources documentation.

### 6. Build sequencing without immediate XRPL setup

The team asked whether development can begin before XRPL Testnet and SDK setup. It can. The prototype will isolate blockchain/payment actions behind a `PaymentProvider` interface. The first implementation will be a deterministic local simulator that returns escrow lifecycle states and transaction IDs suitable for the UI and workflow tests. We can build the listing, cart, I Want/I Need pricing confirmation, Need Window, MMA, Guardian risk scoring, matching/allocation, and transaction timeline against that interface now.

During the build, we will install `xrpl`, configure a Testnet WebSocket URL, generate and fund Testnet-only wallets, and implement an `XrplPaymentProvider` for actual `EscrowCreate`, `EscrowFinish`, and `EscrowCancel` submissions. The UI and matching logic will not need to be rewritten when this replacement occurs. A real Testnet escrow loop remains required before the final demo; mock settlement is only an early-development bridge. The required XRPL AI Starter Kit and x402/MPP integration will be introduced after their official challenge resources are identified, not invented or substituted.

### 7. Initial prototype implementation

The team authorized implementation. A new Vite + React + TypeScript project has been created in the repository, with `xrpl` declared and installed. The first interactive screen implements the product-facing MVP: marketplace listings; MMA and Guardian-cleared indicators; adding unique listings to an I Want cart; cart selection/removal; per-listing MMA-aware maximum-price confirmation; direct I Need creation; a 90-day Need Window disclosure; and a successful-intent state. README documentation now covers stack, prerequisites, setup, usage, Testnet integration plan, and MVP limitations. The application uses simulated settlement at this stage; XRPL Testnet transactions, Guardian service, persistence, and required AI Starter Kit/x402/MPP integrations remain next-stage work.

Verification: dependencies installed successfully using `npm.cmd install`; `npm.cmd run build` completed successfully with Vite. Local generated dependencies and build artefacts are excluded through `.gitignore`.
