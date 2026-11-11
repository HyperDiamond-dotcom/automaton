# Atlas paper validation — review-only

This branch adds historical research against the existing Atlas 15-minute breakout signal. It does not connect to a brokerage, accept credentials, or submit orders.

Run `node --test atlas-paper-backtest.test.mjs` and then `node atlas-paper-backtest.mjs` with public-network access.

The runner downloads 30 days of Coinbase 15-minute OHLCV data for BTC, ETH and SOL and rejects missing or non-contiguous candles. It replays signals chronologically, enters at the next bar open, applies 0.60% fees and 0.15% slippage per side, limits one long position to at most 15% of capital, budgets 0.5% of equity per position, and exits by conservative stop-first / 2R target / 24-bar time limit. Reports net return, buy-and-hold comparator, maximum drawdown, trades, win rate, profit factor and fees. Fewer than 30 trades is insufficient sample, not a profit claim.

These are BACKTESTS, not independently verified live or forward paper trades. Do not deploy until code and assumptions are reviewed. A persistent forward journal, independent data checks and at least 30 days of out-of-sample paper performance are still required. Keep all broker risk gates and live-order execution disabled.
