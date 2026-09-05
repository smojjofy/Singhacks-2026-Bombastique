# CONTEXT.md – Yardle (Working Title)
**Project Yardle** | *C2C Decentralized Marketplace* | **XRPL Hackathon 2026**

---

## 1. Executive Summary
**Yardle** (derived from "Yard Sale") is a next-generation Consumer-to-Consumer (C2C) marketplace designed to eliminate price asymmetry and bot manipulation. 
Unlike traditional platforms (e.g., Carousell, Shopee), Yardle embeds an **Agentic AI workflow** directly into the transaction layer of the **XRP Ledger (XRPL)**. 

The core innovation is the **Market Moving Average (MMA)**—a dynamic pricing index calculated from on-chain sales data. The MMA serves a dual purpose:
1. **Empowerment:** Guides sellers to price competitively without underselling.
2. **Protection:** Acts as an autonomous circuit breaker against bot sniping and market manipulation.

By leveraging XRPL's instant settlement (3-5 seconds) and low fees, Yardle facilitates trust-minimized, machine-to-machine (M2M) commerce where the AI agent acts as a neutral guardian of fair trade.

---

## 2. Core Principles & Differentiators

| Principle | Description |
| :--- | :--- |
| **Pure C2C (Single-Unit Stock)** | We strictly serve individual sellers listing unique second-hand items. This eliminates the "viral demand false-positive" risk seen in B2C drops. |
| **Market Moving Average (MMA)** | A rolling average price calculated per product category based on internal database or an online search if database has insufficient or invalid data (e.g., "iPhone 13 128GB"). The AI agent references this to flag anomalies. |
| **Agentic Escrow** | The AI agent autonomously manages the XRPL Escrow lifecycle. It can delay, hold, or cancel transactions based on real-time price/velocity analysis. |
| **Ephemeral Communication** | Buyer-Seller chats are instanced and **transient**. Conversations are not stored post-session to ensure user privacy. |
| **Multi-Currency Wallet** | Users hold a non-custodial or custodial wallet supporting XRP, RLUSD (stablecoin), and custom assets via XRPL's native issuance. |

---

## 3. High-Level System Architecture

```mermaid
graph TD
    subgraph Client Layer
        A[Web/Mobile Frontend] --> B[User Profile/Listing UI]
        A --> C[Ephemeral Chat Interface]
        A --> D[Dashboard / MMA Gauge]
    end

    subgraph Backend Core
        E[API Gateway / REST & WebSocket]
        F[AI Agent Engine - "The Guardian"]
        G[Transaction State Manager]
        H[Database - PostgreSQL / Redis]
    end

    subgraph XRPL Network
        I[XRP Ledger]
        J[Escrow Smart Contracts]
        K[Multi-Currency Wallets / DEX]
    end

    A -- HTTP / WS --> E
    E -- Data Fetch --> H
    E -- Trigger/Query --> F
    F -- State Machine --> G
    G -- Submit Tx --> I
    I -- Webhook Callback --> E
    F -- Reads MMA --> H
    F -- Signs Escrow --> J
    K -- Swap/Payment --> J
```

## 4. Component Deep Dive

### 4.1. Client Layer (Frontend)
- **User Profiles:** Customizable profiles with bio, location, and active listings.
- **Listings:** Upload photos, set price. The UI **must** display the current MMA for that category alongside the seller's input to guide them.
- **Market Feed:** Displays active listings. The "Buy" button state changes based on the AI agent's current risk assessment (Green/Yellow/Red).
- **Ephemeral Chat:** A lightweight chat box opened per listing. A persistent disclaimer states: *"This conversation is temporary and will be permanently deleted once the transaction is completed or closed."*
- **Wallet Dashboard:** Displays user balances across supported assets (XRP, RLUSD).

### 4.2. Backend Core (API & Services)
- **API Gateway:** Handles authentication (JWT/Session), rate limiting (basic), and routes requests to services.
- **Transaction State Manager:** Acts as the source of truth for order statuses before they finalize on-chain. Manages the "Pending Review" state (triggered by AI alerts).
- **Database Layer:**
  - *PostgreSQL:* Persistent storage for Users, Listings, and historical transactions (for MMA calculation).
  - *Redis:* Cache for real-time MMA values and ephemeral chat sessions (with TTL expiration, e.g., 24 hours).

### 4.3. AI Agent Engine ("The Guardian")
This is the heart of the system. It runs as a daemon service with two primary real-time functions:
1. **MMA Calculator:** Triggers on every successful sale. Updates the rolling average for that category (e.g., last 10 sales, weighted by recency).
2. **Sniper/Manipulation Detector:** Assesses incoming buy requests against the current MMA and **Stock Velocity** (the rate at which similar items are being purchased in the last 60 seconds).

**Decision Matrix:**
- **Condition:** Listed Price < (MMA * 0.7) OR Velocity > (Avg Velocity * 3).
- **Action:** The AI intercepts the transaction submission. It places the order in a "Pending Human Review" state instead of submitting it directly to XRPL.

### 4.4. XRPL Integration Layer
- **Issued Assets:** Yardle can issue a custom token (e.g., `YDL`) or rely on native XRP/RLUSD. *MVP Suggestion:* Use XRP directly to save setup time.
- **Escrow (Conditional Payments):** Upon a successful verified purchase, the backend creates an `EscrowCreate` transaction on XRPL. The `FinishAfter` or `Condition` fields can be set based on seller shipping confirmation or a simple "Timeout + Refund" logic.
- **Multi-Currency Support (DEX):** If a buyer has XRP but the seller prefers RLUSD, the AI agent can route the payment through the XRPL DEX to atomically swap currencies during the escrow release.

---

## 5. Security & Anti-Bot Mechanisms (The MMA Shield)

Since Yardle deals with unlimited theoretical stock (anyone can list), traditional ticketing queues are ineffective. We implement four defense layers:

1. **The Price Floor Guard (Sniping Prevention):**
   - When a buy request is received, the AI checks if `Price < (MMA * 0.7)`.
   - *Action:* Escrow is **not** created. The seller receives a push notification: *"You listed at $50, but the market average is $450. Confirm to proceed or adjust price."*
   - The transaction is suspended for 5 minutes. If unconfirmed, the buyer is auto-refunded.

2. **Velocity Circuit Breaker (Swarm Attacks):**
   - The AI monitors the `Stock Velocity` = (Number of listings sold in category X in last 60 seconds).
   - If Velocity spikes beyond 3 standard deviations of the historical average, the AI activates a partial lock.
   - *Action:* Only *new* or *low-reputation* wallets initiating purchases are required to complete a verification challenge (CAPTCHA/email OTP). Verified users bypass the lock.

3. **Stake-to-List (Spam Prevention):**
   - To list an item, a seller must stake a micro-deposit (e.g., $0.50 in XRP) into a temporary escrow.
   - The stake is returned upon successful sale or after the listing expires. This makes large-scale bot listing economically unviable.

4. **Wash-Trade Exclusion:**
   - When calculating the MMA, the AI filters out transactions where the buyer and seller wallets have interacted more than 3 times in the past month, preventing manipulation via fake sales.

---

## 6. User Flow Walkthroughs

### Scenario A: Fair Price Listing (Normal Flow)
1. **Seller:** Lists a "Used Nintendo Switch" at $250.
2. **AI:** Checks MMA. MMA is $245. Price deviation is +2% (Green).
3. **Buyer:** Clicks "Buy."
4. **System:** Creates XRPL Escrow. Buyer locks $250.
5. **Seller:** Ships item, confirms in UI.
6. **System:** Releases Escrow to Seller. Transaction recorded. MMA updates.

### Scenario B: Bot Sniping Attempt (Protected Flow)
1. **Seller:** Accidentally lists an "iPad Pro" at $100. MMA is $800.
2. **Bot:** Instantly clicks "Buy" (100ms).
3. **AI:** Detects deviation (-87.5%).
4. **System:** **Blocks** the XRPL transaction. Locks the UI for "Review."
5. **AI:** Sends SMS/In-App alert to Seller: *"Price mismatch detected. Please verify your listing."*
6. **Seller:** Adjusts price to $800 or confirms the $100 price (if intended).
7. **System:** If confirmed, the AI escalates the transaction (bypassing the bot's request or allowing the bot to pay the high price). The bot loses its arbitrage opportunity as the delay allows human oversight.

---

## 7. Non-Functional Requirements

- **Privacy (Chat):** Messages are stored in Redis with a strict Time-To-Live (TTL) of 24 hours or until the order status is finalized, whichever is shorter. No historical chat logs are persisted in PostgreSQL.
- **Performance:** The AI agent must process the MMA/Price check within < 500ms to avoid delaying the user experience. Caching of MMA values will be handled via Redis.
- **Security:** Private keys for XRPL transactions will be held securely in a Hardware Security Module (HSM) or using environment-separated signing services (e.g., Fireblocks in production; simple env vars for hackathon MVP).

---

## 8. MVP Tech Stack Recommendation

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React / Next.js (TypeScript) for rapid UI prototyping |
| **Backend API** | Node.js (Express) or Python (FastAPI) – *Python recommended for easy AI integration* |
| **AI Agent** | Python (LangChain or custom class) integrating XRPL AI Starter Kit |
| **Database** | PostgreSQL (User/Product data) + Redis (Cache & Ephemeral Chat) |
| **Blockchain** | XRPL (Testnet) – using `xrpl.js` or `xrpl-py` SDKs |
| **Payment Standard** | x402 Machine-to-Machine payments for API calls (AI fetching external data) |
| **Hosting** | Docker Compose for easy local setup / deploy on Vercel + Heroku |

---

## 9. Future Iterations (Post-Hackathon)
- **Peer-to-Peer Reputation:** Although excluded from MVP, a review system based on successful escrow completions will be implemented to further enhance the "human verification" score.
- **Advanced Oracles:** Real-world price feeds (e.g., eBay trends) to augment the on-chain MMA.
- **Mobile App:** Native React Native wrapper for the Web platform.

---

## 10. Name Disclaimer
**Yardle** is a working title derived from "Yard Sale." 
*Pre-MVP Check Required:* The team must verify trademark availability and ensure the name does not inadvertently carry offensive connotations in any primary target language (currently assumed to be English-focused).

---

## 11. Buyer Intent, Cart, and Need Windows (2026-09-05)

Yardle has two buyer-intent paths. Both require a buyer to state a per-item maximum price, which is assessed against the current MMA snapshot; the buyer's expressed price is the buyout ceiling used for automated matching.

1. **I Want (cart-based intent):** Buyers may place one or more seller listings in a cart without committing to purchase. In the cart they can adjust quantities where applicable, remove listings, select only the lines to action now, and use a prominent checkout confirmation action. A secondary confirmation modal displays the MMA snapshot for each selected listing and requires the buyer to enter their offered price per listing. It shows the selected item count and total amount the buyer is willing to commit before submission.
2. **I Need (immediate demand listing):** Buyers may immediately create a priced demand listing without using the cart. The same MMA-snapshot and buyer price-input confirmation applies.

Every submitted buyer intent creates a **Need Window** valid for 90 days. It permits competing buyer demand for the same item. When a seller's automated listing price is at or below an eligible buyer's stated buyout price (and meets the MMA rule), the system automatically selects the buyer whose Need Window has the least remaining lifetime (closest to expiry). If tied, the earlier buyer-intent timestamp wins. Human input is limited to cart management and stating the buyer's price point; matching, transaction initiation, and settlement proceed automatically through the Guardian workflow.

---

## 12. MVP Build Decision (2026-09-05)

The prototype will start as a Vite + React + TypeScript application. It will build the marketplace, I Want cart, I Need intent form, MMA visibility, Guardian decision experience, and simulated escrow lifecycle first. XRPL actions will be isolated behind a payment-provider boundary so an `xrpl.js` XRPL Testnet implementation can replace the simulator without rewriting product flows. A real Testnet escrow lifecycle remains required for the final hackathon demo. `rippled` node/validator operation is not MVP scope. Required XRPL AI Starter Kit and x402/MPP integrations will be added once the official challenge resources are available.

---

## 13. Buyer Tracking and Seller Workspace (2026-09-05)

The prototype provides separate Marketplace, Cart, My Activity, and Sell an Item application views. Submitting an I Want or I Need creates a visible 90-day Need Window in My Activity rather than only displaying a transient confirmation. Each buyer intent shows its Guardian lifecycle: searching, eligible match found, simulated XRPL escrow funded, and item received/complete.

Sellers use Sell an Item to submit a single-unit listing with title, category, condition, price, MMA, and display emoji. The UI immediately flags a price below 70% of MMA. For the prototype, a safe seller listing selects an eligible active buyer intent when its price is at or below that buyer's ceiling and the item name matches. The seller may advance the matched sale into simulated escrow; the buyer can then confirm receipt, completing the simulated settlement. This is presentation-state only and must be connected to persistent storage and real XRPL Testnet escrow before the final demo.

---

## 14. Local Dry-Test Setup (2026-09-05)

The current frontend requires Node.js and npm only; no Python virtual environment or environment variables are needed. The .venv entry in .gitignore is incidental and does not indicate a Python dependency. Local setup was verified with Node v24.12.0 and npm 11.7.0: npm ci installed the locked dependencies successfully, and npm run build passed. Start the prototype with npm.cmd run dev on Windows. The lint script currently references ESLint without an ESLint dependency or configuration; this does not block development or production builds.

---

## 15. Operator-Assisted Demo Plan and Handoff (2026-09-05)

The user requested a documented implementation plan for another AI to build the skeleton, followed by verification and completion. PLANNING.md now specifies the immediate demo scope; application implementation has not been performed as part of this planning task.

The demo will use a separate /admin experience within the existing Vite/React application, with persisted shared browser state and same-origin tab synchronization. Admin approves safe seller listings and eligible buyer matches. A preset catalog of phones, personal mobility products, and household appliances provides seeded historical prices and derived read-only MMA; sellers no longer enter MMA. Listings below 70% of the derived condition-adjusted MMA must be held and excluded from purchase, with no admin override. The plan includes deterministic Need Window matching, persona-specific simulated Demo SGD wallets, escrow/release/refund accounting, persistent notifications, timelines, demo reset, and behavioral acceptance checks.

This immediate presentation scope refines the earlier prototype decisions: funding is initiated through admin purchase approval, the catalog supplies MMA, and operator-assisted settlement is explicitly simulated. Real XRPL Testnet and XRPL AI Starter Kit/x402/MPP integrations remain outstanding challenge requirements, alongside longer-term autonomous Guardian and production features. See PLANNING.md for the complete implementation contract and handoff checklist.


---

## 16. Automatic Approval Demo Simplification (2026-09-05)

The user replaced the separate admin experience with automatic buy/sell approval within an MMA threshold and rejection above or below it, plus visual wallet updates. The revised PLANNING.md supersedes section 15's operator-assisted implementation scope. No admin route, approval queue, manual approval, or two-tab infrastructure is required. Use a single persisted application with buyer/seller persona switching.

The planning default is an inclusive 70-130% band of catalog-derived condition-adjusted MMA for seller asking prices and buyer maximum offers. The user did not specify numeric upper/lower bounds in this revision; 70% retains the existing floor and 130% is a configurable implementation assumption. Accepted unmatched buyer requests remain searching without charges; matching accepted requests automatically fund simulated escrow at the asking price. Receipt confirmation releases funds; cancellation refunds them. Rejections show reasons and never change balances. The preset catalog, notifications, wallet accounting, demo reset, and verification checklist remain required. No application code was changed in this planning revision; real XRPL and agentic payment challenge integrations remain outstanding.

---

## 17. Holistic Rubric Evaluation (2026-09-05)

EVALUATION.md records a product and rubric review while the coding AI implements the skeleton. It assesses the planned simulation, not a verified finished application. The key finding is that the demo can illustrate a coherent customer journey but does not fully satisfy CHALLENGE.md's required real XRPL and XRPL AI Starter Kit/x402/MPP integrations. These are outstanding challenge obligations, distinct from optional future improvements. Builder-feedback and hook/skill setup evidence must also be checked; this review did not establish their completion.

The evaluation identifies product-policy limitations: the 70-130% interval is a demo assumption rather than validated fraud detection; a maximum buyer budget differs from the executed price; fixed 90-day expiry priority is effectively oldest-request-first; and receipt/refund rules do not resolve production delivery disputes. It proposes an expandable roadmap separated into required integrations, production essentials, and optional expansion, with a focused pitch around demand-led resale and bounded purchasing. No implementation requirements or application code were changed by this evaluation. See EVALUATION.md for the full rubric mapping, evidence gaps, and pitch guidance.

---

## 18. Final-Submission Checklist Evaluation Update (2026-09-05)

The user supplied a newer submission checklist requiring the customer/product explanation, AI-agent value, customer and agentic transaction journeys, at least one successful XRPL transaction, architecture, transaction hashes/explorer references, and reproducibility. This checklist describes the XRPL AI Starter Kit as recommended and x402/MPP explanation as conditional on applicability. EVALUATION.md now corrects the earlier blanket characterization of all integrations as mandatory, while retaining their relevance to the original weighted rubric.

The critical recommended additions are one genuine constrained agent task, a connected validated Testnet transaction, asynchronous payment/receipt handling, an observable run trace, and a reproducible submission/evidence package. A direct Testnet Payment can address the transaction item without full real escrow, provided its business purpose and any nominal test amount are disclosed and it is not called escrow. These are evaluation recommendations only: PLANNING.md and application code were not modified. The coding AI's work remains in progress and unverified.

---

## 19. Transaction Authorization Interface Feasibility (2026-09-05)

The user clarified that the proposed admin interface was intended to simulate XRPL transaction authorization and asked whether current work must be reverted. Read-only inspection found no need for wholesale rollback: a transaction authorization view could be added to the existing single-tab app by separating matching/reservation from funding and adding pending/approve/decline transitions. Automatic MMA decisions and existing product flows can remain. A simulated approval is not a real XRPL transaction or wallet-signing authority; real execution additionally needs a payer-authorized signer, async submission, validation, and stored receipts. EVALUATION.md records the detailed feasibility assessment. No implementation mode was selected, and neither PLANNING.md nor application code was changed.

---

## 20. Implementation Progress — Automatic-Rules MVP (2026-09-05)

The PLANNING.md "revised implementation handoff" (automatic rules, simulated payments, no admin/approval) has been implemented and verified. The previous single-file prototype was replaced with a domain-driven, persisted app.

- **Domain:** `src/domain/*` (config, types, integer-cent money, valuation with a 70–130% MMA interval, balances, matching, a command-layer reducer); `src/payments/*` (`PaymentProvider` boundary + `SimulatedPaymentProvider`); `src/data/catalog.ts` (15 products) and `src/data/seed.ts` (deterministic sales — main phone Good-condition MMA is exactly Demo SGD 400 — plus fixtures for I-Need-before-listing, oldest-expiry priority, and insufficient funds).
- **Store:** `src/store/demoStore.ts` — versioned localStorage persistence, persona switching, confirmed reset, and corrupt-data recovery prompt.
- **UI:** `src/pages/*` (Marketplace, Cart, I Need, Sell, Activity with buyer/seller tabs, Wallet, Notifications), responsive navigation, and a persistent "Demo: automated rules, simulated payments" label.
- **Verification:** `npm ci`, `npm run build`, and `npm test` (25 Vitest tests including a full 7-step presentation walkthrough) all pass. The `lint` script was removed (eslint was never configured); static checking is `tsc -b`.
- **Remaining:** a manual browser UI walkthrough, and the real XRPL Testnet escrow + XRPL AI Starter Kit / x402 / MPP integrations (outstanding challenge requirements, isolated behind the `PaymentProvider` boundary).
- Details and acceptance-check evidence: see `DEBUG.md`.


---

## 21. Independent Review and Submission-Completion Plan (2026-09-05)

The user reported the coding agent finished and requested an evaluation plus a rewritten PLANNING.md covering the missing critical demo features. Independent checks passed all 25 existing Vitest tests and the TypeScript/Vite production build. Four temporary probes confirmed missing actor/entity ownership enforcement, direct receipt completion bypassing the provider, accepted invalid persisted personas, and a null-intent load crash; the temporary file was removed. No browser walkthrough or live integration was performed. EVALUATION.md and DEBUG.md record this distinction and the findings.

The replacement plan preserves the simulator and automatic MMA rules, adds a same-app payer authorization gate, and specifies a genuine constrained agent and local backend for a real direct-XRP Testnet transaction path with authoritative order state, durable async reconciliation, receipts/explorer evidence, and actual wallet updates. Simulation and Testnet currencies/states remain separate. The main Testnet fixture uses MMA 4 test XRP, asking 3.5, and ceiling 3.8 as an explicit test price schedule, not a market exchange rate. Direct payments cannot be labeled escrow; real escrow is deferred for the minimum submission. Setup, ownership/storage fixes, browser/live tests, and submission/feedback documents are included.

The current official challenge README was checked and explicitly states XRPL is mandatory while Starter Kit and agentic payment standards are recommended. This matches the user's newer checklist and corrects the earlier stronger historical wording without modifying CHALLENGE.md. The new plan supersedes the simulation-only no-authorization/no-backend limitation where needed for live execution. This turn changed documentation only; the missing integrations remain implementation work.

---

## 22. Human Test and Recording Checklist (2026-09-05)

The user requested a comprehensive human test plan for the expected submission-ready second implementation, including recording and rapid bug assistance, then specified markdown tables in _test.md. That file now contains setup, fixtures, expected simulation/Testnet balance changes, seller/buyer/authorization/agent/live-payment cases, recovery/usability checks, a concise recording script, evidence gates, and a bug-report/repair workflow. Its tests are expected behavior and start NOT RUN; no round-two features were verified by writing it. PLANNING.md and application code were not changed. The user can report a test ID and symptom in this thread for scoped diagnosis, repair, and retesting.

---

## 23. Milestone 1 Implementation (2026-09-05)

Round-two Milestone 1 (repair ownership/persistence + money/schema types) is implemented and verified. The previous 25 tests still pass and 17 new tests were added (42 total); `npm run build` passes.

- **Actor/ownership:** every mutating command now carries an explicit `actorId`; the reducer rejects unknown actors and wrong-owner edit/receipt/cancel/mark-read operations with no side effects. Seed fixtures and tests pass explicit fixture actors.
- **Tagged money types:** `src/domain/paymentTypes.ts` adds `Currency`/`MoneyAmount` (SGD cents vs XRP drops); `money.ts` adds currency-aware `formatAmount`/`parseAmount`/`parseXrp` so XRP never flows through the SGD `formatMoney`.
- **Persistence hardening:** `src/domain/validation.ts` adds deep nested validation (entity shapes, money, timestamps, relationships, current persona); `demoStore.ts` recovers from corrupt/incompatible data with a reset prompt and surfaces `persistError` when writes fail.
- **Tests:** `src/store/demoStore.test.ts` (persistence/corruption round-trip) and `src/domain/ownership.test.ts` (ownership + two-order isolation).
- Playwright + Chromium were installed successfully (for Milestone 5 browser checks).

---

## 24. Round-two milestones M2–M5 complete (2026-09-05)

- **M2 authorization:** matching now reserves a `Proposal` and moves no money until `authorizeProposal`; `declineProposal`/expiry release the reservation. Added an Authorize page and activity actions.
- **M3 server + Testnet:** loopback local service (`server/`), XRP-drops test schedule (`drops = cents × 100`), durable async payment executor (reliable submission + reconcile), test-account setup, Testnet page, `.env.example`.
- **M4 agent:** provider-agnostic tool-calling agent (`lookup_product`/`get_valuation`/`prepare_payment` only; no signing), clarification/refusal, `/api/agent/request`, natural-language "Ask the agent" entry. Live model gate blocked on `MODEL_API_KEY`.
- **M5 evidence:** Playwright suite (3 tests), post-submit outcome feedback, two-mode copy fixes, `SUBMISSION.md` / `BUILDER_FEEDBACK.md` / `TRANSACTIONS.md`, `export-evidence`.
- **Verification:** `npm test` (60), `npm run build`, `npm run typecheck:server`, `npx playwright test` all pass. One real validated XRPL Testnet `Payment` was executed (ledger `20498148`, tx `7554713F…`, balances reconciled) — see `TRANSACTIONS.md`.
- Optional M6 (Starter Kit / x402 / MPP) is deferred; not required for the minimum real-transaction checklist.


