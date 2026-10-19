# Atlas V3 read-only recovery — 19 October 2026

## Live assessment
- Railway scanner and Trading 212 DEMO connection are running; autonomous Conway AI reports HTTP 401 for credit authentication and sleeps. This needs legitimate credential troubleshooting or runtime decoupling, not more risk-taking.
- Evidence reporter shows five submitted BUY requests, zero independently confirmed fills and four unsafe council flags. These aggregates cannot be matched to broker orders until IDs are captured.
- Runtime startup scripts and patches remain on Railway's persistent volume, outside GitHub. Git is missing in the image; Railway has an unapplied apt package change staged.
- Strategy edge and profitability are NOT demonstrated.

## This branch
- atlas/audit-demo.mjs: no order endpoints; requests only account, positions, pending orders and historical orders from demo.trading212.com; conservative history rate limiting; uncertainty flagged. Credentials are read from process environment, never committed.
- atlas/demo-risk.mjs: pure fail-closed DEMO purchase gate (15% notional allocation, 0.75% risk/trade, max five positions); blocks unverified council, ledger, currency conversion and live endpoint. NOT YET WIRED to the active trading bridge.
- atlas/audit-demo.test.mjs: offline fixture tests.

## Execute next, in order
1. Resolve Conway 401 authentication via approved configuration or isolate the disabled Conway AI loop from the watch-only scanner.
2. Run the audit inside the existing Railway service with broker DEMO variables to obtain historical orders and identify per-order IDs. Collect pending/rejected/filled states and reconcile with Atlas journal. This code is not itself running in Railway.
3. Inspect each of the four unsafe council approvals against real decision logs. Require positive verification, not merely an aggregate counter.
4. Recover exactly the installed patch and startup files from the Railway persistent volume and commit reviewed, redacted source versions. Never replace an installed file that differs without a side-by-side diff.
5. Before any automatic DEMO orders, wire the risk gate to authoritative exposure, currency-adjusted quote prices and stop levels, and persistent order idempotency.
6. Demonstrate reconciled fills, fees, FX, slippage, profit factor and out-of-sample forward performance. Only then reassess the DEMO strategy.

Do not merge/deploy this branch directly without review. Live trading remains prohibited.
