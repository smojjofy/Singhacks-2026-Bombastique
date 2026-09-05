# Focus
We are doing a Hackathon. Refer to `CHALLENGE.md` and `CONTEXT.md` for all the current information required.
Any future information or changes should be appended to `CONTEXT.md` but never edit the current existing text.
`CHALLENGE.md` is read-only.
If you need more documentation, but may not necessarily fall under CONTEXT.md, you may create a `DEBUG.md` or `TEMP.txt` and type there.

## Demo implementation handoff (2026-09-05)

Read [PLANNING.md](./PLANNING.md) before implementing or reviewing the demo. It defines the approved operator-assisted demo scope, shared marketplace/admin architecture, preset valuation catalog, mandatory MMA enforcement, simulated wallet lifecycle, milestones, and acceptance checks.

The user will have another AI implement the skeleton, followed by a verification/completion pass against the plan. Implement connected behavior through the shared domain/store layer; do not substitute disconnected UI mockups for required workflows. Record completed work, validation evidence, and remaining gaps in the handoff, and append material decisions/progress to CONTEXT.md without editing its existing text. Keep simulated settlement and operator approval visibly distinguished from future real XRPL/AI integrations. CHALLENGE.md remains read-only.

## Simplified automatic demo revision (2026-09-05)

The user removed the admin application and manual approvals. Follow the revised PLANNING.md instead of the operator-assisted handoff above. Automatically approve buy/sell prices within the configured MMA interval and reject prices outside it; eligible matches automatically fund simulated escrow and update wallets. The plan currently assumes inclusive 70-130% of MMA for both asking prices and buyer ceilings, with the upper bound a configurable planning assumption. Keep receipt confirmation for release. The demo is single-tab with persona switching and persisted state; no admin or cross-tab infrastructure is required. This remains a planning handoff, not authorization to claim the skeleton is implemented.

## Submission-completion handoff supersedes simulation-only scope (2026-09-05)

The user requested evaluation of the completed simulator and a replacement PLANNING.md covering all critical demo gaps. Follow that rewritten plan for subsequent implementation. Preserve automatic MMA checks and existing UI/domain work; add same-app payer authorization, a genuine constrained agent, and a distinct real XRPL Testnet direct-payment path with async validated receipts. Simulated escrow remains a separate rehearsal mode. This revision supersedes the earlier no-authorization/no-backend limitation for the new Testnet execution path. The official challenge README confirms Starter Kit and x402/MPP are recommended; the required connected XRPL/agentic journey and evidence remain completion gates. Consult EVALUATION.md and DEBUG.md for verified findings. CONTEXT.md stays append-only and CHALLENGE.md read-only.
