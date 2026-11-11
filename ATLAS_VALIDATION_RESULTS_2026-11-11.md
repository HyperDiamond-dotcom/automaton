# Atlas historical validation results — 11 November 2026

**Status: NOT PROFITABLE / NOT LIVE READY**

These are isolated historical simulations, **not real-time paper orders or real returns**. Each row models a separate $1,000 account, so do not add their P&L together as if they were a single portfolio. Source: Coinbase Exchange public 15-minute OHLCV. Same Atlas `analyzeCandles` signal implementation.

| Pair | Simulated trades | Simulated return | Buy-and-hold | Max drawdown | Wins | Fees paid |
|---|---:|---:|---:|---:|---:|---:|
| BTC-USD | 8 | -1.952% | -13.156% | 1.952% | 0.00% | $14.26 |
| ETH-USD | 14 | -3.690% | -19.461% | 3.801% | 7.14% | $24.71 |
| SOL-USD | 14 | -3.959% | -23.590% | 4.033% | 7.14% | $24.68 |

Tested candles: 2026-10-13T22:45:00.000Z to 2026-11-11T09:00:00.000Z (2730 evaluated bars per market after 150-bar warmup).

Model assumptions: 0.60% fees per side; 0.15% slippage per side; next-bar-open entry; no leverage; maximum 15% capital exposure; 0.5% risk budget per trade; stop before target on intrabar collisions; 24-bar maximum hold. No market orders were placed.

This is **one historical window** and none of the three markets has 30 completed simulated trades. Returns were negative across all three markets after assumed costs. The smaller drawdowns versus buy-and-hold are not evidence of a profitable strategy. No backtest alone proves the future.

Safety gates: keep `executionAllowed=false`, reconcile the three uncovered positions on Trading 212 DEMO, add a separate durable forward-trading journal, obtain at least 30 days of out-of-sample paper results, and review the strategy and cost model before any live trading decision.
