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
- **x402 / MPP**: not applicable to a direct-XRP `Payment`; we kept them out rather than use
  them inappropriately. They become relevant for paid external data lookup and multi-party
  settlement, which are future work.
