# BUILDER_FEEDBACK.md — XRPL development experience

Honest notes from building Yardle against `xrpl` 5.1.0 and the public Testnet.

## What worked well

- **Reliable submission is genuinely needed and the primitives are there.** `Client.autofill`
  fills `Fee`/`Sequence`/`LastLedgerSequence`, and `Wallet.sign` returns `tx_blob` + `hash`.
  Building the durable-submit loop (persist op record → broadcast → poll `tx` → detect
  `lastLedgerSequence` expiry → reconcile on restart) was straightforward once I read the
  reliable-submission docs.
- **The faucet and `Client.fundWallet`** make a fully self-contained test setup trivial —
  create two accounts, fund them, and run a real payment in minutes.
- **`tesSUCCESS` + `meta.TransactionResult`** give an unambiguous validated outcome to store
  as a receipt.

## Friction / gotchas

- **The `xrpl` v5 API surface moved.** `submitAndWait`/`txToHash` are no longer top-level
  exports (they're now `Client` instance methods / moved), and the transaction types
  (`Payment`, `SubmitResponse`) are type-only exports. I had to introspect the shipped
  `.d.ts` files to map the v4→v5 surface. A migration guide or a single "reliable submit"
  recipe in the docs would save real time.
- **Type-only vs runtime exports are easy to confuse** — `import { Payment } from "xrpl"`
  exists as a type but not a runtime value; `autofill`'s generic return type means the
  autofilled fields (`Sequence`, `LastLedgerSequence`, `Fee`) are only typed correctly if you
  annotate the tx as the specific transaction type.
- **No built-in Mainnet guard.** I had to implement my own Testnet-endpoint allowlist so an
  environment change can't silently target Mainnet. A first-class `NetworkID`/chain-id check
  helper in the SDK would be a welcome safety default.

## Suggestions for mainnet readiness

1. A stable, documented "build → autofill → sign → persist → submit → reconcile" helper.
2. First-class network identity (Testnet vs Mainnet) checks, not just endpoint strings.
3. Clearer distinction between runtime and type-only exports in the public API docs.
4. A maintained migration guide between major `xrpl` versions.

## On the challenge integration list

- **XRPL AI Starter Kit**: not consumed — our agent uses an OpenAI-compatible tool-calling
  loop directly. A starter kit that provided a typed tool/agent scaffold would have removed
  boilerplate.
- **x402 (paid MMA-pricing oracle)**: implemented as a secondary M2M flow. A pricing lookup
  returns HTTP 402 with a payment instruction; the paying machine (the agent, using the
  configured Testnet buyer account) sends a real 600-drop Testnet payment to the fee vault,
  and only then receives pricing plus a signed voucher. Prepare endpoints refuse vouchers
  that fail signature/expiry/product binding.
- **MPP (metered velocity/anti-bot)**: implemented. Each guarded request (order prepare,
  agent request) gets a free allowance of 5/minute per account; over-limit requests are
  auto-metered with a real 400-drop Testnet payment to the fee vault before they proceed.
  The simulation mirrors the free-tier rule and blocks over-limit guarded submissions with
  an explicit anti-bot notice.
- These are a documented local implementation of the x402/MPP shapes (no official spec was
  provided in `resources.md`, which is absent from the repo); labels and README state that.
