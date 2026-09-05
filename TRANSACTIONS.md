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


## x402 / MPP micro-payment evidence (2026-09-05, post-implementation)

Fee vault account `rHTdr4ZCZ2xpP24RoeYj6FusMDHoDMTqag` (created + funded 100 test XRP
this session; receive-only). All micro-payments are real validated XRPL Testnet Payments
from the buyer account `rh7JiBgqruHNHoikJSSW1FYC3kq6sB5zhh`.

| Purpose | Amount (drops) | Validated | Ledger | Tx hash (prefix) |
| --- | ---: | --- | --- | --- |
| x402 oracle fee (post-fix agent run; order `ord_mto33qk9_vn16gv`) | 600 | `tesSUCCESS` | 20499916 | `4681C0DD5E10…` |
| x402 oracle fee ×6 (prepare rounds 1–6, each declined after) | 600 each | `tesSUCCESS` | ~2049992x | (on orders `ord_mto34y2k…`–`ord_mto35sf3…`, see `oraclePaidHash`) |
| MPP meter overage (round 6 prepare, order `ord_mto35sf3_y5x78p`) | 400 | `tesSUCCESS` | 20499945 | `86BF61F632A1D94FD44BD2798D77221538206F321845170BCF673FB8E1F0009E` |
| Two earlier oracle fees during the DeliverMax verification bug (see DEBUG) | 600 each | `tesSUCCESS` | ~2049989x | (orphaned; no order created) |

Fee vault balance change: `100,000,000` → `100,005,800` drops (+5,800 = 600×9 + 400×1) —
matches the ledger exactly.

Live flow observed: agent request (Agnes) → `get_valuation` paid a 600-drop oracle fee →
verified on-ledger → signed voucher → `prepare_payment` → order records `oraclePaidHash`.
Velocity meter: rounds 1–5 `FREE` (`freeRemaining` 4→0), round 6 `METERED` (400 drops paid
and recorded as `meterPaidHash` before the prepare proceeded); `GET /api/v1/meter` reported
`count:6, freeRemaining:0`.
