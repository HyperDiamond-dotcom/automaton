# Atlas market expansion — 26 October 2026

## Crypto (existing Railway service)
- Public Coinbase Exchange USD spot data, no credentials or order routes.
- Fixed research candidate list of 31 names, dynamically select at most 20 per 15-minute run based on active spot listings, approximate 24-hour USD turnover >= $1.5 million, bid–ask spread <= 0.7%, and quote age <= 15 minutes. BTC and ETH are included only if they independently qualify.
- Reject incomplete, stale, duplicated or sparse candle data with existing safety logic.
- First isolated public-data smoke test (26 October): 20 of 20 markets scanned, zero data errors, four LONG_WATCH signals, zero orders.
- This is a **watchlist**, not an execution instruction or demonstrated trading edge. The strategy must be evaluated out-of-sample with fees, slippage and spreads.

## US stocks and ETFs (independent GitHub Actions research)
- Covers 40 distinct US stocks and ETFs across sectors, rather than 3 existing portfolio positions.
- Scheduled weekdays 22:25 UTC, well after the latest expected US session close, plus manual dispatch and tests on source changes.
- Uses public, unofficial Yahoo Finance 6-month daily chart data; this endpoint is not a guaranteed feed and may stop working or rate-limit. The job fails on retrieval errors rather than inventing prices.
- Screens only completed day bars for 20/50-day moving averages, recent highs and a minimum average 20-day dollar turnover of $20 million. LONG_WATCH is a research signal only.
- Independent isolated public-data smoke test (26 October): all 40 symbols parsed successfully, three LONG_WATCH signals, zero orders.
- Does not connect to Trading 212, use broker credentials, submit orders, call paid AI or write to financial accounts.
- GitHub Actions scheduled jobs can be delayed or skipped; review run results and logs rather than assuming a daily report is delivered.
- US stock market chart data is unadjusted; corporate actions and survivorship can impact analysis. No claim of profitability or completeness of US listings.

## Blockers before any actual trading
- Four unsafe council approvals reported on existing Railway volume-backed stock runtime.
- Zero independently confirmed stock buy fills in the current evidence reporter, and GOOGL stop-threshold review still unresolved.
- Provider-side rotation of existing Railway API credentials remains recommended.
- Order reconciliation, durable kill switch, capital limits, cash/FX reconciliation, broker stop coverage, and cost-adjusted forward performance must be independently verified.
- Auto order execution remains disabled; the new scanners intentionally contain no trading functions.
