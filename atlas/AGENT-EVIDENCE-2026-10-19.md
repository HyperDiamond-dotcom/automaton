# Atlas agent council results — 19 October 2026

A five-reviewer deterministic rule council was integrated into the `PAPER` evaluation path. Distinct reviewers each cast an independent vote to veto any **new virtual BUY**; exits and portfolio drawdown halts remain effective. No AI-model calls, keys, real-money brokerage transactions, or live trading permissions have been added.

Independent Node.js tests (same GitHub feature branch, following the duplicate-event fix): **32/32 pass**. A GitHub Actions `Atlas trading safety (paper only)` run also reached `success` on the branch. Other workflow runs, including full repository CI, may still be queued.

## Historical results: original strategy versus council-filtered variant

| Replay window | Baseline prior result | Council-filtered result | Completed filtered round trips | Assessment |
|---|---:|---:|---:|---|
| 30-day sample (2026-09-20 to 2026-10-19) | -4.117% | **-0.225%** | 1, lost | Reduced exposure, not profitable |
| 90-day sample (2026-07-22 to 2026-10-19) | -5.073% | **-0.225%** | 1, lost | Reduced exposure, not profitable |

**Critical:** These are retrospective comparisons of simulations over overlapping date ranges and slightly different run timestamps, **not truly unseen out-of-sample validation**. The council's +2.5% momentum and other thresholds are hypotheses, not empirically verified edge. A one-trade sample cannot establish expected performance or support real-money funding.

Filtered simulation: initial virtual account $5,000, ending $4,988.76 in each of the two overlapping replays; one completed round trip, zero winners, $5.93 simulated fees, maximum observed drawdown 0.289%, no overall trading halt. Synthetic next-open price, simulated fees/spreads/slippage and gap behavior may differ from actual exchange execution.

## Operational separation

- Stock Atlas on Railway: online and monitoring Trading 212 DEMO. Existing 4 unsafe council approvals / 0 confirmed fills out of 5 submitted buy orders remain **unresolved**. This crypto council does not overwrite or repair the original stock council on Railway's persistent volume.
- Crypto Atlas: the separate Railway service is still **empty and has never deployed** because service configuration was blocked. The code and GitHub tests do not equal a continuously running crypto agent.
- Keep crypto research and trading **PAPER ONLY**. Do not merge as live trading or equip agents with exchange credentials, shell write actions, or arbitrary self-modification.

## Entry gate for further work

1. Keep all simulated trading independent of the existing stock broker and its credentials.
2. Gather fresh forward-running evidence on new, later market data without retuning the observed sample.
3. Improve and independently verify Trading 212 stock order ID / fill reconciliation and the original stock council before resuming automatic stock execution.
4. Review Railway permissions/configuration for a separate cost-capped simulator; do not circumvent platform controls.

**Verdict:** Modular council and reproducible test evidence achieved; profitability, stock council clearance and continuous crypto deployment **not achieved**.
