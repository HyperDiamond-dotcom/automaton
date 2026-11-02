# Atlas operational readiness — 2 November 2026 (UTC)

**Infrastructure and public-data research operational. Real-money automated trading NOT READY.**

## Current verified Railway services

Project `4db37eb7-3d3b-4e63-a7c0-cfdafd888b4a`, production `8714d440-4058-4768-a44e-3daaef04c581`.

| Service | State | Evidence |
| --- | --- | --- |
| `@conway/automaton-cli` | Online; stock portfolio DEMO monitoring only | Trading 212 demo bridge connected; 15-minute position reviews; `autoExecute:false`, zero submitted buy orders; core AI agent deliberately paused |
| `atlas-broker-risk-audit` | Successful 15-minute cron | LIVE broker GET-only access verified; zero live positions and zero pending live orders; audit still flags unprotected demo holdings |
| `atlas-crypto-readonly` | Successful 15-minute cron | First completed 08:47 UTC; 31 candidates, 16 qualified and scanned, 0 data errors, 0 LONG_WATCH signals, 0 orders |
| `atlas-stock-daily-readonly` | Successful build and smoke test; normal weekday schedule restored | First smoke test completed 08:51 UTC with 40/40 symbols, 0 failures, 6 LONG_WATCH signals, 0 orders; normal cron `25 22 * * 1-5` UTC |

- Crypto service ID: `3e167414-a5fb-4e62-9688-174ee071fe2a`; source branch `atlas/crypto-paper-20261022`, start `node atlas-crypto-scan.mjs`. Public Coinbase Exchange data, no exchange credentials/order functions.
- Stock daily service ID: `a1744782-1030-462e-bbcc-9cf3cd673904`; source branch `main`, start `node atlas-stock-daily.mjs`. Public unofficial Yahoo daily data, no broker credentials or order functions.
- The 40-stock GitHub Actions workflow contains the original schedule but has no recorded runs; GitHub workflow dispatch returned an Actions-disabled error, so the daily Railway cron is the operational substitute.
- Existing hourly Atlas Railway Health Watch automation has been expanded to check both research cron services and parse structured broker-audit findings.

## Specific blocker to live automated orders

As of the 08:46 UTC broker audit:
- DEMO positions: AAPL_US_EQ 1.9341, MSFT_US_EQ 1.2574, GOOGL_US_EQ 1.9038 shares; **pending stop coverage zero for all three**. The main scanner's GOOGL adverse return alert was around -19%, with REVIEW_ONLY action.
- Broker API read-only GET connectivity to LIVE is verified; there are **0 observed LIVE positions and 0 pending LIVE orders**. Order-writing authority was not established or exercised.
- `STOP_COVERAGE_REQUIRES_MANUAL_REVIEW`, `stockTradeJournalReconciled:false`, `profitabilityDemonstrated:false` and `liveAutoTradingReady:false` remain.
- Do not infer that the new research signals prove a profitable strategy, or that a successful cron/build means the trading/execution controls have passed.

## Remaining safety and engineering gates

- [ ] Establish approved manual policy for demo protective orders and verify exact quantities, duration, order status, partial fills, slippage and lifecycle (stop orders do not guarantee execution price).
- [ ] Independently reconcile broker order IDs, fills, rejects, cash, fees, FX and a persisted strategy journal; prove restart-safe idempotency and no duplicate orders.
- [ ] Test broker/market outage fail-closed behaviour, max position exposure, per-order/day loss limits, stale data/market-hours validation and durable emergency kill switch.
- [ ] Verify forward out-of-sample paper-trading performance net of spread, fees and slippage; monitoring observations are not a profitability record.
- [ ] Review code provenance, agent permissions, key rotation and least-privilege API keys; keep demo and live accounts separated.
- [ ] Obtain explicit separate user authorization before any live order placement or auto-execution, once all checks pass.

**No order execution, credential changes, crypto account access or paid AI agents were enabled in this recovery.**
