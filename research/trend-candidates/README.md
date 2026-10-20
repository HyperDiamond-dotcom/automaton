# Research: Heikin-Ashi vs longer-term trend following (not trading)

## Pre-declared rules — chosen before observing results
1. **Heikin-Ashi**: on *daily RTH aggregated real OHLC* candles, enter one long micro Nasdaq contract after 2 consecutive green HA candles and a real daily close above its 20-day SMA; exit after 2 red HA candles or close below SMA20.
2. **Donchian 20/10 breakout**: enter long if the last real close exceeds the prior 20 completed RTH daily highs; exit below the prior 10 RTH daily lows.
3. **Time-series momentum, 63 sessions**: enter long if daily close is above the level 63 complete RTH sessions ago; exit on a negative 63-day return. This is a *simplified single-asset* interpretation of the broader academic momentum effect, **not** the published 12-month diversified portfolio strategy.

For each, decisions occur **after the signal day closes**, execute at the following **real RTH daily opening price**; HA synthetic prices are only signals and NEVER fill levels. One hypothetical MNQ contract ($2/NQ point), modelled $1.50 broker/exchange fees each side and 0.25 NQ point adverse slippage each side. All models use a 2×14-day ATR trailing stop, simulated mark-to-market max 5% account drawdown halt, separate fictional $25k initial capital for each 2025 and 2026 result, flat at end. Stops can fail with gaps. No short selling, no leverage/capital financing model, no intraday strategy and no trade order capability.

## Market data
Read the three third-party stitched NQ one-minute CSVs from [kfccolonel1/BARS](https://github.com/kfccolonel1/BARS): 2024-06-21 to 2024-12-31 (warm-up), 2025-01-01 to 2025-12-31, and 2026-01-01 to 2026-10-08. RTH bars are 09:30 to 15:59 New York time; only **fully contiguous 390-minute** days are accepted. Real source is reported with SHA256. These NQ prices are **unadjusted front-month** values with quarterly roll jumps, and stitched data provenance/rights are not independently verified. A genuine roll-adjusted continuous future or verified front-contract trade simulator is needed for production-quality conclusions.

Two retrospective periods are reported **without parameter fitting**: 2025 development, 2026 later sample. A buy-and-hold single MNQ benchmark is reported to avoid mistaking a bull market for alpha. The 2026 period was seen in *a different previous strategy* (JJ Simon); therefore this is not strictly untouched data. Future forward testing remains necessary.

## Run
    node --test research/trend-candidates/study.test.mjs
    node research/trend-candidates/study.mjs nq-2024.csv nq-2025.csv nq-2026.csv report.json

No order submission, API keys, Railway deployment, funding, trading APIs, or recurring cost is part of this experiment. Do not merge into the existing stock Atlas runtime. Research-backed *families* do not imply a demonstrated profit edge in this instrument.

References:
- [TradingView on Heikin-Ashi synthetic backtest fills](https://www.tradingview.com/support/solutions/43000481029-strategy-produces-unrealistic-results-on-non-standard-chart-types-heikin-ashi-renko-etc/)
- [Time series momentum, Moskowitz/Ooi/Pedersen, Journal of Financial Economics (2012)](https://doi.org/10.1016/j.jfineco.2011.11.003)
- [BARS dataset notes](https://github.com/kfccolonel1/BARS)
