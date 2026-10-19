# Atlas Crypto Strategy Backtest

Research-only backtest on Coinbase Exchange BTC-USD and ETH-USD 15-minute candles, using **next-candle open** simulated execution rather than same-candle hindsight. Read-only public API; no trading credentials or order submission.

```bash
node --test atlas/*.test.mjs
node atlas/crypto-backtest.mjs 30
ATLAS_BACKTEST_REPORT=backtest-report.json node atlas/crypto-backtest.mjs 30
```

The backtest models a 0.04% bid–ask spread, 0.1% additional slippage and 0.6% fee per side. It reuses the same portfolio, 3% stop, 6% target, maximum 10% single position, maximum 20% exposure and 5% portfolio drawdown halt as the paper engine.

**Interpretation:** simulation only. Stops and targets are evaluated at the next 15-minute bar's opening price; intra-bar price movement is NOT modelled and execution is not guaranteed. A short positive result would not establish profitability; no live funds should be committed without longer out-of-sample testing and reconciled order evidence. Coinbase API can return sparse candles; the script stops if aligned contiguous candles aren't available.

Separate crypto Railway project/service exists but is **empty, unconfigured and has never deployed**. Previous Railway configuration was blocked, so this script is not scheduled or live. GitHub Actions automated CI is queued; local Node tests provide independent verification.
