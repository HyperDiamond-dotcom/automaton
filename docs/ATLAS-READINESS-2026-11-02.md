# Atlas operational readiness — 2 November 2026

**Status: ONLINE IN MONITORING MODE; NOT READY FOR LIVE AUTO-EXECUTION.**

## Confirmed runtime state (UTC)

- Railway project `4db37eb7-3d3b-4e63-a7c0-cfdafd888b4a`, production environment `8714d440-4058-4768-a44e-3daaef04c581`.
- `@conway/automaton-cli` is online and volume-backed. Startup log: `DEMO trading enabled: false`, `ATLAS MONITORING MODE: core agent paused; paid AI requests disabled`.
- Trading 212 DEMO bridge verifies roughly every 5 minutes. Main stock scanner reports ~15-minute position reviews; zero new buy submissions/fills and `autoExecute:false`.
- Independent `atlas-broker-risk-audit` cron executes successfully. LIVE broker GET-only preflight is authenticated, showing 0 live positions and 0 pending live orders. This does NOT validate write permissions or trading readiness.
- **Unresolved demo risk:** AAPL_US_EQ, MSFT_US_EQ and GOOGL_US_EQ have zero pending stop coverage. `STOP_COVERAGE_REQUIRES_MANUAL_REVIEW`; GOOGL's ~19% adverse demo P&L alert is `REVIEW_ONLY`. No independently reconciled strategy journal or validated profitability.
- 31-crypto candidate research is documented in `docs/ATLAS-MARKET-EXPANSION.md`; no active crypto scan markers observed in ~15 hours of current runtime logs, so crypto activity is **unverified**.
- 40-stock/ETF read-only daily GitHub Actions workflow exists; current execution status was not confirmed.
- Latest deployments for both services are SUCCESS. A historical audit build failure on 31 Oct was superseded and should not be reported as a current crash.

## Agent roles and benefits

1. **Market researcher**: broader stock and crypto signal discovery. Read-only until strategy quality is proven.
2. **Risk guardian**: capital exposure, stop coverage, stale data and circuit breakers. Highest priority.
3. **Trade auditor/reconciler**: match order IDs, broker fills, rejections, FX/fees, positions and durable journal to prevent duplicates or unsupported profitability claims.
4. **Coding/debugging agent**: isolated code repair and tests, with no financial write tools.
5. **Coordinator**: aggregate clear reports with strict AI spending budget; currently intentionally paused.
6. **Execution agent**: disabled pending formal safety gates and explicit separate go-live consent.

## Repair checklist

- [ ] Manually review protective-order policy and DEMO stop coverage on all three positions; do not automatically place/cancel orders.
- [ ] Verify real crypto scanner runtime, feed freshness, bounded logs and fail-closed behaviour; crypto order execution stays disabled.
- [ ] Reconcile complete broker order history to a durable strategy journal, including fees, cash, FX, partial fills, rejects and restart recovery.
- [ ] Test caps on order size, daily loss, max open positions, circuit breakers, market hours, quote age, protective stops and order-id deduplication.
- [ ] Validate a forward paper-trading record net of costs before considering live order permissions.
- [ ] Independently inspect daily GitHub Actions research runs; make stock, crypto, paused agent and risk warning statuses visible separately.
- [ ] Rotate/restrict broker credentials at provider if warranted; never store keys in version control.
- [ ] Obtain fresh explicit authorization before any real-money order execution or activation.

This report made **no trading, broker credential, deployment or paid AI activation changes**.
