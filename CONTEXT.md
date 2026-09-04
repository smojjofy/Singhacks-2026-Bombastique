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
