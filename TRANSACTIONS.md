# TRANSACTIONS.md — XRPL Testnet transaction evidence

Date: 2026-09-05. Two real, validated direct-XRP Payments executed via the Yardle local service (rehearsal).

## Transaction 1 (original rehearsal)

| Field | Value |
| --- | --- |
| Network | XRPL Testnet (`wss://s.altnet.rippletest.net:51233`) |
| Transaction type | `Payment` (direct native XRP; not escrow) |
| Amount | 3.5 XRP (3,500,000 drops) |
| Buyer (payer) | `rh7JiBgqruHNHoikJSSW1FYC3kq6sB5zhh` |
| Seller (payee) | `rDTwGtDwfVw86V9cQEQgoepk2KzkoouxhD` |
| Result | `tesSUCCESS` |
| Ledger index | `20498148` |
| Transaction hash | `7554713F8FE8010454D887BA06D3C6357AA0A86E27E1E5B89544E3FE0782E333` |
| Explorer | https://testnet.xrpl.org/transactions/7554713F8FE8010454D887BA06D3C6357AA0A86E27E1E5B89544E3FE0782E333 |

### Balance reconciliation (drops)

| Account | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Buyer | 100,000,000 | 96,499,988 | −3,500,012 (3.5 XRP + 12-drop fee) |
| Seller | 100,000,000 | 103,500,000 | +3,500,000 (3.5 XRP) |

## Transaction 2 (post-fix headless verification, async authorize → validated)

| Field | Value |
| --- | --- |
| Amount | 3.5 XRP (3,500,000 drops) |
| Result | `tesSUCCESS` |
| Ledger index | `20498869` |
| Transaction hash | `4667335A352D2C86D0506E0AC856920AA952BA4165E07F41C54E30F40219E3CE` |
| Explorer | https://testnet.xrpl.org/transactions/4667335A352D2C86D0506E0AC856920AA952BA4165E07F41C54E30F40219E3CE |
| Receipt | `POST /api/received` set `fulfilledAt` + "Item received (simulated handoff); no additional payment" timeline entry |

### Balance reconciliation after both payments (drops)

| Account | Balance |
| --- | ---: |
| Buyer | 92,999,976 (two × 3.5 XRP + fees) |
| Seller | 107,000,000 (+7 XRP) |

## Flow exercised (post-fix API)

Session-cookie connect → `GET /api/orders` → `POST /api/prepare` → `POST /api/decline` (cancelled) → `POST /api/prepare` → `POST /api/authorize` (async: `authorized` → `submitting` → `validated`) → `POST /api/received` (`fulfilledAt`). One pending proposal at a time is enforced server-side. A live agent request (Agnes, `agnes-2.0-flash`) prepared an order via genuine tool calls (`lookup_product` → `get_valuation` → `prepare_payment`).

## Note

The buyer/seller accounts were created and funded with 100 test XRP each via the Testnet faucet; secrets live only in the gitignored `.env.local`. These are test-only funds with no real value.

