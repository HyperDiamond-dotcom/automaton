# Atlas deployment gate — 22 October 2026

## Current known facts
- Main Automaton Railway service: online; scanner reads Trading 212 **DEMO**.
- Main scanner reports AAPL, MSFT, GOOGL positions; confirms API checks.
- Evidence reports include `confirmedFilledBuyOrders: 0`, `unsafeCouncilApprovals: 4`, and GOOGL below a review-only stop threshold. These must not be interpreted as profitability.
- Scanner runs from a script under persistent Railway volume `/root/.automaton/start-atlas-v2.sh`, so GitHub commits alone do not replace that volume script.
- A historical staged `RAILPACK_DEPLOY_APT_PACKAGES` change exists on the main service. Do not accept it without reviewing its effect.

## Crypto pilot
- `atlas-crypto-scan.mjs` is public market data only, BTC-USD and ETH-USD, closed 15-minute candles.
- Computes EMA(12), EMA(26), 20-candle breakout watch, and ATR(14).
- Fail-closed on malformed, missing or stale candles. Outputs only READ_ONLY_PAPER_SIGNALS, no paper fills, no real orders, no API keys.
- Run: `node --test atlas-crypto-core.test.mjs` and `node atlas-crypto-scan.mjs`.
- Deployment: dedicated Railway cron service every 15 minutes. Don't place the scanner on a 24/7 always-on service unnecessarily.

## Required before any live-money activation
1. Eliminate all unsafe council approvals and demonstrate hard rejection in tests.
2. Broker order lifecycle reconciliation: submitted, accepted, filled, partial fill, rejected, cancelled.
3. Reconcile existing positions, cash, order IDs and duplicates after restarts.
4. Add independent max position, max notional, daily loss, stale quote, market-hours and kill-switch guards.
5. Establish an auditable rolling paper-trading performance sample, including fees/slippage/drawdowns.
6. Review and deliberately authorize a fixed small live-money limit in a separate step.
7. Keep the crypto monitor isolated from any order execution or wallet withdrawal permissions.
